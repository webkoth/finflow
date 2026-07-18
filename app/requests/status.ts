// app/requests/status.ts
// Ярлыки и стили статусов исполнения. Зелёный/красный — суть фичи,
// поэтому палитра Tailwind, а не только токены темы.
import type { ExecutionStatus } from "@prisma/client"
import type { CheckStatus, VerdictLevel } from "@/lib/domain/verdict"

export const STATUS_LABELS: Record<ExecutionStatus, string> = {
  on_approval: "На согласовании",
  declined: "Отклонена",
  awaiting: "Ждёт оплаты",
  executed: "Исполнена",
  overdue: "Просрочена",
}

export const STATUS_CLASSES: Record<ExecutionStatus, string> = {
  on_approval: "bg-muted text-muted-foreground",
  declined: "bg-muted text-muted-foreground line-through",
  awaiting: "bg-secondary text-secondary-foreground",
  executed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  overdue: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
}

// Цветные точки светофора. Палитра Tailwind — по той же причине,
// что и STATUS_CLASSES: зелёный/жёлтый/красный — суть фичи.
export const VERDICT_DOT_CLASSES: Record<
  Exclude<VerdictLevel, "block">,
  string
> = {
  ok: "bg-green-500",
  warn: "bg-yellow-400",
  bad: "bg-red-500",
}

export const CHECK_DOT_CLASSES: Record<CheckStatus, string> = {
  ok: "bg-green-500",
  warn: "bg-yellow-400",
  bad: "bg-red-500",
  info: "bg-muted-foreground/40",
}

export const VERDICT_PANEL_CLASSES: Record<
  Exclude<VerdictLevel, "block">,
  string
> = {
  ok: "border-green-500",
  warn: "border-yellow-400",
  bad: "border-red-500",
}
