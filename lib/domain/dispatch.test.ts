// lib/domain/dispatch.test.ts
import { describe, expect, it } from "vitest"
import { computeDispatchReadiness } from "./dispatch"

describe("computeDispatchReadiness", () => {
  it("есть файл и чат → awaiting_confirmation", () => {
    const r = computeDispatchReadiness({ hasFile: true, hasChatId: true })
    expect(r.status).toBe("awaiting_confirmation")
    expect(r.missing).toEqual([])
  })

  it("нет файла → not_ready с перечнем", () => {
    const r = computeDispatchReadiness({ hasFile: false, hasChatId: true })
    expect(r.status).toBe("not_ready")
    expect(r.missing).toEqual(["файл платёжки"])
  })

  it("нет чата → not_ready", () => {
    const r = computeDispatchReadiness({ hasFile: true, hasChatId: false })
    expect(r.missing).toEqual(["чат поставщика"])
  })

  it("нет ничего → оба пункта в перечне", () => {
    const r = computeDispatchReadiness({ hasFile: false, hasChatId: false })
    expect(r.status).toBe("not_ready")
    expect(r.missing).toEqual(["файл платёжки", "чат поставщика"])
  })
})
