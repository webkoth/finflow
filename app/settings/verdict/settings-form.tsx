// app/settings/verdict/settings-form.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveVerdictSettings, type FormState } from "./actions"

const initialState: FormState = { error: null }

export type ThresholdField = { key: string; label: string; value: number }
export type CheckField = { checkId: string; label: string; include: boolean }

export function SettingsForm({
  thresholds,
  checks,
}: {
  thresholds: ThresholdField[]
  checks: CheckField[]
}) {
  const [state, formAction, isPending] = useActionState(
    saveVerdictSettings,
    initialState
  )

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Пороги</h2>
        {thresholds.map((t) => (
          <div key={t.key} className="grid max-w-md gap-1.5">
            <Label htmlFor={t.key}>{t.label}</Label>
            <Input
              id={t.key}
              name={t.key}
              type="number"
              step="1"
              min="0"
              required
              defaultValue={t.value}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Учитывать в вердикте</h2>
        {checks.map((c) => (
          <label key={c.checkId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={`include_${c.checkId}`}
              defaultChecked={c.include}
              className="size-4 accent-primary"
            />
            {c.label}
          </label>
        ))}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняю…" : "Сохранить"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.saved && !state.error && (
        <p className="text-sm text-muted-foreground">Сохранено</p>
      )}
    </form>
  )
}
