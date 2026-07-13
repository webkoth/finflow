import { describe, expect, it } from "vitest"
import { summarizeByCategory } from "./transactions"

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
