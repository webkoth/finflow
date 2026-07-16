// lib/domain/verdict.ts
// Светофор авто-проверок заявки. Чистая логика без I/O (порт
// fin/composables/useVerdict.ts с исправлениями по спеке).
// null-срез = «данных нет» → проверка info, из вердикта исключается.

import { formatDate } from "./dates"
import { formatMoneyBig } from "./money"

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
  const { request, balances, rates } = input
  if (!balances || balances.length === 0 || !rates) return noData("funds")

  const amountRub = toRub(request.amountMinor, request.currency, rates)
  if (amountRub === null)
    return noData("funds", `нет курса валюты ${request.currency}`)

  const account = request.debitAccountUid
    ? (balances.find((b) => b.accountUid === request.debitAccountUid) ?? null)
    : null
  const accountUnknown = request.debitAccountUid !== null && account === null
  if (
    account &&
    account.currency === request.currency &&
    account.balanceMinor >= request.amountMinor
  )
    return {
      id: "funds",
      label: "Денег на счёте достаточно",
      status: "ok",
      sublabel: formatMoneyBig(account.balanceMinor, account.currency),
    }

  // Счёт не покрывает (или не указан) — смотрим все счета юрлица в ₽.
  let orgTotalRub = 0
  for (const b of balances) {
    if (b.orgName !== request.orgName) continue
    const rub = toRub(b.balanceMinor, b.currency, rates)
    if (rub !== null) orgTotalRub += rub
  }
  if (orgTotalRub >= amountRub) {
    if (!account)
      return {
        id: "funds",
        label: accountUnknown
          ? "Счёт списания не найден в остатках"
          : "Счёт списания не указан",
        status: "warn",
        sublabel: `по юрлицу достаточно (${Math.round(orgTotalRub).toLocaleString("ru-RU")} ₽)`,
      }
    return {
      id: "funds",
      label: "Нужен перевод между счетами",
      status: "warn",
      sublabel: `на счёте ${formatMoneyBig(account.balanceMinor, account.currency)}, по юрлицу ${Math.round(orgTotalRub).toLocaleString("ru-RU")} ₽`,
    }
  }
  return {
    id: "funds",
    label: "Недостаточно средств",
    status: "bad",
    sublabel: `нужно ${formatMoneyBig(request.amountMinor, request.currency)}, по юрлицу ${Math.round(orgTotalRub).toLocaleString("ru-RU")} ₽`,
  }
}

function checkFundBalance(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  const { fund, rates, request } = input
  if (!fund || !rates) return noData("fund_balance")
  const amountRub = toRub(request.amountMinor, request.currency, rates)
  if (amountRub === null)
    return noData("fund_balance", `нет курса валюты ${request.currency}`)

  // Ключевое отличие от старого кода: остаток считаем ПОСЛЕ платежа (ТЗ §4).
  const afterRub = Number(fund.balanceMinor) / 100 - amountRub
  const afterText = `${Math.round(afterRub).toLocaleString("ru-RU")} ₽ после платежа`
  if (afterRub >= 0)
    return {
      id: "fund_balance",
      label: "Фонд в плюсе",
      status: "ok",
      sublabel: afterText,
    }

  const planWeekRub = Number(fund.planWeekMinor) / 100
  const deficitPercent =
    planWeekRub > 0 ? (Math.abs(afterRub) / planWeekRub) * 100 : 100
  if (deficitPercent <= thresholds.fundDeficitPercent)
    return {
      id: "fund_balance",
      label: "Фонд уходит в минус",
      status: "warn",
      sublabel: `${afterText} (${deficitPercent.toFixed(0)}% от плана недели)`,
    }
  return {
    id: "fund_balance",
    label: "Фонд критично в минусе",
    status: "bad",
    sublabel: `${afterText} (${deficitPercent.toFixed(0)}% от плана недели)`,
  }
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
  const { order, contract, orderContractAvailable, request, rates } = input

  if (order) {
    const amountRub = toRub(request.amountMinor, request.currency, rates ?? {})
    const orderRub = toRub(order.amountMinor, order.currency, rates ?? {})
    const paidRub = toRub(order.paidMinor, order.currency, rates ?? {})
    if (amountRub === null || orderRub === null || paidRub === null)
      return noData("order_contract", "нет курса валюты")
    if (orderRub <= 0) return noData("order_contract", "сумма заказа не задана")
    const percent = ((paidRub + amountRub) / orderRub) * 100
    if (percent <= 100)
      return {
        id: "order_contract",
        label: `Заказ поставщику №${order.number}`,
        status: "ok",
        sublabel: `с этим платежом оплачено ${percent.toFixed(0)}% заказа`,
      }
    return {
      id: "order_contract",
      label: "Переплата по заказу",
      status: "warn",
      sublabel: `с этим платежом ${percent.toFixed(0)}% суммы заказа №${order.number}`,
    }
  }

  if (contract) {
    if (!contract.isActive)
      return {
        id: "order_contract",
        label: "Договор закрыт",
        status: "bad",
        sublabel: `№${contract.number} от ${formatDate(contract.date)}`,
      }
    const remaining = contract.amountMinor - contract.paidMinor
    const remainingRub = toRub(remaining, contract.currency, rates ?? {})
    const amountRub = toRub(request.amountMinor, request.currency, rates ?? {})
    if (
      remainingRub !== null &&
      amountRub !== null &&
      contract.amountMinor > 0n &&
      remainingRub < amountRub
    )
      return {
        id: "order_contract",
        label: "Платёж превысит сумму договора",
        status: "warn",
        sublabel: `остаток по договору ${formatMoneyBig(remaining, contract.currency)}`,
      }
    return {
      id: "order_contract",
      label: "Договор активен",
      status: "ok",
      sublabel: `№${contract.number} от ${formatDate(contract.date)}`,
    }
  }

  if (orderContractAvailable)
    return {
      id: "order_contract",
      label: "Нет ни заказа, ни договора",
      status: "bad",
      sublabel: "укажите основание в 1С",
    }
  return noData("order_contract")
}

function checkPartnerHistory(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  const { partner, now } = input
  if (!partner) return noData("partner")

  if (partner.paymentCount >= thresholds.minOperationsForConstant) {
    const staleMs = thresholds.oldPartnerMonths * 30 * 24 * 60 * 60 * 1000
    if (
      partner.lastPaymentAt &&
      now.getTime() - partner.lastPaymentAt.getTime() > staleMs
    )
      return {
        id: "partner",
        label: "Давно не работали",
        status: "warn",
        sublabel: `последний платёж ${formatDate(partner.lastPaymentAt)}`,
      }
    return {
      id: "partner",
      label: "Постоянный контрагент",
      status: "ok",
      sublabel: `${partner.paymentCount} платежей`,
    }
  }
  if (partner.paymentCount >= 1)
    return {
      id: "partner",
      label: "Эпизодический контрагент",
      status: "warn",
      sublabel: `${partner.paymentCount} платеж(а)`,
    }
  return {
    id: "partner",
    label: "Новый поставщик",
    status: "bad",
    sublabel: "первый платёж",
  }
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
