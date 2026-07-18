// lib/auth/session.ts
// Cookie-сессии: токен у клиента, SHA-256-хеш токена в БД.
// Cookie живёт 90 дней; сессия в БД — 30 со скользящим продлением при
// активности (итог: активные пользователи не разлогиниваются до 90 дней,
// неактивные больше 30 дней — выпадают).
import { createHash, randomBytes } from "node:crypto"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { can, type Action, type Role } from "@/lib/domain/permissions"
import type { User } from "@prisma/client"

export const SESSION_COOKIE = "finflow_session"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000
const COOKIE_MAX_AGE_S = 90 * 24 * 60 * 60

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

// Создаёт сессию и ставит cookie. Вызывать только из server actions.
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex")
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_S,
    path: "/",
  })
}

// Удаляет текущую сессию и cookie. Вызывать только из server actions.
export async function endSession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  store.delete(SESSION_COOKIE)
}

// Текущий пользователь; cache() — один запрос к БД на рендер.
// null: нет cookie, сессия не найдена/истекла, пользователь деактивирован.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session || !session.user.isActive) return null
  const now = Date.now()
  if (session.expiresAt.getTime() <= now) return null
  // Скользящее продление не чаще раза в сутки.
  if (session.expiresAt.getTime() - now < SESSION_TTL_MS - RENEW_AFTER_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(now + SESSION_TTL_MS) },
    })
  }
  return session.user
})

// Для страниц: нет валидной сессии (протухшая кука, деактивация) → на /login.
// Иначе страница тихо отрендерилась бы для «viewer» — читать мог бы кто угодно
// с мёртвой кукой (требование ревью: DoD «без сессии → /login» для чтения тоже).
export async function requirePageUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

export type AuthResult =
  { user: User; error?: never } | { user?: never; error: string }

// Проверка права в server actions: возвращает { error }, не бросает
// (паттерн ожидаемых ошибок CLAUDE.md).
export async function requireAction(action: Action): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Требуется вход" }
  if (!can(user.role as Role, action)) return { error: "Недостаточно прав" }
  return { user }
}

export async function requireUser(): Promise<AuthResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Требуется вход" }
  return { user }
}
