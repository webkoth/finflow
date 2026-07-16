import { describe, expect, it } from "vitest"
import { validateBankAccountInput, type BankAccountInput } from "./bank-account"

const base: BankAccountInput = {
  name: "Основной",
  accountNumber: "40702810900000001234",
  bankName: "Сбербанк",
  bankBic: "044525225",
  currency: "RUB",
  organization: "ООО Ромашка",
}

describe("validateBankAccountInput", () => {
  it("принимает корректный счёт", () => {
    expect(validateBankAccountInput(base)).toBeNull()
  })
  it("требует название", () => {
    expect(validateBankAccountInput({ ...base, name: " " })).toMatch(/назв/i)
  })
  it("требует ровно 20 цифр в номере счёта", () => {
    expect(validateBankAccountInput({ ...base, accountNumber: "123" })).toMatch(
      /20/
    )
  })
  it("требует ровно 9 цифр в БИК", () => {
    expect(validateBankAccountInput({ ...base, bankBic: "12345" })).toMatch(
      /БИК/
    )
  })
  it("требует банк", () => {
    expect(validateBankAccountInput({ ...base, bankName: "" })).toMatch(/банк/i)
  })
  it("требует организацию", () => {
    expect(validateBankAccountInput({ ...base, organization: "" })).toMatch(
      /организац/i
    )
  })
})
