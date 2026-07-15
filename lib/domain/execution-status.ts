// Статусы исполнения заявки на расход ДС. Чистая логика, без I/O.
// Москва — фиксированно UTC+3 (переходов на летнее время нет с 2014 года).

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
const DEADLINE_HOUR_UTC = 8 // 11:00 МСК

// Следующий рабочий день (пока пропускаем только сб/вс, производственный
// календарь — открытый вопрос §11 спеки) после даты оплаты, 11:00 МСК.
export function executionDeadline(payDate: Date): Date {
  // Календарная дата payDate по Москве: сдвигаем на +3ч и читаем UTC-компоненты.
  const msk = new Date(payDate.getTime() + MSK_OFFSET_MS)
  const next = new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + 1)
  )
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return new Date(
    Date.UTC(
      next.getUTCFullYear(),
      next.getUTCMonth(),
      next.getUTCDate(),
      DEADLINE_HOUR_UTC
    )
  )
}

export type ApprovalStatus = "on_approval" | "approved" | "declined"

export type ExecutionStatus =
  "on_approval" | "declined" | "awaiting" | "executed" | "overdue"

export type ExecutionStatusInput = {
  approvalStatus: ApprovalStatus
  payDate: Date
  hasDebits: boolean
}

// Исполнена = есть хотя бы одно привязанное списание (частичные оплаты
// v1 не интерпретирует — открытый вопрос §11 спеки).
export function computeExecutionStatus(
  input: ExecutionStatusInput,
  now: Date
): ExecutionStatus {
  if (input.hasDebits) return "executed"
  if (input.approvalStatus === "declined") return "declined"
  if (input.approvalStatus === "on_approval") return "on_approval"
  return now.getTime() >= executionDeadline(input.payDate).getTime()
    ? "overdue"
    : "awaiting"
}
