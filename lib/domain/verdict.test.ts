// lib/domain/verdict.test.ts
import { describe, expect, it } from "vitest"
import {
  computeVerdict,
  DEFAULT_INCLUDE,
  DEFAULT_THRESHOLDS,
  type VerdictInput,
  type VerdictSettings,
} from "./verdict"

export const SETTINGS: VerdictSettings = {
  thresholds: { ...DEFAULT_THRESHOLDS },
  include: { ...DEFAULT_INCLUDE },
}

// Базовый вход: все срезы дают 🟢 по каждой проверке.
export function makeInput(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    request: {
      amountMinor: 100_000_00n, // 100 000 ₽
      currency: "RUB",
      debitAccountUid: "acc-1",
      orgName: "ТОРИ БРЭНДС ООО",
      comment: null,
    },
    now: new Date("2026-07-15T10:00:00+03:00"),
    balances: [
      {
        accountUid: "acc-1",
        orgName: "ТОРИ БРЭНДС ООО",
        accountName: "Сбербанк ₽",
        currency: "RUB",
        balanceMinor: 1_000_000_00n,
      },
    ],
    rates: { CNY: 11.5, USD: 76 },
    fund: {
      name: "Закупки товара",
      planWeekMinor: 500_000_00n,
      factWeekMinor: 100_000_00n,
      balanceMinor: 400_000_00n,
    },
    attachmentsCount: 2,
    partner: {
      paymentCount: 12,
      firstOperationAt: new Date("2024-05-01"),
      lastPaymentAt: new Date("2026-07-01"),
    },
    order: {
      number: "78",
      amountMinor: 400_000_00n,
      paidMinor: 0n,
      currency: "RUB",
    },
    contract: null,
    orderContractAvailable: true,
    ...overrides,
  }
}

function check(input: VerdictInput, id: string) {
  const verdict = computeVerdict(input, SETTINGS)
  const found = verdict.checks.find((c) => c.id === id)
  if (!found) throw new Error(`нет проверки ${id}`)
  return found
}

describe("computeVerdict: сборка", () => {
  it("все проверки 🟢 → вердикт ok «Можно согласовать»", () => {
    const v = computeVerdict(makeInput(), SETTINGS)
    expect(v.level).toBe("ok")
    expect(v.title).toBe("Можно согласовать")
    expect(v.checks).toHaveLength(7)
  })

  it("худшая обязательная проверка задаёт уровень (warn)", () => {
    const v = computeVerdict(
      makeInput({
        attachmentsCount: 0,
        request: { ...makeInput().request, comment: "аванс" },
      }),
      SETTINGS
    )
    expect(v.level).toBe("warn")
    expect(v.title).toBe("Можно согласовать с оговоркой")
  })

  it("bad перекрывает warn", () => {
    const v = computeVerdict(
      makeInput({
        attachmentsCount: 0,
        request: { ...makeInput().request, comment: null },
      }),
      SETTINGS
    )
    expect(v.level).toBe("bad")
    expect(v.title).toBe("Требует внимания")
  })

  it("проверка со статусом info не влияет на вердикт", () => {
    const v = computeVerdict(makeInput({ attachmentsCount: null }), SETTINGS)
    expect(
      check(makeInput({ attachmentsCount: null }), "document").status
    ).toBe("info")
    expect(v.level).toBe("ok")
  })

  it("выключенная в настройках проверка не влияет на вердикт", () => {
    const settings: VerdictSettings = {
      ...SETTINGS,
      include: { ...SETTINGS.include, document: false },
    }
    const v = computeVerdict(makeInput({ attachmentsCount: 0 }), settings)
    expect(v.level).toBe("ok")
  })

  it("финплан и «заранее согласовано» — всегда info (нет источника)", () => {
    expect(check(makeInput(), "finplan").status).toBe("info")
    expect(check(makeInput(), "preapproved").status).toBe("info")
  })

  it("описание ok-вердикта", () => {
    expect(computeVerdict(makeInput(), SETTINGS).description).toBe(
      "Все ключевые проверки пройдены"
    )
  })

  it("выключенная проваленная проверка не попадает в описание", () => {
    const settings: VerdictSettings = {
      ...SETTINGS,
      include: { ...SETTINGS.include, document: false },
    }
    const v = computeVerdict(makeInput({ attachmentsCount: 0 }), settings)
    expect(v.level).toBe("ok")
    expect(v.description).toBe("Все ключевые проверки пройдены")
  })
})

describe("проверка «Документ-основание»", () => {
  it("есть вложения → ok", () => {
    expect(check(makeInput({ attachmentsCount: 2 }), "document").status).toBe(
      "ok"
    )
  })

  it("вложений нет, есть комментарий → warn", () => {
    const input = makeInput({ attachmentsCount: 0 })
    input.request.comment = "оплата по устной договорённости"
    expect(check(input, "document").status).toBe("warn")
  })

  it("ни вложений, ни комментария → bad", () => {
    expect(check(makeInput({ attachmentsCount: 0 }), "document").status).toBe(
      "bad"
    )
  })

  it("срез вложений недоступен → info", () => {
    expect(
      check(makeInput({ attachmentsCount: null }), "document").status
    ).toBe("info")
  })
})
