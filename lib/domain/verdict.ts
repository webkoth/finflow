// lib/domain/verdict.ts
// Светофор авто-проверок заявки. Чистая логика без I/O (порт
// fin/composables/useVerdict.ts с исправлениями по спеке).
// null-срез = «данных нет» → проверка info, из вердикта исключается.

export type VerdictLevel = "ok" | "warn" | "bad" | "block" // block зарезервирован, автоматически не выставляется
export type CheckStatus = "ok" | "warn" | "bad" | "info"
export type CheckId =
  | "funds"
  | "fund_balance"
  | "finplan"
  | "document"
  | "order_contract"
  | "partner"
  | "preapproved"

export type VerdictCheck = {
  id: CheckId
  label: string
  status: CheckStatus
  sublabel: string
}

export type Verdict = {
  level: VerdictLevel
  title: string
  description: string
  checks: VerdictCheck[]
}

export type VerdictThresholds = {
  fundDeficitPercent: number
  oldPartnerMonths: number
  minOperationsForConstant: number
}

export const DEFAULT_THRESHOLDS: VerdictThresholds = {
  fundDeficitPercent: 20,
  oldPartnerMonths: 12,
  minOperationsForConstant: 3,
}

export const DEFAULT_INCLUDE: Record<CheckId, boolean> = {
  funds: true,
  fund_balance: true,
  finplan: false, // нет источника (финмодель вне DWH)
  document: true,
  order_contract: true,
  partner: true,
  preapproved: false, // нет источника
}

export const CHECK_LABELS: Record<CheckId, string> = {
  funds: "Деньги на счёте",
  fund_balance: "Остаток фонда",
  finplan: "Соответствие финплану",
  document: "Документ-основание",
  order_contract: "Заказ / договор",
  partner: "История контрагента",
  preapproved: "Заранее согласовано",
}

export type VerdictSettings = {
  thresholds: VerdictThresholds
  include: Record<CheckId, boolean>
}

export type BalanceSlice = {
  accountUid: string
  orgName: string
  accountName: string
  currency: string
  balanceMinor: bigint
}

// ₽ за единицу валюты; RUB подразумевается = 1.
export type RatesSlice = Record<string, number>

export type FundSlice = {
  name: string
  planWeekMinor: bigint
  factWeekMinor: bigint
  balanceMinor: bigint
}

export type PartnerSlice = {
  paymentCount: number
  firstOperationAt: Date | null
  lastPaymentAt: Date | null
}

export type ContractSlice = {
  number: string
  date: Date
  isActive: boolean
  amountMinor: bigint
  paidMinor: bigint
  currency: string
}

export type OrderSlice = {
  number: string
  amountMinor: bigint
  paidMinor: bigint
  currency: string
}

export type VerdictInput = {
  request: {
    amountMinor: bigint
    currency: string
    debitAccountUid: string | null
    orgName: string
    comment: string | null
  }
  now: Date
  balances: BalanceSlice[] | null
  rates: RatesSlice | null
  fund: FundSlice | null
  attachmentsCount: number | null
  partner: PartnerSlice | null
  order: OrderSlice | null
  contract: ContractSlice | null
  // true = срезы заказов/договоров есть, но у заявки нет ни того ни другого → bad;
  // false = срезы недоступны → info.
  orderContractAvailable: boolean
}

// Сумма в рублях (не копейках); null — нет курса для валюты.
export function toRub(
  amountMinor: bigint,
  currency: string,
  rates: RatesSlice
): number | null {
  const rate = currency === "RUB" ? 1 : rates[currency]
  if (rate == null) return null
  return (Number(amountMinor) / 100) * rate
}

const RANK: Record<CheckStatus, number> = { ok: 0, warn: 1, bad: 2, info: 0 }

const TITLES: Record<Exclude<VerdictLevel, "block">, string> = {
  ok: "Можно согласовать",
  warn: "Можно согласовать с оговоркой",
  bad: "Требует внимания",
}

function noData(id: CheckId, sublabel = "нет данных"): VerdictCheck {
  return { id, label: CHECK_LABELS[id], status: "info", sublabel }
}

function checkFunds(input: VerdictInput): VerdictCheck {
  void input
  return noData("funds") // Task 3
}

function checkFundBalance(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  void input
  void thresholds
  return noData("fund_balance") // Task 3
}

function checkDocument(input: VerdictInput): VerdictCheck {
  const { attachmentsCount, request } = input
  if (attachmentsCount === null) return noData("document")
  if (attachmentsCount > 0)
    return {
      id: "document",
      label: "Основание есть",
      status: "ok",
      sublabel: `${attachmentsCount} документ(ов)`,
    }
  if (request.comment && request.comment.trim().length > 0)
    return {
      id: "document",
      label: "Только текстовое описание",
      status: "warn",
      sublabel: "нет прикреплённых файлов",
    }
  return {
    id: "document",
    label: "Нет основания",
    status: "bad",
    sublabel: "необходимо прикрепить документы",
  }
}

function checkOrderContract(input: VerdictInput): VerdictCheck {
  void input
  return noData("order_contract") // Task 4
}

function checkPartnerHistory(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  void input
  void thresholds
  return noData("partner") // Task 4
}

function checkFinplan(): VerdictCheck {
  return noData("finplan", "нет данных — финмодель вне DWH")
}

function checkPreapproved(): VerdictCheck {
  return noData("preapproved", "нет данных — финмодель вне DWH")
}

function describeVerdict(
  level: Exclude<VerdictLevel, "block">,
  checks: VerdictCheck[],
  include: Record<CheckId, boolean>
): string {
  const relevant = checks.filter((c) => include[c.id])
  const bad = relevant.filter((c) => c.status === "bad")
  const warn = relevant.filter((c) => c.status === "warn")
  if (level === "ok") return "Все ключевые проверки пройдены"
  if (level === "warn")
    return warn.length === 1
      ? warn[0].sublabel || "Есть замечание"
      : `Есть замечания: ${warn.length}`
  return bad.length === 1
    ? bad[0].sublabel || "Есть критичная проблема"
    : `Критичные проблемы: ${bad.map((c) => c.label).join(", ")}`
}

export function computeVerdict(
  input: VerdictInput,
  settings: VerdictSettings
): Verdict {
  const checks: VerdictCheck[] = [
    checkFunds(input),
    checkFundBalance(input, settings.thresholds),
    checkFinplan(),
    checkDocument(input),
    checkOrderContract(input),
    checkPartnerHistory(input, settings.thresholds),
    checkPreapproved(),
  ]
  const level = checks.reduce<Exclude<VerdictLevel, "block">>((worst, c) => {
    if (c.status === "info" || !settings.include[c.id]) return worst
    return RANK[c.status] > RANK[worst]
      ? (c.status as Exclude<VerdictLevel, "block">)
      : worst
  }, "ok")
  return {
    level,
    title: TITLES[level],
    description: describeVerdict(level, checks, settings.include),
    checks,
  }
}
