import { describe, expect, it } from "vitest"
import { formatMoney, parseMoneyToMinor } from "./money"

const norm = (s: string) => s.replace(/[  ]/g, " ")

describe("formatMoney", () => {
  it("форматирует копейки в рубли по ru-RU", () => {
    expect(norm(formatMoney(123456))).toBe("1 234,56 ₽")
  })

  it("форматирует отрицательные суммы", () => {
    expect(norm(formatMoney(-50000))).toBe("-500,00 ₽")
  })
})

describe("parseMoneyToMinor", () => {
  it("разбирает сумму с запятой как десятичным разделителем", () => {
    expect(parseMoneyToMinor("1000,50")).toBe(100050)
  })

  it("разбирает отрицательные целые рубли", () => {
    expect(parseMoneyToMinor("-500")).toBe(-50000)
  })

  it("игнорирует пробелы по краям", () => {
    expect(parseMoneyToMinor(" 12 ")).toBe(1200)
  })

  it("возвращает null для нуля", () => {
    expect(parseMoneyToMinor("0")).toBeNull()
  })

  it("возвращает null для пустой строки", () => {
    expect(parseMoneyToMinor("")).toBeNull()
  })

  it("возвращает null для нечислового ввода", () => {
    expect(parseMoneyToMinor("abc")).toBeNull()
  })

  it("возвращает null для суммы, округляющейся в ноль копеек", () => {
    expect(parseMoneyToMinor("0,004")).toBeNull()
  })

  it("возвращает null при переполнении Int-лимита схемы", () => {
    expect(parseMoneyToMinor("22000000")).toBeNull()
  })
})
