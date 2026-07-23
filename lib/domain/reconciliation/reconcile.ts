import { formatMoneyBig } from "@/lib/domain/money"
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

  const status = discrepancies.length > 0 ? "discrepancy" : "matched"
  return { ...empty, status, discrepancies }
}
