// Реальный клиент OData 1С: basic auth, только GET, постранично.
// Имена объектов и реквизитов 1С собраны здесь в одной карте: конфигурация
// rbb_cut на момент написания недоступна (нет прав на OData), точные имена
// подставляются на шаге проверки подключения — см. Task 15 плана
// docs/superpowers/plans/2026-07-21-onec-reference-sync.md.
import { parseFlow, parseParentUid } from "@/lib/domain/reference/sync-diff"
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
}
