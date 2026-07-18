// app/settings/users/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/passwords"
import { requireAction } from "@/lib/auth/session"
import type { UserRole } from "@prisma/client"

export type FormState = { error: string | null }

const ROLES: UserRole[] = ["owner", "accountant", "viewer"]

function parseRole(value: string): UserRole | null {
  return (ROLES as string[]).includes(value) ? (value as UserRole) : null
}

// Последний активный owner: его нельзя понизить или деактивировать,
// иначе управление пользователями станет недоступно всем.
async function isLastActiveOwner(userId: string): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target || target.role !== "owner" || !target.isActive) return false
  const activeOwners = await prisma.user.count({
    where: { role: "owner", isActive: true },
  })
  return activeOwners <= 1
}

export async function createUser(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_users")
  if (!auth.user) return { error: auth.error }

  const login = String(formData.get("login") ?? "")
    .trim()
    .toLowerCase()
  const name = String(formData.get("name") ?? "").trim()
  const role = parseRole(String(formData.get("role") ?? ""))
  const password = String(formData.get("password") ?? "")

  if (!login) return { error: "Укажите логин" }
  if (!name) return { error: "Укажите имя" }
  if (!role) return { error: "Укажите роль" }
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: `Пароль — минимум ${MIN_PASSWORD_LENGTH} символов` }
  const exists = await prisma.user.findUnique({ where: { login } })
  if (exists) return { error: "Логин уже занят" }

  await prisma.user.create({
    data: { login, name, role, passwordHash: hashPassword(password) },
  })
  revalidatePath("/settings/users")
  return { error: null }
}

export async function updateUserRole(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_users")
  if (!auth.user) return { error: auth.error }

  const userId = String(formData.get("userId") ?? "")
  const role = parseRole(String(formData.get("role") ?? ""))
  if (!role) return { error: "Укажите роль" }
  if (role !== "owner" && (await isLastActiveOwner(userId)))
    return { error: "Нельзя понизить последнего активного собственника" }

  await prisma.user.update({ where: { id: userId }, data: { role } })
  revalidatePath("/settings/users")
  return { error: null }
}

export async function resetUserPassword(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_users")
  if (!auth.user) return { error: auth.error }

  const userId = String(formData.get("userId") ?? "")
  const password = String(formData.get("password") ?? "")
  if (password.length < MIN_PASSWORD_LENGTH)
    return { error: `Пароль — минимум ${MIN_PASSWORD_LENGTH} символов` }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(password) },
  })
  // Новый пароль = все старые сессии пользователя недействительны.
  await prisma.session.deleteMany({ where: { userId } })
  revalidatePath("/settings/users")
  return { error: null }
}

export async function toggleUserActive(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_users")
  if (!auth.user) return { error: auth.error }

  const userId = String(formData.get("userId") ?? "")
  if (userId === auth.user.id)
    return { error: "Нельзя деактивировать самого себя" }

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) return { error: "Пользователь не найден" }
  if (target.isActive && (await isLastActiveOwner(userId)))
    return { error: "Нельзя деактивировать последнего активного собственника" }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !target.isActive },
  })
  if (target.isActive) {
    await prisma.session.deleteMany({ where: { userId } })
  }
  revalidatePath("/settings/users")
  return { error: null }
}
