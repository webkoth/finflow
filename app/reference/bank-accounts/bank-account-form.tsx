"use client"

import { useActionState, useEffect, useRef } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBankAccount, updateBankAccount } from "./actions"

type FormState = { error: string | null }
export type EditingBankAccount = {
  id: string
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
}

const initial: FormState = { error: null }

export function BankAccountForm({
  editing,
  cancelHref,
}: {
  editing?: EditingBankAccount
  cancelHref: string
}) {
  const [state, formAction, isPending] = useActionState(
    editing ? updateBankAccount : createBankAccount,
    initial
  )
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null && !editing) {
      formRef.current?.reset()
    }
    wasPending.current = isPending
  }, [isPending, state, editing])

  return (
    <form
      ref={formRef}
      action={formAction}
      key={editing?.id ?? "new"}
      className="space-y-4 rounded-lg border p-4"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Название счёта</Label>
          <Input id="name" name="name" defaultValue={editing?.name} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="accountNumber">Номер счёта</Label>
          <Input
            id="accountNumber"
            name="accountNumber"
            defaultValue={editing?.accountNumber}
            inputMode="numeric"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bankName">Банк</Label>
          <Input
            id="bankName"
            name="bankName"
            defaultValue={editing?.bankName}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bankBic">БИК</Label>
          <Input
            id="bankBic"
            name="bankBic"
            defaultValue={editing?.bankBic}
            inputMode="numeric"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="currency">Валюта</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={editing?.currency ?? "RUB"}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="organization">Организация</Label>
          <Input
            id="organization"
            name="organization"
            defaultValue={editing?.organization}
            required
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохраняю…" : editing ? "Сохранить" : "Добавить"}
        </Button>
        {editing && (
          <a
            href={cancelHref}
            className={buttonVariants({ variant: "outline" })}
          >
            Отмена
          </a>
        )}
      </div>
    </form>
  )
}
