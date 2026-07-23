import { describe, expect, it } from "vitest"
import { reconcileAccount } from "./reconcile"
import type { AccountReconInput, BankStatement } from "./types"

function stmt(over: Partial<BankStatement> = {}): BankStatement {
  return {
    accountNumber: "40702810900000001111",
    periodStart: "2026-07-23",
    periodEnd: "2026-07-23",
    openingMinor: 100000n,
    closingMinor: 90000n,
    lines: [
      {
        direction: "debit",
        amountMinor: 10000n,
        counterpartyName: "ООО Ромашка",
        counterpartyInn: "7701234567",
        counterpartyAccount: "222",
        purpose: "оплата",
      },
    ],
    ...over,
  }
}

function baseInput(over: Partial<AccountReconInput> = {}): AccountReconInput {
  return {
    currency: "RUB",
    sourceError: false,
    statement: stmt(),
    onecClosingMinor: 90000n,
    movements: [
      {
        direction: "debit",
        amountMinor: 10000n,
        counterpartyName: "ООО Ромашка",
        counterpartyInn: "7701234567",
        counterpartyAccount: "222",
        purpose: "оплата",
        basisRequestUid: null,
      },
    ],
    requests: [],
    ...over,
  }
}

describe("reconcileAccount — остатки и обороты", () => {
  it("всё сходится — matched, без расхождений", () => {
    const r = reconcileAccount(baseInput())
    expect(r.status).toBe("matched")
    expect(r.discrepancies).toEqual([])
    expect(r.stmtDebitMinor).toBe(10000n)
    expect(r.onecDebitMinor).toBe(10000n)
  })

  it("ошибка источника — source_error, сверки нет", () => {
    const r = reconcileAccount(
      baseInput({ sourceError: true, statement: null })
    )
    expect(r.status).toBe("source_error")
    expect(r.discrepancies).toEqual([])
  })

  it("нет выписки и нет движений — no_data", () => {
    const r = reconcileAccount(
      baseInput({ statement: null, movements: null, onecClosingMinor: null })
    )
    expect(r.status).toBe("no_data")
  })

  it("конечный остаток 1С ≠ выписке — closing_balance", () => {
    const r = reconcileAccount(baseInput({ onecClosingMinor: 91000n }))
    expect(r.status).toBe("discrepancy")
    expect(r.discrepancies.map((d) => d.type)).toContain("closing_balance")
  })

  it("оборот-дебет 1С ≠ выписке — debit_turnover", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 9999n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "оплата",
            basisRequestUid: null,
          },
        ],
      })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain("debit_turnover")
  })

  it("нарушено тождество остатков выписки — balance_identity", () => {
    // opening 100000 + credit 0 - debit 10000 = 90000, но closing = 80000
    const r = reconcileAccount(
      baseInput({ statement: stmt({ closingMinor: 80000n }) })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain("balance_identity")
  })
})
