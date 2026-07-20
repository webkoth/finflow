import { describe, expect, it } from "vitest"
import { convertToRubMinor, summarizeBalances } from "./balances"

const rates = new Map([
  ["USD", 80],
  ["CNY", 11.5],
])

describe("convertToRubMinor", () => {
  it("RUB возвращается как есть", () => {
    expect(convertToRubMinor(150_00n, "RUB", rates)).toBe(150_00n)
  })

  it("валюта пересчитывается по курсу (₽ за единицу)", () => {
    // 100 USD в копейках × 80 ₽/USD = 8000 ₽ в копейках
    expect(convertToRubMinor(100_00n, "USD", rates)).toBe(8000_00n)
  })

  it("нет курса — null", () => {
    expect(convertToRubMinor(100_00n, "EUR", rates)).toBeNull()
  })

  it("BigInt-суммы за пределами Int не теряются", () => {
    expect(convertToRubMinor(5_000_000_000_00n, "RUB", rates)).toBe(
      5_000_000_000_00n
    )
  })

  it("дробный курс CNY без округления", () => {
    // 100 CNY в копейках × 11.5 ₽/CNY = 1150 ₽ в копейках
    expect(convertToRubMinor(100_00n, "CNY", rates)).toBe(1150_00n)
  })

  it("дробный курс CNY с округлением границы", () => {
    // 333.33 CNY × 11.5 = 3833.295 ₽; Math.round(3833.295) = 3833.30 ₽
    expect(convertToRubMinor(333_33n, "CNY", rates)).toBe(383330n)
  })

  it("отрицательный остаток (овердрафт)", () => {
    // -100 USD в копейках × 80 ₽/USD = -8000 ₽ в копейках
    expect(convertToRubMinor(-100_00n, "USD", rates)).toBe(-8000_00n)
  })
})

describe("summarizeBalances", () => {
  const account = (currency: string, balanceMinor: bigint) => ({
    orgName: "ООО Тест",
    accountName: "Основной",
    bankName: "Банк",
    currency,
    balanceMinor,
  })

  it("суммирует рублёвые и валютные счета в ₽", () => {
    const s = summarizeBalances(
      [account("RUB", 1000_00n), account("USD", 10_00n)],
      rates
    )
    expect(s).toEqual({
      totalRubMinor: 1800_00n,
      isPartial: false,
      accountCount: 2,
    })
  })

  it("счёт без курса исключается из итога, итог помечается неполным", () => {
    const s = summarizeBalances(
      [account("RUB", 1000_00n), account("EUR", 10_00n)],
      rates
    )
    expect(s).toEqual({
      totalRubMinor: 1000_00n,
      isPartial: true,
      accountCount: 2,
    })
  })

  it("пустой список — ноль без пометок", () => {
    expect(summarizeBalances([], rates)).toEqual({
      totalRubMinor: 0n,
      isPartial: false,
      accountCount: 0,
    })
  })

  it("отрицательный остаток уменьшает итог", () => {
    const s = summarizeBalances(
      [
        account("RUB", 1000_00n),
        account("USD", -50_00n), // овердрафт: -0.50 USD × 80 ₽/USD = -40 ₽
      ],
      rates
    )
    expect(s).toEqual({
      totalRubMinor: -3000_00n, // 1000_00 + (-4000_00) = -3000_00
      isPartial: false,
      accountCount: 2,
    })
  })
})
