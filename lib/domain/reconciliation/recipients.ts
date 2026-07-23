export type Party = {
  name: string
  inn: string | null
  account: string | null
}

export type RecipientMatch = "match" | "mismatch" | "weak-match"

// \b в JS — ASCII-only и не даёт границы вокруг кириллицы, поэтому используем
// явные lookaround'ы по кириллическим буквам (орг-форма как отдельный токен).
const ORG_FORMS =
  /(?<![А-Яа-яЁё])(?:ООО|ОАО|ЗАО|ПАО|АО|ИП|НКО|ФГУП|МУП|ГУП)(?![А-Яа-яЁё])/gi

// Нормализация названия для слабого матча: регистр, кавычки, орг-форма, пробелы.
export function normalizeName(name: string): string {
  return name
    .replace(ORG_FORMS, " ")
    .replace(/[«»"'`]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

// Матч получателя по приоритету: ИНН → номер счёта → нормализованное имя.
export function matchRecipient(a: Party, b: Party): RecipientMatch {
  if (a.inn && b.inn) return a.inn === b.inn ? "match" : "mismatch"
  if (a.account && b.account) {
    return a.account === b.account ? "match" : "mismatch"
  }
  return normalizeName(a.name) === normalizeName(b.name)
    ? "weak-match"
    : "mismatch"
}
