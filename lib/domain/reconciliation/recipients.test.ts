import { describe, expect, it } from "vitest"
import { normalizeName, matchRecipient } from "./recipients"

describe("normalizeName", () => {
  it("убирает орг-форму, кавычки и регистр", () => {
    expect(normalizeName("ООО «Ромашка»")).toBe("РОМАШКА")
    expect(normalizeName("ИП Иванов И.И.")).toBe("ИВАНОВ И.И.")
  })

  it("схлопывает пробелы", () => {
    expect(normalizeName("  Тори   Брэндс ")).toBe("ТОРИ БРЭНДС")
  })
})

describe("matchRecipient", () => {
  it("совпадение по ИНН — сильный матч", () => {
    const r = matchRecipient(
      { name: "ООО Ромашка", inn: "7701234567", account: "111" },
      { name: "Ромашка", inn: "7701234567", account: "222" }
    )
    expect(r).toBe("match")
  })

  it("разные ИНН — mismatch, даже если имена похожи", () => {
    const r = matchRecipient(
      { name: "Ромашка", inn: "7701234567", account: null },
      { name: "Ромашка", inn: "7709999999", account: null }
    )
    expect(r).toBe("mismatch")
  })

  it("нет ИНН — сверка по счёту", () => {
    expect(
      matchRecipient(
        { name: "A", inn: null, account: "40817810099910004312" },
        { name: "B", inn: null, account: "40817810099910004312" }
      )
    ).toBe("match")
    expect(
      matchRecipient(
        { name: "A", inn: null, account: "111" },
        { name: "B", inn: null, account: "222" }
      )
    ).toBe("mismatch")
  })

  it("нет ни ИНН, ни счёта — слабый матч по имени", () => {
    expect(
      matchRecipient(
        { name: "ООО «Ромашка»", inn: null, account: null },
        { name: "Ромашка", inn: null, account: null }
      )
    ).toBe("weak-match")
    expect(
      matchRecipient(
        { name: "Ромашка", inn: null, account: null },
        { name: "Одуванчик", inn: null, account: null }
      )
    ).toBe("mismatch")
  })
})
