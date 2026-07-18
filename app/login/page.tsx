import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/session"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "./login-form"

export const dynamic = "force-dynamic"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Уже залогинен — на главную.
  if (await getCurrentUser()) redirect("/")
  const sp = await searchParams
  const raw = sp.callbackUrl
  const callbackUrl = typeof raw === "string" ? raw : "/"

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вход в finflow</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm callbackUrl={callbackUrl} />
        </CardContent>
      </Card>
    </main>
  )
}
