// lib/auth/passwords.ts
// Хеширование паролей: scrypt из node:crypto, без внешних зависимостей.
// Формат хранения: "s1:salt:hash", версия — для будущей смены параметров.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const FORMAT_VERSION = "s1"
const SALT_BYTES = 16
const KEY_BYTES = 64

export const MIN_PASSWORD_LENGTH = 8

export function hashPassword(password: string): string {
  const normalized = password.normalize("NFC")
  const salt = randomBytes(SALT_BYTES).toString("hex")
  const hash = scryptSync(normalized, salt, KEY_BYTES).toString("hex")
  return `${FORMAT_VERSION}:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [version, salt, hash] = stored.split(":")
  if (version !== FORMAT_VERSION || !salt || !hash) return false
  const expected = Buffer.from(hash, "hex")
  if (expected.length !== KEY_BYTES) return false
  const candidate = scryptSync(password.normalize("NFC"), salt, KEY_BYTES)
  return timingSafeEqual(candidate, expected)
}
