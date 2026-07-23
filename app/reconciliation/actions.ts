"use server"

import { revalidatePath } from "next/cache"
import { requireAction } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReconciliation } from "@/lib/sync/run-reconciliation"
import type { ReconResolution } from "@prisma/client"

export type FormState = { error: string | null }

// Ручной запуск прогона сверки за указанный день (или сегодня).
export async function runManualReconciliation(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return { error: auth.error }

  const day = String(formData.get("day") ?? "").trim()
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(day)

  try {
    await runReconciliation(getOneCGateway(), "manual", isDay ? day : undefined)
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Не удалось выполнить сверку",
    }
  }

  revalidatePath("/reconciliation")
  return { error: null }
}

// Перевод расхождения по статусу разбора: new → reviewed → accepted.
export async function resolveDiscrepancy(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return { error: auth.error }

  const id = String(formData.get("id") ?? "").trim()
  const status = String(formData.get("status") ?? "").trim()
  const note = String(formData.get("note") ?? "").trim()
  if (!id) return { error: "Не указано расхождение" }
  if (status !== "reviewed" && status !== "accepted" && status !== "new") {
    return { error: "Недопустимый статус" }
  }

  const disc = await prisma.reconciliationDiscrepancy.findUnique({
    where: { id },
    select: { runId: true },
  })
  if (!disc) return { error: "Расхождение не найдено" }

  await prisma.reconciliationDiscrepancy.update({
    where: { id },
    data: {
      resolutionStatus: status as ReconResolution,
      note: note || null,
      resolvedById: auth.user.id,
      resolvedAt: new Date(),
    },
  })

  revalidatePath(`/reconciliation/${disc.runId}`)
  return { error: null }
}
