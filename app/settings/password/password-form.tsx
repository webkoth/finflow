// app/settings/password/password-form.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changePassword, type FormState } from "./actions"

const initialState: FormState = { error: null }

export function PasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePassword,
    initialState
  )

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="oldPassword">Старый пароль</Label>
        <Input
          id="oldPassword"
          name="oldPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="newPassword">Новый пароль</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="repeat">Новый пароль ещё раз</Label>
        <Input
          id="repeat"
          name="repeat"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняю…" : "Сменить пароль"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">Пароль изменён</p>}
    </form>
  )
}
