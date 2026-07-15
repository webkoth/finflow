"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addExecutionComment, type FormState } from "./actions"

const initialState: FormState = { error: null }

export function CommentForm({ uid }: { uid: string }) {
  const [state, formAction, isPending] = useActionState(
    addExecutionComment,
    initialState
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="uid" value={uid} />
      <div className="grid gap-1.5">
        <Label htmlFor="author">Автор</Label>
        <Input id="author" name="author" required className="max-w-xs" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="text">Комментарий</Label>
        <Textarea
          id="text"
          name="text"
          required
          placeholder="Например: оплата перенесена, ждём подтверждение договора"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняю…" : "Добавить комментарий"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  )
}
