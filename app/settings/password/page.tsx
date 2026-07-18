// app/settings/password/page.tsx
import { requirePageUser } from "@/lib/auth/session"
import { PasswordForm } from "./password-form"

export const dynamic = "force-dynamic"

export default async function PasswordPage() {
  await requirePageUser()

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Сменить пароль</h1>
      <PasswordForm />
    </main>
  )
}
