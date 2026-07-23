import { formatMoneyBig } from "@/lib/domain/money"
import { matchRecipient } from "./recipients"
import type {
  AccountReconInput,
  AccountReconResult,
  Direction,
  Discrepancy,
  OneCMovement,
} from "./types"

function sumMovements(movements: OneCMovement[], dir: Direction): bigint {
  return movements
    .filter((m) => m.direction === dir)
    .reduce((acc, m) => acc + m.amountMinor, 0n)
}

function sumLines(
  lines: { direction: Direction; amountMinor: bigint }[],
  dir: Direction
): bigint {
  return lines
    .filter((l) => l.direction === dir)
    .reduce((acc, l) => acc + l.amountMinor, 0n)
}

const rub = (v: bigint, currency: string) => formatMoneyBig(v, currency)

// Плоскость 2: заявка → списание (1С) → выписка.
function checkPayments(input: AccountReconInput): Discrepancy[] {
  const { movements, requests, statement, currency } = input
  if (!movements) return []
  const out: Discrepancy[] = []

  const debitMovements = movements.filter((m) => m.direction === "debit")
  const byRequestUid = new Map<string, OneCMovement>()
  for (const m of debitMovements) {
    if (m.basisRequestUid) byRequestUid.set(m.basisRequestUid, m)
  }

  // Одобренная заявка со сроком ≤ конец периода без списания.
  for (const r of requests) {
    if (!r.approved) continue
    if (r.payDate > (statement?.periodEnd ?? r.payDate)) continue
    if (!byRequestUid.has(r.uid)) {
      out.push({
        type: "request_not_executed",
        expected: `исполнение заявки ${r.uid} на ${formatMoneyBig(r.amountMinor, currency)}`,
        actual: "списания нет",
        amountMinor: r.amountMinor,
        detail: `заявка «${r.partnerName}» одобрена, не исполнена`,
        requestUid: r.uid,
      })
    }
  }

  const requestByUid = new Map(requests.map((r) => [r.uid, r]))
  for (const m of debitMovements) {
    // Списание без заявки-основания.
    if (!m.basisRequestUid) {
      out.push({
        type: "payment_without_request",
        expected: "списание по заявке",
        actual: `списание «${m.counterpartyName}» на ${formatMoneyBig(m.amountMinor, currency)} без основания`,
        amountMinor: m.amountMinor,
        detail: "списание без заявки-основания",
        requestUid: null,
      })
      continue
    }
    const r = requestByUid.get(m.basisRequestUid)
    if (!r) continue // основание есть, но заявки нет в выборке дня — не наш кейс

    // Сумма: превышение — расхождение; недоплата — частичная (не расхождение).
    if (m.amountMinor > r.amountMinor) {
      out.push({
        type: "amount_mismatch",
        expected: formatMoneyBig(r.amountMinor, currency),
        actual: formatMoneyBig(m.amountMinor, currency),
        amountMinor: m.amountMinor - r.amountMinor,
        detail: `списание больше заявки ${r.uid}`,
        requestUid: r.uid,
      })
    }

    // Получатель: заявка ↔ 1С.
    const reqVs1c = matchRecipient(
      { name: r.partnerName, inn: r.partnerInn, account: null },
      {
        name: m.counterpartyName,
        inn: m.counterpartyInn,
        account: m.counterpartyAccount,
      }
    )
    if (reqVs1c === "mismatch") {
      out.push({
        type: "recipient_mismatch",
        expected: `${r.partnerName} (ИНН ${r.partnerInn ?? "—"})`,
        actual: `${m.counterpartyName} (ИНН ${m.counterpartyInn ?? "—"})`,
        amountMinor: m.amountMinor,
        detail: "получатель: заявка↔1С",
        requestUid: r.uid,
      })
    }

    // Получатель: 1С ↔ выписка (по строке выписки с той же суммой).
    if (statement) {
      const line = statement.lines.find(
        (l) => l.direction === "debit" && l.amountMinor === m.amountMinor
      )
      if (line) {
        const oneCVsStmt = matchRecipient(
          {
            name: m.counterpartyName,
            inn: m.counterpartyInn,
            account: m.counterpartyAccount,
          },
          {
            name: line.counterpartyName,
            inn: line.counterpartyInn,
            account: line.counterpartyAccount,
          }
        )
        if (oneCVsStmt === "mismatch") {
          out.push({
            type: "recipient_mismatch",
            expected: `${m.counterpartyName} (ИНН ${m.counterpartyInn ?? "—"})`,
            actual: `${line.counterpartyName} (ИНН ${line.counterpartyInn ?? "—"})`,
            amountMinor: m.amountMinor,
            detail: "получатель: 1С↔выписка",
            requestUid: r.uid,
          })
        }
      }
    }
  }

  return out
}

export function reconcileAccount(input: AccountReconInput): AccountReconResult {
  const { statement, movements, onecClosingMinor, currency } = input

  const empty: AccountReconResult = {
    status: "no_data",
    stmtOpeningMinor: statement?.openingMinor ?? null,
    stmtClosingMinor: statement?.closingMinor ?? null,
    stmtDebitMinor: statement ? sumLines(statement.lines, "debit") : null,
    stmtCreditMinor: statement ? sumLines(statement.lines, "credit") : null,
    onecClosingMinor,
    onecDebitMinor: movements ? sumMovements(movements, "debit") : null,
    onecCreditMinor: movements ? sumMovements(movements, "credit") : null,
    discrepancies: [],
  }

  // Сбой источника выписки не может выглядеть как «проверено».
  if (input.sourceError) return { ...empty, status: "source_error" }

  // Нечего сверять.
  if (!statement && !movements) return { ...empty, status: "no_data" }

  const discrepancies: Discrepancy[] = []
  const stmtDebit = empty.stmtDebitMinor
  const stmtCredit = empty.stmtCreditMinor
  const onecDebit = empty.onecDebitMinor
  const onecCredit = empty.onecCreditMinor

  // Тождество остатков внутри выписки: начало + кредит − дебет = конец.
  if (statement) {
    const derived =
      statement.openingMinor + (stmtCredit ?? 0n) - (stmtDebit ?? 0n)
    if (derived !== statement.closingMinor) {
      discrepancies.push({
        type: "balance_identity",
        expected: rub(statement.closingMinor, currency),
        actual: rub(derived, currency),
        amountMinor: statement.closingMinor - derived,
        detail: "начало + кредит − дебет ≠ конец (выписка)",
        requestUid: null,
      })
    }
  }

  // Конечный остаток: выписка ↔ 1С (AccountBalance).
  if (statement && onecClosingMinor !== null) {
    if (statement.closingMinor !== onecClosingMinor) {
      discrepancies.push({
        type: "closing_balance",
        expected: rub(statement.closingMinor, currency),
        actual: rub(onecClosingMinor, currency),
        amountMinor: statement.closingMinor - onecClosingMinor,
        detail: "конечный остаток: выписка ↔ 1С",
        requestUid: null,
      })
    }
  }

  // Обороты: выписка ↔ движения 1С.
  if (statement && movements) {
    if (stmtDebit !== onecDebit) {
      discrepancies.push({
        type: "debit_turnover",
        expected: rub(stmtDebit ?? 0n, currency),
        actual: rub(onecDebit ?? 0n, currency),
        amountMinor: (stmtDebit ?? 0n) - (onecDebit ?? 0n),
        detail: "оборот-дебет: выписка ↔ 1С",
        requestUid: null,
      })
    }
    if (stmtCredit !== onecCredit) {
      discrepancies.push({
        type: "credit_turnover",
        expected: rub(stmtCredit ?? 0n, currency),
        actual: rub(onecCredit ?? 0n, currency),
        amountMinor: (stmtCredit ?? 0n) - (onecCredit ?? 0n),
        detail: "оборот-кредит: выписка ↔ 1С",
        requestUid: null,
      })
    }
  }

  // Плоскость 2 (заявки) — добавляем к расхождениям по счёту.
  discrepancies.push(...checkPayments(input))

  const status = discrepancies.length > 0 ? "discrepancy" : "matched"
  return { ...empty, status, discrepancies }
}
