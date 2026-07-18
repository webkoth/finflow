// lib/domain/permissions.test.ts
import { describe, expect, it } from "vitest"
import { can, ROLE_LABELS, type Action, type Role } from "./permissions"

// Матрица из спеки §6 — каждая клетка.
const MATRIX: Array<[Action, Record<Role, boolean>]> = [
  ["approve_requests", { owner: true, accountant: false, viewer: false }],
  ["comment_execution", { owner: true, accountant: true, viewer: false }],
  ["manage_cash_flow_items", { owner: true, accountant: true, viewer: false }],
  ["confirm_dispatch", { owner: true, accountant: true, viewer: false }],
  [
    "manage_verdict_settings",
    { owner: true, accountant: false, viewer: false },
  ],
  ["manage_users", { owner: true, accountant: false, viewer: false }],
  ["refresh_data", { owner: true, accountant: true, viewer: true }],
]

describe("can", () => {
  for (const [action, byRole] of MATRIX) {
    for (const role of Object.keys(byRole) as Role[]) {
      it(`${role} → ${action}: ${byRole[role]}`, () => {
        expect(can(role, action)).toBe(byRole[role])
      })
    }
  }

  it("неизвестная роль — запрет, не краш", () => {
    expect(can("ghost" as Role, "refresh_data")).toBe(false)
  })
})

describe("ROLE_LABELS", () => {
  it("русские ярлыки всех ролей", () => {
    expect(ROLE_LABELS.owner).toBe("Собственник")
    expect(ROLE_LABELS.accountant).toBe("Бухгалтер")
    expect(ROLE_LABELS.viewer).toBe("Читатель")
  })
})
