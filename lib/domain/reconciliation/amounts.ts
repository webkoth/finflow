// Разбор денежной строки выписки в целые BigInt-копейки.
// Выписки 1CClientBankExchange используют точку; допускаем и запятую,
// и пробелы-разделители тысяч. Округление дробной части — до копейки.
export function parseStatementAmount(input: string): bigint {
  const cleaned = input.trim().replace(/\s+/g, "").replace(",", ".")
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`Не число в сумме выписки: "${input}"`)
  }
  const negative = cleaned.startsWith("-")
  const abs = negative ? cleaned.slice(1) : cleaned
  const [whole, frac = ""] = abs.split(".")
  // до трёх знаков достаточно для корректного округления сотых
  const frac3 = (frac + "000").slice(0, 3)
  const thousandths = BigInt(whole) * 1000n + BigInt(frac3)
  // округление до копеек (сотых): делим на 10 с округлением
  const rounded = (thousandths + 5n) / 10n
  return negative ? -rounded : rounded
}
