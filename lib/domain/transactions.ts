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
