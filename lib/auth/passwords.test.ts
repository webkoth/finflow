// lib/auth/passwords.test.ts
import { describe, expect, it } from "vitest"
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./passwords"

describe("passwords", () => {
  it("верный пароль проходит проверку", () => {
    const stored = hashPassword("correct horse battery")
    expect(verifyPassword("correct horse battery", stored)).toBe(true)
  })

  it("неверный пароль не проходит", () => {
    const stored = hashPassword("correct horse battery")
    expect(verifyPassword("wrong password", stored)).toBe(false)
  })

  it("одинаковые пароли дают разные хеши (уникальная соль)", () => {
    expect(hashPassword("secret-123")).not.toBe(hashPassword("secret-123"))
  })

  it("хеш имеет формат salt:hash (hex)", () => {
    const stored = hashPassword("secret-123")
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
  })

  it("битое значение в БД не проходит и не бросает", () => {
    expect(verifyPassword("secret-123", "мусор-без-двоеточия")).toBe(false)
    expect(verifyPassword("secret-123", "abc:defg")).toBe(false)
  })

  it("минимальная длина пароля — 8", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })
})
