// components/app-header.tsx
// Server component: имя, роль, «Выйти». null — на /login (пользователя нет).
import Link from "next/link"
import { getCurrentUser } from "@/lib/auth/session"
import { logout } from "@/app/login/actions"
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export async function AppHeader() {
  const user = await getCurrentUser()
  if (!user) return null

  return (
    <header className="flex items-center justify-between border-b px-6 py-2">
      <Link href="/" className="font-medium">
        finflow
      </Link>
      <div className="flex items-center gap-3 text-sm">
        <span>{user.name}</span>
        <Badge variant="outline">{ROLE_LABELS[user.role as Role]}</Badge>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Выйти
          </Button>
        </form>
      </div>
    </header>
  )
}
