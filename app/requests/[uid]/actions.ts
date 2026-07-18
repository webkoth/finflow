// app/requests/[uid]/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { requireAction } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { computeExecutionStatus } from "@/lib/domain/execution-status"
import { approveBids, declineBid } from "@/lib/integrations/one-c"

export type FormState = { error: string | null }

// Объяснение бухгалтера к заявке (обычно — почему красная).
// Автор берётся из сессии (снапшот имени на момент записи).
export async function addExecutionComment(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("comment_execution")
  if (!auth.user) return { error: auth.error }

  const uid = String(formData.get("uid") ?? "")
  const text = String(formData.get("text") ?? "").trim()
  if (!text) return { error: "Комментарий не может быть пустым" }

  const request = await prisma.paymentRequest.findUnique({ where: { uid } })
  if (!request) return { error: "Заявка не найдена" }

  await prisma.executionComment.create({
    data: {
      requestId: request.id,
      authorId: auth.user.id,
      author: auth.user.name, // снапшот имени на момент записи
      text,
    },
  })

  revalidatePath(`/requests/${uid}`)
  revalidatePath("/requests")
  return { error: null }
}

// Согласование уходит в 1С; при успехе статус в своей БД обновляется
// оптимистично — следующий синк из DWH его подтвердит.
export async function approveRequest(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("approve_requests")
  if (!auth.user) return { error: auth.error }

  const uid = String(formData.get("uid") ?? "")
  const request = await prisma.paymentRequest.findUnique({
    where: { uid },
    include: { _count: { select: { debits: true } } },
  })
  if (!request) return { error: "Заявка не найдена" }
  if (request.isDeletedIn1c) return { error: "Заявка удалена в 1С" }
  if (request.approvalStatus !== "on_approval")
    return { error: "Заявка уже обработана" }

  const res = await approveBids([uid])
  if (!res.ok) return { error: res.error }

  await prisma.paymentRequest.update({
    where: { uid },
    data: {
      approvalStatus: "approved",
      executionStatus: computeExecutionStatus(
        {
          approvalStatus: "approved",
          payDate: request.payDate,
          hasDebits: request._count.debits > 0,
        },
        new Date()
      ),
    },
  })

  revalidatePath(`/requests/${uid}`)
  revalidatePath("/requests")
  return { error: null }
}

export async function declineRequest(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("approve_requests")
  if (!auth.user) return { error: auth.error }

  const uid = String(formData.get("uid") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!reason) return { error: "Укажите причину отклонения" }

  const request = await prisma.paymentRequest.findUnique({
    where: { uid },
    include: { _count: { select: { debits: true } } },
  })
  if (!request) return { error: "Заявка не найдена" }
  if (request.isDeletedIn1c) return { error: "Заявка удалена в 1С" }
  if (request.approvalStatus !== "on_approval")
    return { error: "Заявка уже обработана" }

  const res = await declineBid(uid, reason)
  if (!res.ok) return { error: res.error }

  await prisma.paymentRequest.update({
    where: { uid },
    data: {
      approvalStatus: "declined",
      executionStatus: computeExecutionStatus(
        {
          approvalStatus: "declined",
          payDate: request.payDate,
          hasDebits: request._count.debits > 0,
        },
        new Date()
      ),
    },
  })

  revalidatePath(`/requests/${uid}`)
  revalidatePath("/requests")
  return { error: null }
}
