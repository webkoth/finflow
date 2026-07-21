export type TransactionLike = { category: string; amountMinor: number }
export type CategorySummary = { category: string; totalMinor: number }

export function summarizeByCategory(
  transactions: TransactionLike[]
): CategorySummary[] {
  const totals = new Map<string, number>()
  for (const t of transactions) {
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amountMinor)
  }
  return [...totals.entries()]
    .map(([category, totalMinor]) => ({ category, totalMinor }))
    .sort((a, b) => a.category.localeCompare(b.category, "ru"))
}

export type DailyCashflowPoint = {
  date: string // "YYYY-MM-DD" московских суток
  incomeMinor: number
  expenseMinor: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
// en-CA даёт формат YYYY-MM-DD.
const moscowDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
})

// Непрерывный ряд последних `days` московских суток (кончая сегодняшними):
// сумма положительных сумм — приход, модуль отрицательных — расход.
export function groupDailyCashflow(
  transactions: { occurredAt: Date; amountMinor: number }[],
  days: number,
  now: Date
): DailyCashflowPoint[] {
  const totals = new Map<string, DailyCashflowPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const date = moscowDay.format(new Date(now.getTime() - i * MS_PER_DAY))
    totals.set(date, { date, incomeMinor: 0, expenseMinor: 0 })
  }
  for (const t of transactions) {
    const point = totals.get(moscowDay.format(t.occurredAt))
    if (!point) continue
    if (t.amountMinor > 0) point.incomeMinor += t.amountMinor
    else point.expenseMinor += -t.amountMinor
  }
  return [...totals.values()]
}
