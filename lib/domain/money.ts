// Деньги во всём проекте — целые копейки (minor units).
export function formatMoney(amountMinor: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
    amountMinor / 100
  )
}

export const MAX_AMOUNT_MINOR = 2_147_483_647

// Разбирает ввод пользователя в рублях ("1000,50" или "-500") в целые копейки.
// null — если это не конечное ненулевое число в пределах Int-лимита схемы.
export function parseMoneyToMinor(input: string): number | null {
  const amountRub = Number(input.trim().replace(",", "."))
  if (!Number.isFinite(amountRub) || amountRub === 0) return null
  const minor = Math.round(amountRub * 100)
  if (minor === 0 || Math.abs(minor) > MAX_AMOUNT_MINOR) return null
  return minor
}
