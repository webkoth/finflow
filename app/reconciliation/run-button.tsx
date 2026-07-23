"use client"

import { useActionState } from "react"
import { runManualReconciliation, type FormState } from "./actions"
import { Button } from "@/components/ui/button"

const initial: FormState = { error: null }

export function RunButton() {
  const [state, action, pending] = useActionState(
    runManualReconciliation,
    initial
  )
  return (
    <form action={action}>
      <Button type="submit" disabled={pending}>
        {pending ? "Сверяю…" : "Запустить сверку"}
      </Button>
      {state.error && (
        <span className="ml-2 text-sm text-destructive">{state.error}</span>
      )}
    </form>
  )
}
