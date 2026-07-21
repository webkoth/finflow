import { describe, expect, it } from "vitest"
import { formatDate, formatDateTime } from "./dates"

describe("formatDate", () => {
  it("показывает дату в московском времени независимо от таймзоны сервера", () => {
    // 22:30 UTC 13-го — в Москве (UTC+3) уже 01:30 14-го.
    expect(formatDate(new Date("2026-07-13T22:30:00Z"))).toBe("14.07.2026")
  })
})

describe("formatDateTime", () => {
  it("показывает дату и время в московской зоне", () => {
    // 2026-07-21T00:15:00Z = 03:15 по Москве
    const d = new Date("2026-07-21T00:15:00.000Z")
    expect(formatDateTime(d)).toBe("21.07.2026, 03:15")
  })
})
