// app/login/actions.ts
"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { hashPassword, verifyPassword } from "@/lib/auth/passwords"
import { endSession, startSession } from "@/lib/auth/session"
import type { User } from "@prisma/client"

export type FormState = { error: string | null }

// Единое сообщение: не раскрываем, что именно неверно.
const GENERIC_ERROR = "Неверный логин или пароль"

// Выравнивание времени ответа: для несуществующего логина всё равно
// прогоняем scrypt, иначе по скорости ответа можно перечислять логины.
const DUMMY_HASH = hashPassword("timing-equalizer-dummy")

// Ленивый bootstrap первого собственника (спека §5): таблица пуста
// и пара совпала с APP_BOOTSTRAP_LOGIN/PASSWORD → создаём owner.
async function bootstrapOwner(
  login: string,
  password: string
): Promise<User | null> {
  const bootstrapLogin = process.env.APP_BOOTSTRAP_LOGIN?.toLowerCase()
  const bootstrapPassword = process.env.APP_BOOTSTRAP_PASSWORD
  if (!bootstrapLogin || !bootstrapPassword) return null
  if (login !== bootstrapLogin || password !== bootstrapPassword) return null
  const usersCount = await prisma.user.count()
  if (usersCount > 0) return null
  return prisma.user.create({
    data: {
      login,
      name: process.env.APP_BOOTSTRAP_NAME ?? "Собственник",
      role: "owner",
      passwordHash: hashPassword(password),
    },
  })
}

export async function login(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const loginValue = String(formData.get("login") ?? "")
    .trim()
    .toLowerCase()
  const password = String(formData.get("password") ?? "")
  const callbackUrl = String(formData.get("callbackUrl") ?? "/")
  if (!loginValue || !password) return { error: GENERIC_ERROR }

  // Гигиена: подчищаем истёкшие сессии.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })

  let user = await prisma.user.findUnique({ where: { login: loginValue } })
  if (!user) {
    user = await bootstrapOwner(loginValue, password)
    if (!user) {
      verifyPassword(password, DUMMY_HASH) // выравнивание тайминга
      return { error: GENERIC_ERROR }
    }
  } else if (!user.isActive || !verifyPassword(password, user.passwordHash)) {
    return { error: GENERIC_ERROR }
  }

  await startSession(user.id)
  // Защита от open redirect: только внутренние пути.
  redirect(
    callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/"
  )
}

export async function logout(): Promise<void> {
  await endSession()
  redirect("/login")
}
