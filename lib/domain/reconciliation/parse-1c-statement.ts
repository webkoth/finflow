import type { BankStatement, StatementLine } from "./types"
import { parseStatementAmount } from "./amounts"

// dd.mm.yyyy → yyyy-mm-dd
function toIso(d: string): string {
  const m = d.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) throw new Error(`Неверная дата в выписке: "${d}"`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

// Разбирает блок "ключ=значение" построчно в Map (первое вхождение ключа).
function kv(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!map.has(key)) map.set(key, line.slice(idx + 1).trim())
  }
  return map
}

// Имя контрагента: предпочитаем чистое поле «*1» (Плательщик1/Получатель1),
// иначе снимаем префикс «ИНН <цифры> » из основного поля (формат WB Банка и др.).
function partyName(d: Map<string, string>, base: string): string {
  const clean = d.get(base + "1")
  if (clean && clean.trim() !== "") return clean.trim()
  const raw = d.get(base) ?? ""
  return raw.replace(/^ИНН\s+\d+\s+/i, "").trim()
}

// Парсер стандартного обмена «банк-клиент ↔ 1С» (1CClientBankExchange, kl_to_1c).
// account — номер расчётного счёта, по которому строим выписку.
export function parse1CStatement(text: string, account: string): BankStatement {
  // Секция реквизитов счёта.
  const acctMatch = text.match(
    /СекцияРасчСчет\r?\n([\s\S]*?)\r?\nКонецРасчСчет/
  )
  const acct = acctMatch ? kv(acctMatch[1]) : new Map<string, string>()
  const acctInFile = acct.get("РасчСчет")
  if (acctInFile !== account) {
    throw new Error(
      `В выписке нет секции счёта ${account} (найден ${acctInFile ?? "—"})`
    )
  }

  const periodStart = toIso(acct.get("ДатаНачала") ?? "")
  const periodEnd = toIso(acct.get("ДатаКонца") ?? acct.get("ДатаНачала") ?? "")
  const openingMinor = parseStatementAmount(acct.get("НачальныйОстаток") ?? "0")

  // Документы.
  const lines: StatementLine[] = []
  const docRe = /СекцияДокумент=[^\n]*\r?\n([\s\S]*?)\r?\nКонецДокумента/g
  let dm: RegExpExecArray | null
  while ((dm = docRe.exec(text)) !== null) {
    const d = kv(dm[1])
    const payerAccount = d.get("ПлательщикСчет")
    const payeeAccount = d.get("ПолучательСчет")
    const amountMinor = parseStatementAmount(d.get("Сумма") ?? "0")

    if (payerAccount === account) {
      // Наш счёт — плательщик → списание; контрагент = получатель.
      lines.push({
        direction: "debit",
        amountMinor,
        counterpartyName: partyName(d, "Получатель"),
        counterpartyInn: d.get("ПолучательИНН") ?? null,
        counterpartyAccount: payeeAccount ?? null,
        purpose: d.get("НазначениеПлатежа") ?? "",
      })
    } else if (payeeAccount === account) {
      // Наш счёт — получатель → приход; контрагент = плательщик.
      lines.push({
        direction: "credit",
        amountMinor,
        counterpartyName: partyName(d, "Плательщик"),
        counterpartyInn: d.get("ПлательщикИНН") ?? null,
        counterpartyAccount: payerAccount ?? null,
        purpose: d.get("НазначениеПлатежа") ?? "",
      })
    }
    // Документ, не затрагивающий наш счёт, пропускаем.
  }

  const debit = lines
    .filter((l) => l.direction === "debit")
    .reduce((a, l) => a + l.amountMinor, 0n)
  const credit = lines
    .filter((l) => l.direction === "credit")
    .reduce((a, l) => a + l.amountMinor, 0n)

  // Конечный остаток: из файла, иначе выводим из тождества.
  const closingRaw = acct.get("КонечныйОстаток")
  const closingMinor =
    closingRaw !== undefined
      ? parseStatementAmount(closingRaw)
      : openingMinor + credit - debit

  return {
    accountNumber: account,
    periodStart,
    periodEnd,
    openingMinor,
    closingMinor,
    lines,
  }
}
