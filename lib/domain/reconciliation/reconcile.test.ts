import { describe, expect, it } from "vitest"
import { reconcileAccount } from "./reconcile"
import type { AccountReconInput, BankStatement, RequestForCheck } from "./types"

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
        basisRequestUid: "req-1", // списание с основанием — базовый «чистый» случай
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

  it("нет выписки, но пустой массив движений — no_data (не matched)", () => {
    const r = reconcileAccount(
      baseInput({ statement: null, movements: [], onecClosingMinor: null })
    )
    expect(r.status).toBe("no_data")
  })

  it("нет выписки, движения чистые — всё равно no_data, не «Проверено»", () => {
    const r = reconcileAccount(
      baseInput({
        statement: null,
        onecClosingMinor: null,
        movements: [
          {
            direction: "debit",
            amountMinor: 10000n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "оплата",
            basisRequestUid: "req-1",
          },
        ],
        requests: [],
      })
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

function req(over: Partial<RequestForCheck> = {}): RequestForCheck {
  return {
    uid: "req-1",
    amountMinor: 10000n,
    partnerName: "ООО Ромашка",
    partnerInn: "7701234567",
    payDate: "2026-07-23",
    approved: true,
    executedIn1c: true,
    ...over,
  }
}

describe("reconcileAccount — заявки", () => {
  it("одобренная заявка без списания — request_not_executed", () => {
    const r = reconcileAccount(baseInput({ movements: [], requests: [req()] }))
    expect(r.discrepancies.map((d) => d.type)).toContain("request_not_executed")
  })

  it("списание без заявки-основания — payment_without_request", () => {
    const r = reconcileAccount(
      baseInput({
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
      })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain(
      "payment_without_request"
    )
  })

  it("списали больше заявки — amount_mismatch", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 15000n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "оплата",
            basisRequestUid: "req-1",
          },
        ],
        requests: [req({ amountMinor: 10000n })],
        onecClosingMinor: 90000n,
        statement: stmt({ closingMinor: 90000n }),
      })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain("amount_mismatch")
  })

  it("частичная оплата (списание меньше заявки) — НЕ расхождение", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 6000n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "аванс",
            basisRequestUid: "req-1",
          },
        ],
        requests: [req({ amountMinor: 10000n })],
      })
    )
    expect(r.discrepancies.map((d) => d.type)).not.toContain("amount_mismatch")
  })

  it("получатель списания ≠ заявке — recipient_mismatch (заявка↔1С)", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 10000n,
            counterpartyName: "ООО Одуванчик",
            counterpartyInn: "7709999999",
            counterpartyAccount: "333",
            purpose: "оплата",
            basisRequestUid: "req-1",
          },
        ],
        requests: [req({ partnerInn: "7701234567" })],
      })
    )
    const mism = r.discrepancies.filter((d) => d.type === "recipient_mismatch")
    expect(mism.length).toBeGreaterThan(0)
    expect(mism[0].detail).toContain("заявка↔1С")
  })
})
