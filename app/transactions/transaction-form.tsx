"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createTransaction, type FormState } from "./actions"

const initialState: FormState = { error: null }

export function TransactionForm() {
  const [state, formAction, isPending] = useActionState(
    createTransaction,
    initialState
  )

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="category">Категория</Label>
          <Input id="category" name="category" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="amount">Сумма</Label>
          <Input
            id="amount"
            name="amount"
            placeholder="-500 или 1000,50"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="note">Заметка</Label>
          <Input id="note" name="note" />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохраняю…" : "Добавить"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  )
}
