// lib/auth/passwords.ts
// Хеширование паролей: scrypt из node:crypto, без внешних зависимостей.
// Формат хранения: "salt:hash" (hex), соль 16 байт, ключ 64 байта.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const SALT_BYTES = 16
const KEY_BYTES = 64

export const MIN_PASSWORD_LENGTH = 8

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex")
  const hash = scryptSync(password, salt, KEY_BYTES).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, "hex")
  if (expected.length !== KEY_BYTES) return false
  const candidate = scryptSync(password, salt, KEY_BYTES)
  return timingSafeEqual(candidate, expected)
}
