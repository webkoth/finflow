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

export type RemoteRecord = { uid: string; isDeletedIn1c: boolean }
export type LocalRecord = {
  id: string
  externalUid: string | null
  isActive: boolean
}

export type SyncPlan<R> = {
  toCreate: R[]
  toUpdate: { localId: string; remote: R }[]
  toArchive: string[] // локальные id
  unchanged: number
}

// Сравнивает выгрузку из 1С с текущим состоянием и возвращает план изменений.
// isEqual решает, изменилась ли запись (сравниваются только значимые поля).
//
// Пустая выгрузка при непустой базе — почти наверняка сбой 1С, а не «справочник
// опустел»: наивная логика заархивировала бы всё. Поэтому бросаем ошибку.
// Тот же принцип защиты стоит в синке заявок (lib/sync/run-sync.ts).
export function buildSyncPlan<R extends RemoteRecord, L extends LocalRecord>(
  remote: R[],
  local: L[],
  isEqual: (remote: R, local: L) => boolean
): SyncPlan<R> {
  const managed = local.filter((l) => l.externalUid !== null)
  if (remote.length === 0 && managed.length > 0) {
    throw new Error("1С вернула пустой справочник — синхронизация отменена")
  }

  const localByUid = new Map(managed.map((l) => [l.externalUid as string, l]))
  const plan: SyncPlan<R> = {
    toCreate: [],
    toUpdate: [],
    toArchive: [],
    unchanged: 0,
  }

  const seen = new Set<string>()
  for (const r of remote) {
    seen.add(r.uid)
    const l = localByUid.get(r.uid)
    if (r.isDeletedIn1c) {
      // Удалённых в 1С не заводим; уже заведённые — в архив (если ещё активны).
      if (l && l.isActive) plan.toArchive.push(l.id)
      continue
    }
    if (!l) {
      plan.toCreate.push(r)
    } else if (!isEqual(r, l) || !l.isActive) {
      // !isActive — запись вернулась в 1С после удаления, снимаем архив.
      plan.toUpdate.push({ localId: l.id, remote: r })
    } else {
      plan.unchanged++
    }
  }

  for (const l of managed) {
    if (!seen.has(l.externalUid as string) && l.isActive) {
      plan.toArchive.push(l.id)
    }
  }

  return plan
}

// 1С указывает родителя по своему UID, у нас идентификаторы свои. После записи
// всех статей строим связи вторым проходом — иначе статья, приехавшая раньше
// своей группы, осталась бы без родителя.
export function resolveParentLinks(
  remote: { uid: string; parentUid: string | null }[],
  idByUid: Map<string, string>
): { localId: string; parentId: string | null }[] {
  const links: { localId: string; parentId: string | null }[] = []
  for (const r of remote) {
    const localId = idByUid.get(r.uid)
    if (!localId) continue
    const parentId = r.parentUid ? (idByUid.get(r.parentUid) ?? null) : null
    links.push({ localId, parentId })
  }
  return links
}
