import { describe, expect, it } from "vitest"
import { computeExecutionStatus, executionDeadline } from "./execution-status"

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

describe("computeExecutionStatus", () => {
  const base = {
    approvalStatus: "approved" as const,
    payDate: new Date("2026-07-14T10:00:00+03:00"), // вторник; дедлайн ср 11:00 МСК
    hasDebits: false,
  }

  it("есть списание → executed (даже после дедлайна)", () => {
    const now = new Date("2026-07-20T12:00:00+03:00")
    expect(computeExecutionStatus({ ...base, hasDebits: true }, now)).toBe(
      "executed"
    )
  })

  it("отклонена → declined", () => {
    const now = new Date("2026-07-20T12:00:00+03:00")
    expect(
      computeExecutionStatus({ ...base, approvalStatus: "declined" }, now)
    ).toBe("declined")
  })

  it("не согласована → on_approval", () => {
    const now = new Date("2026-07-20T12:00:00+03:00")
    expect(
      computeExecutionStatus({ ...base, approvalStatus: "on_approval" }, now)
    ).toBe("on_approval")
  })

  it("согласована, до дедлайна (10:59 МСК среды) → awaiting", () => {
    const now = new Date("2026-07-15T10:59:00+03:00")
    expect(computeExecutionStatus(base, now)).toBe("awaiting")
  })

  it("согласована, дедлайн наступил (11:00 МСК среды) → overdue", () => {
    const now = new Date("2026-07-15T11:00:00+03:00")
    expect(computeExecutionStatus(base, now)).toBe("overdue")
  })

  it("перенос даты оплаты вперёд возвращает красную в awaiting", () => {
    const now = new Date("2026-07-15T12:00:00+03:00")
    const moved = { ...base, payDate: new Date("2026-07-16T10:00:00+03:00") }
    expect(computeExecutionStatus(moved, now)).toBe("awaiting")
  })
})
