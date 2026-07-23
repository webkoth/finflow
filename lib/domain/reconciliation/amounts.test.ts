import { describe, expect, it } from "vitest"
import { parseStatementAmount } from "./amounts"

describe("parseStatementAmount", () => {
  it("разбирает сумму с точкой", () => {
    expect(parseStatementAmount("1500.00")).toBe(150000n)
  })

  it("разбирает сумму с запятой", () => {
    expect(parseStatementAmount("1500,50")).toBe(150050n)
  })

  it("игнорирует пробелы-разделители тысяч", () => {
    expect(parseStatementAmount("1 234 567.89")).toBe(123456789n)
  })

  it("дополняет одну цифру дробной части до копеек", () => {
    expect(parseStatementAmount("10.5")).toBe(1050n)
  })

  it("целое без дробной части", () => {
    expect(parseStatementAmount("42")).toBe(4200n)
  })

  it("больше двух знаков дробной части — округляет до копеек", () => {
    expect(parseStatementAmount("10.005")).toBe(1001n)
    expect(parseStatementAmount("10.004")).toBe(1000n)
  })

  it("пустая или нечисловая строка — ошибка", () => {
    expect(() => parseStatementAmount("")).toThrow()
    expect(() => parseStatementAmount("abc")).toThrow()
  })
})
