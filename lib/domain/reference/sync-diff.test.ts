import { describe, expect, it } from "vitest"
import { ROOT_UID, parseFlow, parseParentUid } from "./sync-diff"

describe("parseFlow", () => {
  it("распознаёт приток", () => {
    expect(parseFlow("Поступление")).toBe("INFLOW")
    expect(parseFlow("Доход")).toBe("INFLOW")
  })

  it("распознаёт отток", () => {
    expect(parseFlow("Выбытие")).toBe("OUTFLOW")
    expect(parseFlow("Расход")).toBe("OUTFLOW")
  })

  it("не зависит от регистра и пробелов", () => {
    expect(parseFlow("  расход ")).toBe("OUTFLOW")
  })

  it("для пустого и нераспознанного возвращает null", () => {
    expect(parseFlow(null)).toBeNull()
    expect(parseFlow("")).toBeNull()
    expect(parseFlow("НечтоНовое")).toBeNull()
  })
})

describe("parseParentUid", () => {
  it("нулевой GUID — это корень", () => {
    expect(parseParentUid(ROOT_UID)).toBeNull()
  })

  it("пустое значение — тоже корень", () => {
    expect(parseParentUid(null)).toBeNull()
    expect(parseParentUid("")).toBeNull()
  })

  it("обычный UID возвращается как есть", () => {
    expect(parseParentUid("abc-123")).toBe("abc-123")
  })
})
