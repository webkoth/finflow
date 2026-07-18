// app/dispatch/actions.ts
"use server"

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAction } from "@/lib/auth/session"
import { computeDispatchReadiness } from "@/lib/domain/dispatch"
import { formatMoneyBig } from "@/lib/domain/money"
import { sendPaymentOrder } from "@/lib/integrations/yandex-messenger"

export type FormState = { error: string | null }

const MAX_FILE_BYTES = 15 * 1024 * 1024

function ordersDir(): string {
  return process.env.PAYMENT_ORDERS_DIR ?? "var/payment-orders"
}

// Пересчёт not_ready ↔ awaiting_confirmation после изменения файла/чата.
async function refreshReadiness(dispatchId: string): Promise<void> {
  const d = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!d || (d.status !== "not_ready" && d.status !== "awaiting_confirmation"))
    return
  const readiness = computeDispatchReadiness({
    hasFile: Boolean(d.filePath),
    hasChatId: Boolean(d.chatId),
  })
  if (readiness.status !== d.status) {
    await prisma.paymentOrderDispatch.update({
      where: { id: dispatchId },
      data: { status: readiness.status },
    })
  }
}

export async function attachDispatchFile(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (!auth.user) return { error: auth.error }

  const dispatchId = String(formData.get("dispatchId") ?? "")
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0)
    return { error: "Выберите файл платёжки" }
  if (file.size > MAX_FILE_BYTES) return { error: "Файл больше 15 МБ" }

  const dispatch = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!dispatch) return { error: "Черновик не найден" }

  const safeName = path.basename(file.name).replace(/[^\wа-яА-ЯёЁ.\-]+/g, "_")
  const dir = ordersDir()
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${dispatchId}-${safeName}`)

  // Пояс безопасности: safeName уже без слешей/спецсимволов, но проверяем
  // итоговый путь явно — инвариант переживёт будущие правки регэкспа.
  const resolvedDir = path.resolve(dir)
  const resolvedPath = path.resolve(filePath)
  if (!resolvedPath.startsWith(resolvedDir + path.sep))
    return { error: "Недопустимое имя файла" }

  await writeFile(filePath, new Uint8Array(await file.arrayBuffer()))

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: { fileName: safeName, filePath },
  })
  await refreshReadiness(dispatchId)
  revalidatePath("/dispatch")
  return { error: null }
}

export async function setDispatchChat(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (!auth.user) return { error: auth.error }

  const dispatchId = String(formData.get("dispatchId") ?? "")
  const chatId = String(formData.get("chatId") ?? "").trim()
  if (!chatId) return { error: "Укажите идентификатор чата" }

  const dispatch = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!dispatch) return { error: "Черновик не найден" }

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: { chatId },
  })
  await refreshReadiness(dispatchId)
  revalidatePath("/dispatch")
  return { error: null }
}

async function send(dispatchId: string, user: { id: string; name: string }) {
  const d = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
    include: { request: true, debit: true },
  })
  if (!d) return { error: "Черновик не найден" }
  // Повтор после ошибки — тот же путь, что и первая отправка.
  if (d.status !== "awaiting_confirmation" && d.status !== "failed")
    return { error: "Черновик не готов к отправке" }
  if (!d.filePath || !d.fileName || !d.chatId)
    return { error: "Не хватает файла или чата" }

  const caption = `Платёжное поручение по заявке №${d.request.number} · ${
    d.request.orgName
  } · ${formatMoneyBig(d.debit.amountMinor, d.request.currency)}`
  const result = await sendPaymentOrder({
    chatId: d.chatId,
    filePath: d.filePath,
    fileName: d.fileName,
    caption,
  })

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: result.ok
      ? {
          status: "sent",
          sentAt: new Date(),
          confirmedById: user.id,
          confirmedBy: user.name,
          error: null,
        }
      : { status: "failed", error: result.error },
  })
  return { error: result.ok ? null : result.error }
}

export async function confirmDispatch(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (!auth.user) return { error: auth.error }
  const result = await send(String(formData.get("dispatchId") ?? ""), auth.user)
  revalidatePath("/dispatch")
  return result
}

export async function confirmAllReady(
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (!auth.user) return { error: auth.error }

  const ready = await prisma.paymentOrderDispatch.findMany({
    where: { status: "awaiting_confirmation" },
    select: { id: true },
  })
  if (ready.length === 0) return { error: "Готовых к отправке нет" }

  const failures: string[] = []
  for (const d of ready) {
    const result = await send(d.id, auth.user)
    if (result.error) failures.push(result.error)
  }
  revalidatePath("/dispatch")
  return failures.length > 0
    ? { error: `Ошибок: ${failures.length} — ${failures[0]}` }
    : { error: null }
}

export async function skipDispatch(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (!auth.user) return { error: auth.error }

  const dispatchId = String(formData.get("dispatchId") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!reason) return { error: "Укажите причину пропуска" }

  const d = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!d) return { error: "Черновик не найден" }
  if (d.status === "sent") return { error: "Уже отправлено" }

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "skipped",
      skipReason: reason,
      confirmedById: auth.user.id,
      confirmedBy: auth.user.name,
    },
  })
  revalidatePath("/dispatch")
  return { error: null }
}
