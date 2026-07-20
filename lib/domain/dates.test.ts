import { describe, expect, it } from "vitest"
import { formatDate, startOfMoscowDay } from "./dates"

describe("formatDate", () => {
  it("показывает дату в московском времени независимо от таймзоны сервера", () => {
    // 22:30 UTC 13-го — в Москве (UTC+3) уже 01:30 14-го.
    expect(formatDate(new Date("2026-07-13T22:30:00Z"))).toBe("14.07.2026")
  })
})

describe("startOfMoscowDay", () => {
  it("возвращает 00:00 по Москве (21:00 UTC предыдущего дня)", () => {
    // 15 июля 12:00 UTC = 15 июля 15:00 МСК → начало суток 15 июля 00:00 МСК
    const result = startOfMoscowDay(new Date("2026-07-15T12:00:00Z"))
    expect(result.toISOString()).toBe("2026-07-14T21:00:00.000Z")
  })

  it("время до 03:00 МСК относится к предыдущим UTC-суткам", () => {
    // 15 июля 22:30 UTC = 16 июля 01:30 МСК → начало суток 16 июля 00:00 МСК
    const result = startOfMoscowDay(new Date("2026-07-15T22:30:00Z"))
    expect(result.toISOString()).toBe("2026-07-15T21:00:00.000Z")
  })
})
