// app/settings/password/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import {
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/lib/auth/passwords"
import { hashToken, requireUser, SESSION_COOKIE } from "@/lib/auth/session"

export type FormState = { error: string | null; ok?: boolean }

export async function changePassword(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireUser()
  if (!auth.user) return { error: auth.error }

  const oldPassword = String(formData.get("oldPassword") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const repeat = String(formData.get("repeat") ?? "")

  // Хеш не покидает lib/auth (SessionUser его не содержит) — точечный select.
  const secret = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { passwordHash: true },
  })
  if (!secret) return { error: "Требуется вход" }
  if (!verifyPassword(oldPassword, secret.passwordHash))
    return { error: "Старый пароль неверен" }
  if (newPassword.length < MIN_PASSWORD_LENGTH)
    return { error: `Новый пароль — минимум ${MIN_PASSWORD_LENGTH} символов` }
  if (newPassword !== repeat) return { error: "Пароли не совпадают" }

  await prisma.user.update({
    where: { id: auth.user.id },
    data: { passwordHash: hashPassword(newPassword) },
  })

  // Все прочие сессии пользователя гасим, текущую оставляем.
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  await prisma.session.deleteMany({
    where: {
      userId: auth.user.id,
      ...(token ? { tokenHash: { not: hashToken(token) } } : {}),
    },
  })

  revalidatePath("/settings/password")
  return { error: null, ok: true }
}
