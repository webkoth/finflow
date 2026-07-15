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

  it("описание bad-вердикта не упоминает выключенную проваленную проверку", () => {
    // funds bad (не хватает по юрлицу) + document bad (нет основания), document выключен
    const settings: VerdictSettings = {
      ...SETTINGS,
      include: { ...SETTINGS.include, document: false },
    }
    const input = makeInput({
      attachmentsCount: 0,
      balances: [
        {
          accountUid: "acc-1",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          currency: "RUB",
          balanceMinor: 10_000_00n,
        },
      ],
    })
    const v = computeVerdict(input, settings)
    expect(v.level).toBe("bad")
    expect(v.description).not.toContain("Нет основания")
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

describe("проверка «Деньги на счёте»", () => {
  it("остаток счёта списания ≥ суммы → ok", () => {
    expect(check(makeInput(), "funds").status).toBe("ok")
  })

  it("на счёте не хватает, по юрлицу хватает → warn «нужен перевод»", () => {
    const input = makeInput({
      balances: [
        {
          accountUid: "acc-1",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          currency: "RUB",
          balanceMinor: 10_000_00n,
        },
        {
          accountUid: "acc-2",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "ВТБ $",
          currency: "USD",
          balanceMinor: 5_000_00n, // 5 000 $ × 76 = 380 000 ₽
        },
      ],
    })
    const c = check(input, "funds")
    expect(c.status).toBe("warn")
    expect(c.label).toBe("Нужен перевод между счетами")
  })

  it("не хватает по юрлицу целиком → bad", () => {
    const input = makeInput({
      balances: [
        {
          accountUid: "acc-1",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          currency: "RUB",
          balanceMinor: 10_000_00n,
        },
      ],
    })
    expect(check(input, "funds").status).toBe("bad")
  })

  it("счета другого юрлица не учитываются", () => {
    const input = makeInput({
      balances: [
        {
          accountUid: "acc-1",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          currency: "RUB",
          balanceMinor: 10_000_00n,
        },
        {
          accountUid: "acc-9",
          orgName: "РУСБУБОН",
          accountName: "Альфа ₽",
          currency: "RUB",
          balanceMinor: 100_000_000_00n,
        },
      ],
    })
    expect(check(input, "funds").status).toBe("bad")
  })

  it("счёт списания не указан, по юрлицу хватает → warn", () => {
    const input = makeInput()
    input.request.debitAccountUid = null
    const c = check(input, "funds")
    expect(c.status).toBe("warn")
    expect(c.label).toBe("Счёт списания не указан")
  })

  it("срез остатков пуст → info", () => {
    expect(check(makeInput({ balances: null }), "funds").status).toBe("info")
    expect(check(makeInput({ balances: [] }), "funds").status).toBe("info")
  })

  it("нет курса валюты заявки → info", () => {
    const input = makeInput({ rates: {} })
    input.request.currency = "CNY"
    expect(check(input, "funds").status).toBe("info")
  })
})

describe("проверка «Остаток фонда» (после платежа)", () => {
  const fund = {
    name: "Закупки товара",
    planWeekMinor: 500_000_00n,
    factWeekMinor: 100_000_00n,
    balanceMinor: 400_000_00n,
  }

  it("остаток после платежа ровно 0 → ok", () => {
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    expect(check(input, "fund_balance").status).toBe("ok") // 100k − 100k = 0
  })

  it("после платежа минус ровно 20% плана недели → warn (граница)", () => {
    // 100k − 200k = −100k; план 500k → 20%
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    input.request.amountMinor = 200_000_00n
    const c = check(input, "fund_balance")
    expect(c.status).toBe("warn")
  })

  it("минус глубже 20% → bad", () => {
    // 100k − 201k = −101k; план 500k → 20,2%
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    input.request.amountMinor = 201_000_00n
    expect(check(input, "fund_balance").status).toBe("bad")
  })

  it("план недели 0 и фонд в минусе → bad", () => {
    const input = makeInput({
      fund: { ...fund, planWeekMinor: 0n, balanceMinor: 0n },
    })
    input.request.amountMinor = 1_00n
    expect(check(input, "fund_balance").status).toBe("bad")
  })

  it("валютная заявка пересчитывается в ₽ по курсу", () => {
    // 10 000 CNY × 11,5 = 115 000 ₽ > остатка 100 000 ₽ → минус 15 000 ₽ = 3% плана → warn
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    input.request.currency = "CNY"
    input.request.amountMinor = 10_000_00n
    expect(check(input, "fund_balance").status).toBe("warn")
  })

  it("фонда нет в срезе → info", () => {
    expect(check(makeInput({ fund: null }), "fund_balance").status).toBe("info")
  })
})
