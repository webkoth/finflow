import { describe, expect, it } from "vitest"
import { groupDailyCashflow, summarizeByCategory } from "./transactions"

describe("summarizeByCategory", () => {
  it("возвращает пустой массив для пустого входа", () => {
    expect(summarizeByCategory([])).toEqual([])
  })

  it("группирует и суммирует по категориям", () => {
    const result = summarizeByCategory([
      { category: "Продукты", amountMinor: -100 },
      { category: "Зарплата", amountMinor: 500 },
      { category: "Продукты", amountMinor: -250 },
    ])
    expect(result).toEqual([
      { category: "Зарплата", totalMinor: 500 },
      { category: "Продукты", totalMinor: -350 },
    ])
  })

  it("сортирует категории по алфавиту (ru)", () => {
    const result = summarizeByCategory([
      { category: "Ужин", amountMinor: 1 },
      { category: "Аренда", amountMinor: 1 },
    ])
    expect(result.map((r) => r.category)).toEqual(["Аренда", "Ужин"])
  })
})

describe("groupDailyCashflow", () => {
  const now = new Date("2026-07-15T12:00:00Z") // 15 июля 15:00 МСК

  it("пустой список — непрерывный ряд нулевых дней", () => {
    const points = groupDailyCashflow([], 3, now)
    expect(points).toEqual([
      { date: "2026-07-13", incomeMinor: 0, expenseMinor: 0 },
      { date: "2026-07-14", incomeMinor: 0, expenseMinor: 0 },
      { date: "2026-07-15", incomeMinor: 0, expenseMinor: 0 },
    ])
  })

  it("делит приход и расход по знаку, расход — по модулю", () => {
    const points = groupDailyCashflow(
      [
        { occurredAt: new Date("2026-07-15T09:00:00Z"), amountMinor: 100_00 },
        { occurredAt: new Date("2026-07-15T10:00:00Z"), amountMinor: -40_00 },
        { occurredAt: new Date("2026-07-15T11:00:00Z"), amountMinor: 5_00 },
      ],
      1,
      now
    )
    expect(points).toEqual([
      { date: "2026-07-15", incomeMinor: 105_00, expenseMinor: 40_00 },
    ])
  })

  it("границы суток — московские: 22:30 UTC попадает в следующий день", () => {
    const points = groupDailyCashflow(
      [{ occurredAt: new Date("2026-07-13T22:30:00Z"), amountMinor: 10_00 }],
      2,
      now
    )
    expect(points).toEqual([
      { date: "2026-07-14", incomeMinor: 10_00, expenseMinor: 0 },
      { date: "2026-07-15", incomeMinor: 0, expenseMinor: 0 },
    ])
  })

  it("транзакции вне периода отбрасываются", () => {
    const points = groupDailyCashflow(
      [{ occurredAt: new Date("2026-07-10T12:00:00Z"), amountMinor: 10_00 }],
      2,
      now
    )
    expect(points.every((p) => p.incomeMinor === 0)).toBe(true)
  })
})
