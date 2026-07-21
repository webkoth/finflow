import { describe, expect, it } from "vitest"
import {
  ROOT_UID,
  buildSyncPlan,
  parseFlow,
  parseParentUid,
} from "./sync-diff"

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

type R = { uid: string; name: string; isDeletedIn1c: boolean }
type L = {
  id: string
  externalUid: string | null
  isActive: boolean
  name: string
}

const same = (r: R, l: L) => r.name === l.name

describe("buildSyncPlan", () => {
  it("новая запись попадает в toCreate", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда", isDeletedIn1c: false }],
      [],
      same
    )
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toCreate[0].uid).toBe("u1")
    expect(plan.toUpdate).toEqual([])
    expect(plan.toArchive).toEqual([])
  })

  it("изменившаяся запись попадает в toUpdate", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда офиса", isDeletedIn1c: false }],
      [{ id: "l1", externalUid: "u1", isActive: true, name: "Аренда" }],
      same
    )
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].localId).toBe("l1")
    expect(plan.toCreate).toEqual([])
  })

  it("совпадающая запись не трогается", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда", isDeletedIn1c: false }],
      [{ id: "l1", externalUid: "u1", isActive: true, name: "Аренда" }],
      same
    )
    expect(plan.unchanged).toBe(1)
    expect(plan.toCreate).toEqual([])
    expect(plan.toUpdate).toEqual([])
  })

  it("пропавшая из выгрузки уходит в архив", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда", isDeletedIn1c: false }],
      [
        { id: "l1", externalUid: "u1", isActive: true, name: "Аренда" },
        { id: "l2", externalUid: "u2", isActive: true, name: "Пропавшая" },
      ],
      same
    )
    expect(plan.toArchive).toEqual(["l2"])
  })

  it("помеченная удалённой в 1С уходит в архив", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда", isDeletedIn1c: true }],
      [{ id: "l1", externalUid: "u1", isActive: true, name: "Аренда" }],
      same
    )
    expect(plan.toArchive).toEqual(["l1"])
    expect(plan.toUpdate).toEqual([])
  })

  it("удалённая в 1С и отсутствующая у нас не создаётся", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда", isDeletedIn1c: true }],
      [],
      same
    )
    expect(plan.toCreate).toEqual([])
    expect(plan.toArchive).toEqual([])
  })

  it("уже заархивированная повторно не архивируется", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда", isDeletedIn1c: false }],
      [
        { id: "l1", externalUid: "u1", isActive: true, name: "Аренда" },
        { id: "l2", externalUid: "u2", isActive: false, name: "Старая" },
      ],
      same
    )
    expect(plan.toArchive).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it("записи без externalUid синк не трогает", () => {
    const plan = buildSyncPlan<R, L>(
      [{ uid: "u1", name: "Аренда", isDeletedIn1c: false }],
      [{ id: "local-only", externalUid: null, isActive: true, name: "Своя" }],
      same
    )
    expect(plan.toArchive).toEqual([])
    expect(plan.toCreate).toHaveLength(1)
  })

  it("пустая выгрузка при непустой базе — ошибка, а не массовая архивация", () => {
    expect(() =>
      buildSyncPlan<R, L>(
        [],
        [{ id: "l1", externalUid: "u1", isActive: true, name: "Аренда" }],
        same
      )
    ).toThrow(/пуст/i)
  })

  it("пустая выгрузка при пустой базе — не ошибка", () => {
    const plan = buildSyncPlan<R, L>([], [], same)
    expect(plan.toCreate).toEqual([])
    expect(plan.unchanged).toBe(0)
  })
})
