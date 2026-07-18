"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { computeExecutionStatus } from "@/lib/domain/execution-status"
import { getDwhGateway } from "@/lib/integrations/dwh"
import { approveBids } from "@/lib/integrations/one-c"
import { runSync } from "@/lib/sync/run-sync"
import { computeVerdicts } from "@/lib/verdicts"

// Ручной запуск синка кнопкой «Обновить». Ошибки синка не бросаются —
// они журналируются в SyncRun и видны в строке свежести данных.
export async function refreshData(): Promise<void> {
  await runSync(getDwhGateway(), "manual")
  revalidatePath("/requests")
}

export type FormState = { error: string | null }

export async function bulkApproveRequests(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const uids = formData.getAll("uids").map(String)
  if (uids.length === 0) return { error: "Выберите заявки" }

  const requests = await prisma.paymentRequest.findMany({
    where: {
      uid: { in: uids },
      approvalStatus: "on_approval",
      isDeletedIn1c: false,
    },
    include: { _count: { select: { debits: true } } },
  })
  if (requests.length === 0)
    return { error: "Среди выбранных нет заявок на согласовании" }

  // Клиент мог подделать форму (чекбоксы есть только у 🟢) — перепроверяем
  // вердикт на сервере (ТЗ §6.4).
  const { verdicts } = await computeVerdicts(requests)
  const notGreen = requests.filter((r) => verdicts.get(r.uid)?.level !== "ok")
  if (notGreen.length > 0)
    return {
      error: `Массово можно согласовать только зелёные заявки. Через карточку: ${notGreen
        .map((r) => r.number)
        .join(", ")}`,
    }

  const res = await approveBids(requests.map((r) => r.uid))
  if (!res.ok) return { error: res.error }

  const now = new Date()
  for (const r of requests) {
    await prisma.paymentRequest.update({
      where: { uid: r.uid },
      data: {
        approvalStatus: "approved",
        executionStatus: computeExecutionStatus(
          {
            approvalStatus: "approved",
            payDate: r.payDate,
            hasDebits: r._count.debits > 0,
          },
          now
        ),
      },
    })
  }

  revalidatePath("/requests")
  return { error: null }
}
