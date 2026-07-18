// app/settings/users/page.tsx
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, ROLE_LABELS, type Role } from "@/lib/domain/permissions"
import { formatDate } from "@/lib/domain/dates"
import { UsersTable, type UserRow } from "./users-table"

export const dynamic = "force-dynamic"

export default async function UsersPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.role as Role, "manage_users")) notFound()

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    login: u.login,
    name: u.name,
    role: u.role,
    roleLabel: ROLE_LABELS[u.role as Role],
    isActive: u.isActive,
    createdAtText: formatDate(u.createdAt),
    isSelf: u.id === user.id,
  }))

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Пользователи</h1>
      <p className="text-sm text-muted-foreground">
        Временный пароль передавайте лично; пользователь сменит его на странице
        «Сменить пароль».
      </p>
      <UsersTable users={rows} />
    </main>
  )
}
