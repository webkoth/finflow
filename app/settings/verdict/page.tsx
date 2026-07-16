// app/settings/verdict/page.tsx
import Link from "next/link"
import { CHECK_LABELS, type CheckId } from "@/lib/domain/verdict"
import { loadVerdictSettings } from "@/lib/verdicts"
import {
  SettingsForm,
  type CheckField,
  type ThresholdField,
} from "./settings-form"

export const dynamic = "force-dynamic"

const THRESHOLD_LABELS: Record<string, string> = {
  fundDeficitPercent: "Минус фонда: жёлтая зона до, % от плана недели",
  oldPartnerMonths: "«Давно не работали» после, месяцев",
  minOperationsForConstant: "«Постоянный контрагент» от, платежей",
}

export default async function VerdictSettingsPage() {
  const settings = await loadVerdictSettings()
  const thresholds: ThresholdField[] = Object.entries(settings.thresholds).map(
    ([key, value]) => ({ key, label: THRESHOLD_LABELS[key] ?? key, value })
  )
  const checks: CheckField[] = (Object.keys(settings.include) as CheckId[]).map(
    (checkId) => ({
      checkId,
      label: CHECK_LABELS[checkId],
      include: settings.include[checkId],
    })
  )

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link
          href="/requests"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← К реестру
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Настройки светофора</h1>
      <p className="text-sm text-muted-foreground">
        Пороги проверок и участие каждой проверки в общем вердикте. Изменения
        действуют сразу — вердикт вычисляется при открытии страниц.
      </p>
      <SettingsForm thresholds={thresholds} checks={checks} />
    </main>
  )
}
