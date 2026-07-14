import { describe, expect, it } from "vitest"
import { formatDate } from "./dates"

describe("formatDate", () => {
  it("показывает дату в московском времени независимо от таймзоны сервера", () => {
    // 22:30 UTC 13-го — в Москве (UTC+3) уже 01:30 14-го.
    expect(formatDate(new Date("2026-07-13T22:30:00Z"))).toBe("14.07.2026")
  })
})
