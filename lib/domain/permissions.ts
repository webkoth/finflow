// lib/domain/permissions.ts
// Права ролей (спека авторизации §6). Единственный источник истины:
// UI и server actions пользуются только can().
export type Role = "owner" | "accountant" | "viewer"

export type Action =
  | "approve_requests" // согласовать/отклонить (карточка и массово)
  | "comment_execution" // комментарии бухгалтера
  | "manage_cash_flow_items" // статьи ДДС (план 05)
  | "confirm_dispatch" // подтверждение отправки платёжек (план 05)
  | "manage_verdict_settings" // настройки светофора
  | "manage_users" // страница пользователей
  | "refresh_data" // кнопка «Обновить» (ручной синк)

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Собственник",
  accountant: "Бухгалтер",
  viewer: "Читатель",
}

const ALL_ACTIONS: readonly Action[] = [
  "approve_requests",
  "comment_execution",
  "manage_cash_flow_items",
  "confirm_dispatch",
  "manage_verdict_settings",
  "manage_users",
  "refresh_data",
]

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(ALL_ACTIONS),
  accountant: new Set([
    "comment_execution",
    "manage_cash_flow_items",
    "confirm_dispatch",
    "refresh_data",
  ]),
  viewer: new Set(["refresh_data"]),
}

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].has(action)
}
