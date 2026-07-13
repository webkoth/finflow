import { describe, expect, it } from "vitest"
import { formatMoney } from "./money"

const norm = (s: string) => s.replace(/[  ]/g, " ")

describe("formatMoney", () => {
  it("форматирует копейки в рубли по ru-RU", () => {
    expect(norm(formatMoney(123456))).toBe("1 234,56 ₽")
  })

  it("форматирует отрицательные суммы", () => {
    expect(norm(formatMoney(-50000))).toBe("-500,00 ₽")
  })
})
