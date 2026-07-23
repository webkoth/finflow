// app/settings/users/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/passwords"
import { requireAction } from "@/lib/auth/session"
import { Prisma, type User, type UserRole } from "@prisma/client"

export type FormState = { error: string | null }

const ROLES: UserRole[] = ["owner", "accountant", "viewer"]

function parseRole(value: string): UserRole | null {
  return (ROLES as string[]).includes(value) ? (value as UserRole) : null
}

type Tx = Prisma.TransactionClient

// Последний активный owner: его нельзя понизить или деактивировать,
// иначе управление пользователями станет недоступно всем.
// Вызывать только внутри Serializable-транзакции вместе с записью —
// иначе два параллельных понижения/деактивации разных owner'ов оба
// пройдут проверку независимо (TOCTOU) и активных owner'ов не останется.
async function isLastActiveOwner(
  tx: Tx,
  target: Pick<User, "role" | "isActive">
): Promise<boolean> {
  if (target.role !== "owner" || !target.isActive) return false
  const activeOwners = await tx.user.count({
    where: { role: "owner", isActive: true },
  })
  return activeOwners <= 1
}

// P2034: Postgres откатил одну из параллельных Serializable-транзакций
// (конфликт сериализации) — операция сама по себе валидна, просто нужно
// повторить.
function isSerializationConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034"
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

  try {
    await prisma.user.create({
      data: { login, name, role, passwordHash: hashPassword(password) },
    })
  } catch (e) {
    // Гонка двух одновременных созданий с одинаковым логином: pre-check
    // выше их не разделяет — ловит уникальный индекс БД.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { error: "Логин уже занят" }
    throw e
  }
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

  try {
    const error = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id: userId } })
        if (!target) return "Пользователь не найден"
        if (role !== "owner" && (await isLastActiveOwner(tx, target)))
          return "Нельзя понизить последнего активного собственника"

        await tx.user.update({ where: { id: userId }, data: { role } })
        return null
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    if (error) return { error }
  } catch (e) {
    if (isSerializationConflict(e))
      return { error: "Одновременное изменение — попробуйте ещё раз" }
    throw e
  }

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

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target) return { error: "Пользователь не найден" }

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

  try {
    const error = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id: userId } })
        if (!target) return "Пользователь не найден"
        if (target.isActive && (await isLastActiveOwner(tx, target)))
          return "Нельзя деактивировать последнего активного собственника"

        await tx.user.update({
          where: { id: userId },
          data: { isActive: !target.isActive },
        })
        if (target.isActive) {
          await tx.session.deleteMany({ where: { userId } })
        }
        return null
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
    if (error) return { error }
  } catch (e) {
    if (isSerializationConflict(e))
      return { error: "Одновременное изменение — попробуйте ещё раз" }
    throw e
  }

  revalidatePath("/settings/users")
  return { error: null }
}
