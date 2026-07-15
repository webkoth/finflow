// app/requests/status.ts
// Ярлыки и стили статусов исполнения. Зелёный/красный — суть фичи,
// поэтому палитра Tailwind, а не только токены темы.
import type { ExecutionStatus } from "@prisma/client"

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
