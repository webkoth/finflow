// app/settings/verdict/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  DEFAULT_INCLUDE,
  DEFAULT_THRESHOLDS,
  type CheckId,
} from "@/lib/domain/verdict"
import { THRESHOLD_LABELS } from "./labels"

export type FormState = { error: string | null; saved?: boolean }

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
    const label = THRESHOLD_LABELS[key] ?? key
    const raw = String(formData.get(key) ?? "").replace(",", ".")
    // Пустое поле не превращаем в 0 (Number("") === 0) — это молча
    // сломало бы вердикты; осознанно введённый 0 остаётся валидным.
    if (raw.trim() === "")
      return { error: `Порог «${label}» не заполнен — укажите число` }
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0)
      return { error: `Порог «${label}» должен быть неотрицательным числом` }
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
  return { error: null, saved: true }
}
