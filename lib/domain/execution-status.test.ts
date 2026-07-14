import { describe, expect, it } from "vitest"
import { executionDeadline } from "./execution-status"

// 11:00 МСК = 08:00 UTC (Москва — фиксированно UTC+3, без переходов).
describe("executionDeadline", () => {
  it("будний день: следующий день, 11:00 МСК", () => {
    // вторник 2026-07-14 → среда 2026-07-15 11:00 МСК
    const payDate = new Date("2026-07-14T10:00:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-15T08:00:00.000Z"
    )
  })

  it("пятница: дедлайн в понедельник", () => {
    // пятница 2026-07-17 → понедельник 2026-07-20 11:00 МСК
    const payDate = new Date("2026-07-17T10:00:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-20T08:00:00.000Z"
    )
  })

  it("суббота: дедлайн в понедельник", () => {
    const payDate = new Date("2026-07-18T10:00:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-20T08:00:00.000Z"
    )
  })

  it("календарный день берётся по МСК, а не по UTC", () => {
    // 23:30 МСК вторника = 20:30 UTC — это ещё вторник по Москве,
    // дедлайн — среда 11:00 МСК
    const payDate = new Date("2026-07-14T23:30:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-15T08:00:00.000Z"
    )
  })
})
