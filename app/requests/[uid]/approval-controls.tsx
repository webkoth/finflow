// app/requests/[uid]/approval-controls.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { approveRequest, declineRequest, type FormState } from "./actions"

const initialState: FormState = { error: null }

export function ApprovalControls({ uid }: { uid: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveRequest,
    initialState
  )
  const [declineState, declineAction, declinePending] = useActionState(
    declineRequest,
    initialState
  )

  return (
    <div className="space-y-4">
      <form action={approveAction}>
        <input type="hidden" name="uid" value={uid} />
        <Button type="submit" disabled={approvePending || declinePending}>
          {approvePending ? "Отправляю в 1С…" : "Согласовать"}
        </Button>
        {approveState.error && (
          <p className="mt-2 text-sm text-destructive">{approveState.error}</p>
        )}
      </form>

      <form action={declineAction} className="space-y-2">
        <input type="hidden" name="uid" value={uid} />
        <div className="grid gap-1.5">
          <Label htmlFor="reason">Причина отклонения</Label>
          <Textarea id="reason" name="reason" required />
        </div>
        <Button
          type="submit"
          variant="destructive"
          disabled={approvePending || declinePending}
        >
          {declinePending ? "Отправляю в 1С…" : "Отклонить"}
        </Button>
        {declineState.error && (
          <p className="text-sm text-destructive">{declineState.error}</p>
        )}
      </form>
    </div>
  )
}
