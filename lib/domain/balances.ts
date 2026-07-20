// Пересчёт остатков по счетам в рубли. Чистые функции без I/O;
// курс — number ₽ за единицу валюты (Decimal из БД приводит вызывающий код).
export type AccountBalanceLike = {
  orgName: string
  accountName: string
  bankName: string | null
  currency: string
  balanceMinor: bigint
}

export type BalancesSummary = {
  totalRubMinor: bigint
  isPartial: boolean // есть счета без курса — итог неполный
  accountCount: number
}

// null — курса для валюты нет. Точность Number достаточна
// до ~90 трлн ₽ (та же граница, что у formatMoneyBig).
export function convertToRubMinor(
  balanceMinor: bigint,
  currency: string,
  rates: Map<string, number>
): bigint | null {
  if (currency === "RUB") return balanceMinor
  const rate = rates.get(currency)
  if (rate === undefined) return null
  return BigInt(Math.round(Number(balanceMinor) * rate))
}

export function summarizeBalances(
  accounts: AccountBalanceLike[],
  rates: Map<string, number>
): BalancesSummary {
  let totalRubMinor = 0n
  let isPartial = false
  for (const a of accounts) {
    const rub = convertToRubMinor(a.balanceMinor, a.currency, rates)
    if (rub === null) isPartial = true
    else totalRubMinor += rub
  }
  return { totalRubMinor, isPartial, accountCount: accounts.length }
}
