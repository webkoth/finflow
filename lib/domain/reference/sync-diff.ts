// Чистая логика синка справочников из 1С: разбор значений, план изменений,
// разрешение дерева. Без React, Prisma и сети.
import type { OneCFlow } from "@/lib/integrations/one-c-odata"

// Пустая ссылка в 1С — нулевой GUID.
export const ROOT_UID = "00000000-0000-0000-0000-000000000000"

const INFLOW_WORDS = ["поступление", "доход", "приход"]
const OUTFLOW_WORDS = ["выбытие", "расход", "списание"]

// Вид движения из 1С → наш enum. Нераспознанное значение не роняет синк:
// возвращается null, вызывающий код считает это предупреждением.
export function parseFlow(raw: string | null): OneCFlow | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (INFLOW_WORDS.includes(v)) return "INFLOW"
  if (OUTFLOW_WORDS.includes(v)) return "OUTFLOW"
  return null
}

export function parseParentUid(raw: string | null): string | null {
  if (!raw || raw === ROOT_UID) return null
  return raw
}
