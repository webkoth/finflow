// Деньги во всём проекте — целые копейки (minor units).
export function formatMoney(amountMinor: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
    amountMinor / 100
  )
}
