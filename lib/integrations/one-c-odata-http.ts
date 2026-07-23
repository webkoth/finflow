// Реальный клиент OData 1С: basic auth, только GET, постранично.
// Имена объектов и реквизитов 1С собраны здесь в одной карте: конфигурация
// rbb_cut на момент написания недоступна (нет прав на OData), точные имена
// подставляются на шаге проверки подключения — см. Task 15 плана
// docs/superpowers/plans/2026-07-21-onec-reference-sync.md.
import { parseFlow, parseParentUid } from "@/lib/domain/reference/sync-diff"
import type { OneCMovement } from "@/lib/domain/reconciliation/types"
import type {
  OneCArticle,
  OneCArticleKind,
  OneCBankAccount,
  OneCGateway,
} from "./one-c-odata"

const TIMEOUT_MS = 30_000
const PAGE_SIZE = 1000

// Имена наборов и реквизитов в конфигурации 1С.
// ВНИМАНИЕ: значения предварительные, уточняются в Task 15.
const NAMES = {
  articles: {
    CASHFLOW: "Catalog_СтатьиДвиженияДенежныхСредств",
    PNL: "Catalog_СтатьиДоходовИРасходов",
  },
  articleFields: {
    uid: "Ref_Key",
    code: "Code",
    name: "Description",
    parent: "Parent_Key",
    isGroup: "IsFolder",
    flow: "ВидДвижения",
    description: "Комментарий",
    deleted: "DeletionMark",
  },
  accounts: "Catalog_БанковскиеСчета",
  accountFields: {
    uid: "Ref_Key",
    name: "Description",
    number: "НомерСчета",
    bankName: "Банк/Description",
    bankBic: "Банк/Код",
    currency: "ВалютаДенежныхСредств/Code",
    organization: "Владелец/Description",
    deleted: "DeletionMark",
  },
  // Наборы движений по счёту (проверено запросом 2026-07-23, база rbb_cut).
  movements: {
    expense: "Document_РасходСоСчета",
    receipt: "Document_ПоступлениеНаСчет",
  },
  movementFields: {
    account: "БанковскийСчет_Key",
    amount: "СуммаДокумента",
    counterpartyInn: "Контрагент/ИНН",
    counterpartyAccount: "СчетКонтрагента/НомерСчета",
    purpose: "НазначениеПлатежа",
    basis: "ДокументОснование",
    date: "Date",
  },
} as const

type Row = Record<string, unknown>

function str(row: Row, field: string): string | null {
  const v = row[field]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

function required(row: Row, field: string, set: string): string {
  const v = str(row, field)
  if (v === null) {
    throw new Error(`1С: в наборе ${set} нет обязательного поля ${field}`)
  }
  return v
}

function config() {
  const base = process.env.ONEC_ODATA_URL
  const user = process.env.ONEC_ODATA_USER
  const password = process.env.ONEC_ODATA_PASSWORD
  if (!base || !user || !password) {
    throw new Error(
      "Не заданы ONEC_ODATA_URL / ONEC_ODATA_USER / ONEC_ODATA_PASSWORD"
    )
  }
  const auth =
    "Basic " + Buffer.from(`${user}:${password}`, "utf8").toString("base64")
  return { base: base.replace(/\/$/, ""), auth }
}

// Читает набор целиком, страницами по PAGE_SIZE.
async function fetchAll(set: string): Promise<Row[]> {
  const { base, auth } = config()
  const rows: Row[] = []
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const url = `${base}/${set}?$format=json&$top=${PAGE_SIZE}&$skip=${skip}`
    const res = await fetch(url, {
      headers: { Authorization: auth, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 401) {
      throw new Error(
        "1С отклонила авторизацию (401): проверьте учётку и право «Использование стандартного интерфейса OData»"
      )
    }
    if (!res.ok) {
      throw new Error(
        `1С ответила ошибкой: HTTP ${res.status} для набора ${set}`
      )
    }
    const json = (await res.json()) as { value?: Row[] }
    const page = json.value ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export const httpOneCGateway: OneCGateway = {
  async fetchArticles(kind: OneCArticleKind): Promise<OneCArticle[]> {
    const set = NAMES.articles[kind]
    const f = NAMES.articleFields
    const rows = await fetchAll(set)
    return rows.map((row) => ({
      uid: required(row, f.uid, set),
      code: str(row, f.code),
      name: required(row, f.name, set),
      parentUid: parseParentUid(str(row, f.parent)),
      isGroup: row[f.isGroup] === true,
      flow: parseFlow(str(row, f.flow)),
      description: str(row, f.description),
      isDeletedIn1c: row[f.deleted] === true,
    }))
  },

  async fetchBankAccounts(): Promise<OneCBankAccount[]> {
    const set = NAMES.accounts
    const f = NAMES.accountFields
    const rows = await fetchAll(set)
    return rows.map((row) => ({
      uid: required(row, f.uid, set),
      name: required(row, f.name, set),
      accountNumber: str(row, f.number) ?? "",
      bankName: str(row, f.bankName) ?? "",
      bankBic: str(row, f.bankBic) ?? "",
      currency: str(row, f.currency) ?? "RUB",
      organization: str(row, f.organization) ?? "",
      isDeletedIn1c: row[f.deleted] === true,
    }))
  },

  async fetchAccountMovements(
    accountUid: string,
    from: string,
    to: string
  ): Promise<OneCMovement[]> {
    const f = NAMES.movementFields
    // Границы периода по московскому времени в формате OData datetime.
    const fromDt = `${from}T00:00:00`
    const toDt = `${to}T23:59:59`
    const filter =
      `${f.account} eq guid'${accountUid}'` +
      ` and ${f.date} ge datetime'${fromDt}'` +
      ` and ${f.date} le datetime'${toDt}'`
    const expand = encodeURIComponent("Контрагент,СчетКонтрагента")
    const query = (set: string) =>
      `${set}?$format=json&$filter=${encodeURIComponent(filter)}&$expand=${expand}`

    const [expense, receipt] = await Promise.all([
      fetchFiltered(query(NAMES.movements.expense)),
      fetchFiltered(query(NAMES.movements.receipt)),
    ])

    const map = (rows: Row[], dir: "debit" | "credit"): OneCMovement[] =>
      rows.map((row) => ({
        direction: dir,
        amountMinor: rublesToMinor(row[f.amount]),
        counterpartyName: nestedStr(row, "Контрагент", "Description") ?? "",
        counterpartyInn: nestedStr(row, "Контрагент", "ИНН"),
        counterpartyAccount: nestedStr(row, "СчетКонтрагента", "НомерСчета"),
        purpose: str(row, f.purpose) ?? "",
        basisRequestUid: str(row, f.basis),
      }))

    return [...map(expense, "debit"), ...map(receipt, "credit")]
  },
}

// Запрос с готовым query-string (в отличие от постраничного fetchAll).
async function fetchFiltered(query: string): Promise<Row[]> {
  const { base, auth } = config()
  const res = await fetch(`${base}/${query}`, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`1С ответила ошибкой: HTTP ${res.status} (движения)`)
  }
  const json = (await res.json()) as { value?: Row[] }
  return json.value ?? []
}

// Сумма из 1С приходит в рублях (число/строка) → BigInt-копейки.
function rublesToMinor(v: unknown): bigint {
  const n = typeof v === "number" ? v : Number(String(v ?? "0"))
  if (!Number.isFinite(n)) return 0n
  return BigInt(Math.round(n * 100))
}

// Значение вложенного (expand) объекта: row["Контрагент"]["Description"].
function nestedStr(row: Row, rel: string, field: string): string | null {
  const obj = row[rel]
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[field]
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return String(v).trim()
    }
  }
  return null
}
