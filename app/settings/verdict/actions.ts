// app/settings/verdict/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  DEFAULT_INCLUDE,
  DEFAULT_THRESHOLDS,
  type CheckId,
} from "@/lib/domain/verdict"

export type FormState = { error: string | null }

const THRESHOLD_KEYS = Object.keys(DEFAULT_THRESHOLDS) as Array<
  keyof typeof DEFAULT_THRESHOLDS
>
const CHECK_IDS = Object.keys(DEFAULT_INCLUDE) as CheckId[]

export async function saveVerdictSettings(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const thresholds: Array<{ key: string; value: number }> = []
  for (const key of THRESHOLD_KEYS) {
    const raw = String(formData.get(key) ?? "").replace(",", ".")
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0)
      return { error: `Порог «${key}» должен быть неотрицательным числом` }
    thresholds.push({ key, value })
  }

  for (const t of thresholds) {
    await prisma.verdictThreshold.upsert({
      where: { key: t.key },
      update: { value: t.value },
      create: { key: t.key, value: t.value },
    })
  }
  for (const checkId of CHECK_IDS) {
    // Чекбокс присутствует в форме только если включён.
    const includeInVerdict = formData.get(`include_${checkId}`) === "on"
    await prisma.verdictCheckSetting.upsert({
      where: { checkId },
      update: { includeInVerdict },
      create: { checkId, includeInVerdict },
    })
  }

  revalidatePath("/settings/verdict")
  revalidatePath("/requests")
  return { error: null }
}
