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
