# Синхронизация справочников из 1С (OData) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Справочники статей ДДС, статей БДР и банковских счетов приезжают в finflow из 1С по OData — раз в сутки автоматически и по кнопке вручную; в самом finflow они становятся только для чтения.

**Architecture:** Получение, сравнение и запись разделены. Клиент OData (`lib/integrations/one-c-odata*`) отдаёт плоские записи; чистая функция (`lib/domain/reference/sync-diff.ts`) строит план изменений и покрыта unit-тестами без сети и БД; оркестратор (`lib/sync/run-reference-sync.ts`) применяет план одной транзакцией и пишет журнал. Разработка идёт на фикстурах — прав на OData у пользователя 1С пока нет.

**Tech Stack:** Next.js App Router, TypeScript, Prisma + PostgreSQL, Vitest, Playwright, shadcn/ui, Tailwind.

**Спека:** `docs/superpowers/specs/2026-07-21-onec-reference-sync-design.md` (коммит `4fc115b`).

**Ветка:** `feature/onec-reference-sync` (создаётся в Task 0). Доставка — через `/ship`, не вручную.

---

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `prisma/schema.prisma` | + `externalUid`/`syncedAt`/`isDeletedIn1c` у `Article` и `BankAccount`; + модель `ReferenceSyncRun` |
| `lib/integrations/one-c-odata.ts` | типы записей 1С, интерфейс шлюза, фабрика по `ONEC_ODATA_MODE` |
| `lib/integrations/one-c-odata-fixture.ts` | те же данные из кода — dev и e2e, без сети |
| `lib/integrations/one-c-odata-http.ts` | реальный HTTP-клиент OData: basic auth, только GET, постранично, карта имён объектов 1С |
| `lib/domain/reference/sync-diff.ts` | ЧИСТАЯ логика: маппинг значений 1С, план изменений, разрешение дерева |
| `lib/domain/reference/sync-diff.test.ts` | unit-тесты этой логики |
| `lib/domain/dates.ts` | + `formatDateTime` (дата и время, Москва) |
| `lib/sync/run-reference-sync.ts` | оркестрация: получить → сравнить → применить транзакцией → журнал |
| `app/api/jobs/sync-reference/route.ts` | точка входа ночного расписания |
| `app/reference/actions.ts` | server action кнопки «Обновить из 1С» |
| `components/reference/sync-status.tsx` | панель «данные из 1С, обновлено …» + кнопка + ошибка |
| `app/reference/*/page.tsx` | режим только чтения |
| `prisma/seed.ts` | демо-справочники со стабильными `externalUid` |
| `tests/e2e/reference.spec.ts` | переписан под режим только чтения |

**Удаляются** (источник истины — 1С, редактирование в finflow исчезает):
`app/reference/article-actions.ts`, `app/reference/cashflow-items/actions.ts`,
`app/reference/pnl-items/actions.ts`, `app/reference/bank-accounts/actions.ts`,
`app/reference/bank-accounts/bank-account-form.tsx`,
`components/reference/article-form.tsx`.

---

### Task 0: Ветка

- [ ] **Step 1: Создать ветку от develop**

```bash
git checkout develop
git pull
git checkout -b feature/onec-reference-sync
```

- [ ] **Step 2: Убедиться, что рабочая копия чистая**

Run: `git status --short`
Expected: пустой вывод.

---

### Task 1: Схема БД и миграция

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить поля синка в `Article`**

В модель `Article` (после `isActive`) добавить:

```prisma
  externalUid   String?   @unique // UID записи в 1С; пусто у записей не из 1С
  syncedAt      DateTime? @db.Timestamptz(3)
  isDeletedIn1c Boolean   @default(false)
```

- [ ] **Step 2: Добавить те же поля в `BankAccount`**

В модель `BankAccount` (после `isActive`) добавить:

```prisma
  externalUid   String?   @unique
  syncedAt      DateTime? @db.Timestamptz(3)
  isDeletedIn1c Boolean   @default(false)
```

- [ ] **Step 3: Добавить журнал запусков**

В конец `prisma/schema.prisma`:

```prisma
// --- Синк справочников из 1С (спека 2026-07-21-onec-reference-sync-design) ---

enum ReferenceSyncStatus {
  running
  ok
  error
}

enum ReferenceSyncTrigger {
  cron
  manual
}

// Журнал запусков синка справочников. Отдельно от SyncRun (заявки на оплату):
// у них разные счётчики, общая таблица держала бы половину колонок пустыми.
model ReferenceSyncRun {
  id         String               @id @default(cuid())
  startedAt  DateTime             @default(now()) @db.Timestamptz(3)
  finishedAt DateTime?            @db.Timestamptz(3)
  status     ReferenceSyncStatus
  trigger    ReferenceSyncTrigger
  created    Int                  @default(0)
  updated    Int                  @default(0)
  archived   Int                  @default(0)
  unchanged  Int                  @default(0)
  warnings   Int                  @default(0) // напр. нераспознанный тип статьи
  error      String?

  @@index([status, startedAt])
  @@map("reference_sync_runs")
}
```

- [ ] **Step 4: Применить миграцию**

Run: `npx prisma migrate dev --name onec-reference-sync`
Expected: `Your database is now in sync with your schema`. Миграция недеструктивная — только новые nullable-поля, поля с дефолтом и новая таблица.

- [ ] **Step 5: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: поля синка справочников и журнал запусков в схеме"
```

---

### Task 2: Контракт шлюза 1С и фикстура

**Files:**
- Create: `lib/integrations/one-c-odata.ts`
- Create: `lib/integrations/one-c-odata-fixture.ts`

- [ ] **Step 1: Описать типы и фабрику**

Создать `lib/integrations/one-c-odata.ts`:

```ts
// Контракт чтения справочников из 1С. Синк работает только через OneCGateway —
// реализацию выбирает фабрика по env ONEC_ODATA_MODE.
import { fixtureOneCGateway } from "./one-c-odata-fixture"
import { httpOneCGateway } from "./one-c-odata-http"

export type OneCArticleKind = "CASHFLOW" | "PNL"
export type OneCFlow = "INFLOW" | "OUTFLOW"

export type OneCArticle = {
  uid: string
  code: string | null
  name: string
  parentUid: string | null // null — статья лежит в корне справочника
  isGroup: boolean
  flow: OneCFlow | null // null у групп и у нераспознанного вида
  description: string | null
  isDeletedIn1c: boolean
}

export type OneCBankAccount = {
  uid: string
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
  isDeletedIn1c: boolean
}

export interface OneCGateway {
  fetchArticles(kind: OneCArticleKind): Promise<OneCArticle[]>
  fetchBankAccounts(): Promise<OneCBankAccount[]>
}

// ONEC_ODATA_MODE: "fixture" (по умолчанию — демо-данные, dev/e2e) | "real".
// Незаданный режим не даёт молчаливый mock в prod — только явная ошибка.
export function getOneCGateway(): OneCGateway {
  const mode = process.env.ONEC_ODATA_MODE ?? "fixture"
  if (mode === "fixture") return fixtureOneCGateway
  if (mode === "real") return httpOneCGateway
  throw new Error(`ONEC_ODATA_MODE="${mode}" не поддерживается`)
}
```

- [ ] **Step 2: Написать фикстуру**

Создать `lib/integrations/one-c-odata-fixture.ts`:

```ts
// Демо-справочники в формате 1С. Используются в dev (ONEC_ODATA_MODE=fixture),
// seed и e2e. UID имитируют GUID из 1С, но узнаваемы по префиксу.
import type {
  OneCArticle,
  OneCArticleKind,
  OneCBankAccount,
  OneCGateway,
} from "./one-c-odata"

const CASHFLOW: OneCArticle[] = [
  {
    uid: "fx-cf-group-op",
    code: "1",
    name: "Операционная деятельность",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-in-buyers",
    code: "1.1",
    name: "Поступления от покупателей",
    parentUid: "fx-cf-group-op",
    isGroup: false,
    flow: "INFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-out-suppliers",
    code: "1.2",
    name: "Оплата поставщикам",
    parentUid: "fx-cf-group-op",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-group-fin",
    code: "2",
    name: "Финансовая деятельность",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-in-loans",
    code: "2.1",
    name: "Кредиты и займы",
    parentUid: "fx-cf-group-fin",
    isGroup: false,
    flow: "INFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-cf-out-old",
    code: "2.9",
    name: "Устаревшая статья",
    parentUid: "fx-cf-group-fin",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: true, // проверяем архивацию по пометке удаления
  },
]

const PNL: OneCArticle[] = [
  {
    uid: "fx-pnl-group-inc",
    code: "1",
    name: "Доходы",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-revenue",
    code: "1.1",
    name: "Выручка",
    parentUid: "fx-pnl-group-inc",
    isGroup: false,
    flow: "INFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-group-exp",
    code: "2",
    name: "Расходы",
    parentUid: null,
    isGroup: true,
    flow: null,
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-salary",
    code: "2.1",
    name: "Зарплата",
    parentUid: "fx-pnl-group-exp",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: false,
  },
  {
    uid: "fx-pnl-rent",
    code: "2.2",
    name: "Аренда",
    parentUid: "fx-pnl-group-exp",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: false,
  },
]

const ACCOUNTS: OneCBankAccount[] = [
  {
    uid: "fx-acc-sber",
    name: "Расчётный счёт Сбербанк",
    accountNumber: "40702810900000001111",
    bankName: "ПАО Сбербанк",
    bankBic: "044525225",
    currency: "RUB",
    organization: "ТОРИ БРЭНДС ООО",
    isDeletedIn1c: false,
  },
  {
    uid: "fx-acc-tbank",
    name: "Расчётный счёт Т-Банк",
    accountNumber: "40702810900000002222",
    bankName: "АО «ТБанк»",
    bankBic: "044525974",
    currency: "RUB",
    organization: "ИП Бобровская",
    isDeletedIn1c: false,
  },
]

export const fixtureOneCGateway: OneCGateway = {
  async fetchArticles(kind: OneCArticleKind) {
    return kind === "CASHFLOW" ? CASHFLOW : PNL
  },
  async fetchBankAccounts() {
    return ACCOUNTS
  },
}
```

- [ ] **Step 3: Заглушка HTTP-клиента, чтобы проект собирался**

Реальный клиент пишется в Task 7, но импорт в фабрике уже есть. Создать `lib/integrations/one-c-odata-http.ts`:

```ts
// Реальный клиент OData появится в Task 7 этого плана.
import type { OneCGateway } from "./one-c-odata"

export const httpOneCGateway: OneCGateway = {
  async fetchArticles() {
    throw new Error("HTTP-клиент OData ещё не реализован")
  },
  async fetchBankAccounts() {
    throw new Error("HTTP-клиент OData ещё не реализован")
  },
}
```

- [ ] **Step 4: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/one-c-odata.ts lib/integrations/one-c-odata-fixture.ts lib/integrations/one-c-odata-http.ts
git commit -m "feat: контракт шлюза 1С и фикстура справочников"
```

---

### Task 3: Маппинг значений 1С (чистая логика, TDD)

**Files:**
- Create: `lib/domain/reference/sync-diff.ts`
- Test: `lib/domain/reference/sync-diff.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `lib/domain/reference/sync-diff.test.ts`:

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run lib/domain/reference/sync-diff.test.ts`
Expected: FAIL — `Failed to resolve import "./sync-diff"`.

- [ ] **Step 3: Реализовать минимум**

Создать `lib/domain/reference/sync-diff.ts`:

```ts
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
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npx vitest run lib/domain/reference/sync-diff.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reference/sync-diff.ts lib/domain/reference/sync-diff.test.ts
git commit -m "feat: разбор значений справочников 1С"
```

---

### Task 4: План изменений (чистая логика, TDD)

**Files:**
- Modify: `lib/domain/reference/sync-diff.ts`
- Test: `lib/domain/reference/sync-diff.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Дописать в конец `lib/domain/reference/sync-diff.test.ts`:

```ts
import { buildSyncPlan } from "./sync-diff"

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
      [],
      [{ id: "l1", externalUid: "u1", isActive: false, name: "Старая" }],
      same
    )
    expect(plan.toArchive).toEqual([])
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
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `npx vitest run lib/domain/reference/sync-diff.test.ts`
Expected: FAIL — `buildSyncPlan is not exported`.

- [ ] **Step 3: Реализовать**

Дописать в `lib/domain/reference/sync-diff.ts`:

```ts
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
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `npx vitest run lib/domain/reference/sync-diff.test.ts`
Expected: PASS, 17 тестов.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reference/sync-diff.ts lib/domain/reference/sync-diff.test.ts
git commit -m "feat: построение плана изменений справочников"
```

---

### Task 5: Разрешение дерева статей (чистая логика, TDD)

**Files:**
- Modify: `lib/domain/reference/sync-diff.ts`
- Test: `lib/domain/reference/sync-diff.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Дописать в конец `lib/domain/reference/sync-diff.test.ts`:

```ts
import { resolveParentLinks } from "./sync-diff"

describe("resolveParentLinks", () => {
  const idByUid = new Map([
    ["u-group", "local-group"],
    ["u-child", "local-child"],
    ["u-root", "local-root"],
  ])

  it("связывает потомка с родителем по UID", () => {
    const links = resolveParentLinks(
      [{ uid: "u-child", parentUid: "u-group" }],
      idByUid
    )
    expect(links).toEqual([{ localId: "local-child", parentId: "local-group" }])
  })

  it("корневая статья получает parentId = null", () => {
    const links = resolveParentLinks(
      [{ uid: "u-root", parentUid: null }],
      idByUid
    )
    expect(links).toEqual([{ localId: "local-root", parentId: null }])
  })

  it("неизвестный родитель не роняет разбор — статья остаётся в корне", () => {
    const links = resolveParentLinks(
      [{ uid: "u-child", parentUid: "u-неизвестный" }],
      idByUid
    )
    expect(links).toEqual([{ localId: "local-child", parentId: null }])
  })

  it("статьи, которых нет в карте, пропускаются", () => {
    const links = resolveParentLinks(
      [{ uid: "u-чужой", parentUid: "u-group" }],
      idByUid
    )
    expect(links).toEqual([])
  })
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что они падают**

Run: `npx vitest run lib/domain/reference/sync-diff.test.ts`
Expected: FAIL — `resolveParentLinks is not exported`.

- [ ] **Step 3: Реализовать**

Дописать в `lib/domain/reference/sync-diff.ts`:

```ts
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
```

- [ ] **Step 4: Запустить тесты и убедиться, что они проходят**

Run: `npx vitest run lib/domain/reference/sync-diff.test.ts`
Expected: PASS, 21 тест.

- [ ] **Step 5: Прогнать все unit-тесты**

Run: `npm run test`
Expected: все файлы PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/reference/sync-diff.ts lib/domain/reference/sync-diff.test.ts
git commit -m "feat: разрешение дерева статей по UID из 1С"
```

---

### Task 6: Оркестратор синка

**Files:**
- Create: `lib/sync/run-reference-sync.ts`

- [ ] **Step 1: Написать оркестратор**

Создать `lib/sync/run-reference-sync.ts`:

```ts
// Синк справочников из 1С: получить полный снимок → сравнить → применить
// одной транзакцией → записать в журнал. Источник истины — 1С.
import { prisma } from "@/lib/db"
import {
  buildSyncPlan,
  resolveParentLinks,
} from "@/lib/domain/reference/sync-diff"
import type {
  OneCArticle,
  OneCArticleKind,
  OneCBankAccount,
  OneCGateway,
} from "@/lib/integrations/one-c-odata"
import type { ReferenceSyncTrigger } from "@prisma/client"

const RUNNING_STALE_MS = 10 * 60 * 1000

export type ReferenceSyncResult =
  | { skipped: true }
  | {
      skipped: false
      runId: string
      status: "ok" | "error"
      created: number
      updated: number
      archived: number
      unchanged: number
      warnings: number
      error?: string
    }

type Totals = {
  created: number
  updated: number
  archived: number
  unchanged: number
  warnings: number
}

type LocalArticle = {
  id: string
  externalUid: string | null
  isActive: boolean
  name: string
  code: string | null
  flow: "INFLOW" | "OUTFLOW" | null
  isGroup: boolean
  description: string | null
  parent: { externalUid: string | null } | null
}

function articleEquals(r: OneCArticle, l: LocalArticle): boolean {
  return (
    r.name === l.name &&
    r.code === l.code &&
    r.flow === l.flow &&
    r.isGroup === l.isGroup &&
    r.description === l.description &&
    r.parentUid === (l.parent?.externalUid ?? null)
  )
}

type LocalAccount = {
  id: string
  externalUid: string | null
  isActive: boolean
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
}

function accountEquals(r: OneCBankAccount, l: LocalAccount): boolean {
  return (
    r.name === l.name &&
    r.accountNumber === l.accountNumber &&
    r.bankName === l.bankName &&
    r.bankBic === l.bankBic &&
    r.currency === l.currency &&
    r.organization === l.organization
  )
}

export async function runReferenceSync(
  gateway: OneCGateway,
  trigger: ReferenceSyncTrigger
): Promise<ReferenceSyncResult> {
  // Не более одного синка одновременно; зависший running старше 10 минут
  // не блокирует новый запуск.
  const running = await prisma.referenceSyncRun.findFirst({
    where: {
      status: "running",
      startedAt: { gt: new Date(Date.now() - RUNNING_STALE_MS) },
    },
  })
  if (running) return { skipped: true }

  const run = await prisma.referenceSyncRun.create({
    data: { status: "running", trigger },
  })

  const totals: Totals = {
    created: 0,
    updated: 0,
    archived: 0,
    unchanged: 0,
    warnings: 0,
  }

  try {
    const [cashflow, pnl, accounts] = await Promise.all([
      gateway.fetchArticles("CASHFLOW"),
      gateway.fetchArticles("PNL"),
      gateway.fetchBankAccounts(),
    ])

    // Нераспознанный вид движения у конечной статьи — предупреждение, не сбой.
    for (const a of [...cashflow, ...pnl]) {
      if (!a.isGroup && a.flow === null && !a.isDeletedIn1c) totals.warnings++
    }

    const syncedAt = new Date()

    await prisma.$transaction(async (tx) => {
      await applyArticles(tx, "CASHFLOW", cashflow, syncedAt, totals)
      await applyArticles(tx, "PNL", pnl, syncedAt, totals)
      await applyAccounts(tx, accounts, syncedAt, totals)
    })

    await prisma.referenceSyncRun.update({
      where: { id: run.id },
      data: { status: "ok", finishedAt: new Date(), ...totals },
    })
    return { skipped: false, runId: run.id, status: "ok", ...totals }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await prisma.referenceSyncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error: message },
    })
    return {
      skipped: false,
      runId: run.id,
      status: "error",
      error: message,
      ...totals,
    }
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function applyArticles(
  tx: Tx,
  kind: OneCArticleKind,
  remote: OneCArticle[],
  syncedAt: Date,
  totals: Totals
) {
  const local: LocalArticle[] = await tx.article.findMany({
    where: { kind },
    select: {
      id: true,
      externalUid: true,
      isActive: true,
      name: true,
      code: true,
      flow: true,
      isGroup: true,
      description: true,
      parent: { select: { externalUid: true } },
    },
  })

  const plan = buildSyncPlan(remote, local, articleEquals)
  const idByUid = new Map<string, string>()
  for (const l of local) {
    if (l.externalUid) idByUid.set(l.externalUid, l.id)
  }

  for (const r of plan.toCreate) {
    const created = await tx.article.create({
      data: {
        kind,
        externalUid: r.uid,
        name: r.name,
        code: r.code,
        flow: r.flow,
        isGroup: r.isGroup,
        description: r.description,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
      select: { id: true },
    })
    idByUid.set(r.uid, created.id)
    totals.created++
  }

  for (const { localId, remote: r } of plan.toUpdate) {
    await tx.article.update({
      where: { id: localId },
      data: {
        name: r.name,
        code: r.code,
        flow: r.flow,
        isGroup: r.isGroup,
        description: r.description,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
    })
    totals.updated++
  }

  if (plan.toArchive.length > 0) {
    const archived = await tx.article.updateMany({
      where: { id: { in: plan.toArchive } },
      data: { isActive: false, isDeletedIn1c: true, syncedAt },
    })
    totals.archived += archived.count
  }

  totals.unchanged += plan.unchanged

  // Второй проход: связи «родитель — потомок» по карте UID → локальный id.
  const links = resolveParentLinks(
    remote.filter((r) => !r.isDeletedIn1c),
    idByUid
  )
  for (const link of links) {
    await tx.article.update({
      where: { id: link.localId },
      data: { parentId: link.parentId },
    })
  }
}

async function applyAccounts(
  tx: Tx,
  remote: OneCBankAccount[],
  syncedAt: Date,
  totals: Totals
) {
  const local: LocalAccount[] = await tx.bankAccount.findMany({
    select: {
      id: true,
      externalUid: true,
      isActive: true,
      name: true,
      accountNumber: true,
      bankName: true,
      bankBic: true,
      currency: true,
      organization: true,
    },
  })

  const plan = buildSyncPlan(remote, local, accountEquals)

  for (const r of plan.toCreate) {
    await tx.bankAccount.create({
      data: {
        externalUid: r.uid,
        name: r.name,
        accountNumber: r.accountNumber,
        bankName: r.bankName,
        bankBic: r.bankBic,
        currency: r.currency,
        organization: r.organization,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
    })
    totals.created++
  }

  for (const { localId, remote: r } of plan.toUpdate) {
    await tx.bankAccount.update({
      where: { id: localId },
      data: {
        name: r.name,
        accountNumber: r.accountNumber,
        bankName: r.bankName,
        bankBic: r.bankBic,
        currency: r.currency,
        organization: r.organization,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
    })
    totals.updated++
  }

  if (plan.toArchive.length > 0) {
    const archived = await tx.bankAccount.updateMany({
      where: { id: { in: plan.toArchive } },
      data: { isActive: false, isDeletedIn1c: true, syncedAt },
    })
    totals.archived += archived.count
  }

  totals.unchanged += plan.unchanged
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 3: Прогнать синк вручную на dev-базе**

```bash
npx tsx -e "import { runReferenceSync } from './lib/sync/run-reference-sync'; import { fixtureOneCGateway } from './lib/integrations/one-c-odata-fixture'; runReferenceSync(fixtureOneCGateway, 'manual').then(r => { console.log(r); process.exit(0) })"
```

Expected: `status: 'ok'`, `created: 12` — 5 статей ДДС (в фикстуре 6, одна помечена удалённой в 1С и не заводится) + 5 статей БДР + 2 счёта.

- [ ] **Step 4: Прогнать повторно — второй запуск не должен ничего менять**

Повторить команду из Step 3.
Expected: `created: 0`, `updated: 0`, `archived: 0`, `unchanged: 12`. Это ключевая проверка: синк идемпотентен и не переписывает справочник каждую ночь.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/run-reference-sync.ts
git commit -m "feat: оркестрация синка справочников из 1С"
```

---

### Task 7: Реальный HTTP-клиент OData

**Files:**
- Modify: `lib/integrations/one-c-odata-http.ts`

- [ ] **Step 1: Заменить заглушку реальным клиентом**

Полностью заменить содержимое `lib/integrations/one-c-odata-http.ts`:

```ts
// Реальный клиент OData 1С: basic auth, только GET, постранично.
// Имена объектов и реквизитов 1С собраны здесь в одной карте: конфигурация
// rbb_cut на момент написания недоступна (нет прав на OData), точные имена
// подставляются на шаге проверки подключения — см. Task 12 плана.
import { parseFlow, parseParentUid } from "@/lib/domain/reference/sync-diff"
import type {
  OneCArticle,
  OneCArticleKind,
  OneCBankAccount,
  OneCGateway,
} from "./one-c-odata"

const TIMEOUT_MS = 30_000
const PAGE_SIZE = 1000

// Имена наборов и реквизитов в конфигурации 1С.
// ВНИМАНИЕ: значения предварительные, уточняются в Task 12.
const NAMES = {
  articles: {
    CASHFLOW: "Catalog_СтатьиДвиженияДенежныхСредств",
    PNL: "Catalog_СтатьиДоходовИРасходов",
  },
  articleFields: {
    uid: "Ref_Key",
    code: "Code",
    name: "Description",
    parent: "Parent_Key",
    isGroup: "IsFolder",
    flow: "ВидДвижения",
    description: "Комментарий",
    deleted: "DeletionMark",
  },
  accounts: "Catalog_БанковскиеСчета",
  accountFields: {
    uid: "Ref_Key",
    name: "Description",
    number: "НомерСчета",
    bankName: "Банк/Description",
    bankBic: "Банк/Код",
    currency: "ВалютаДенежныхСредств/Code",
    organization: "Владелец/Description",
    deleted: "DeletionMark",
  },
} as const

type Row = Record<string, unknown>

function str(row: Row, field: string): string | null {
  const v = row[field]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

function required(row: Row, field: string, set: string): string {
  const v = str(row, field)
  if (v === null) {
    throw new Error(`1С: в наборе ${set} нет обязательного поля ${field}`)
  }
  return v
}

function config() {
  const base = process.env.ONEC_ODATA_URL
  const user = process.env.ONEC_ODATA_USER
  const password = process.env.ONEC_ODATA_PASSWORD
  if (!base || !user || !password) {
    throw new Error(
      "Не заданы ONEC_ODATA_URL / ONEC_ODATA_USER / ONEC_ODATA_PASSWORD"
    )
  }
  const auth =
    "Basic " + Buffer.from(`${user}:${password}`, "utf8").toString("base64")
  return { base: base.replace(/\/$/, ""), auth }
}

// Читает набор целиком, страницами по PAGE_SIZE.
async function fetchAll(set: string): Promise<Row[]> {
  const { base, auth } = config()
  const rows: Row[] = []
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const url = `${base}/${set}?$format=json&$top=${PAGE_SIZE}&$skip=${skip}`
    const res = await fetch(url, {
      headers: { Authorization: auth, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 401) {
      throw new Error(
        "1С отклонила авторизацию (401): проверьте учётку и право «Использование стандартного интерфейса OData»"
      )
    }
    if (!res.ok) {
      throw new Error(`1С ответила ошибкой: HTTP ${res.status} для набора ${set}`)
    }
    const json = (await res.json()) as { value?: Row[] }
    const page = json.value ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export const httpOneCGateway: OneCGateway = {
  async fetchArticles(kind: OneCArticleKind): Promise<OneCArticle[]> {
    const set = NAMES.articles[kind]
    const f = NAMES.articleFields
    const rows = await fetchAll(set)
    return rows.map((row) => ({
      uid: required(row, f.uid, set),
      code: str(row, f.code),
      name: required(row, f.name, set),
      parentUid: parseParentUid(str(row, f.parent)),
      isGroup: row[f.isGroup] === true,
      flow: parseFlow(str(row, f.flow)),
      description: str(row, f.description),
      isDeletedIn1c: row[f.deleted] === true,
    }))
  },

  async fetchBankAccounts(): Promise<OneCBankAccount[]> {
    const set = NAMES.accounts
    const f = NAMES.accountFields
    const rows = await fetchAll(set)
    return rows.map((row) => ({
      uid: required(row, f.uid, set),
      name: required(row, f.name, set),
      accountNumber: str(row, f.number) ?? "",
      bankName: str(row, f.bankName) ?? "",
      bankBic: str(row, f.bankBic) ?? "",
      currency: str(row, f.currency) ?? "RUB",
      organization: str(row, f.organization) ?? "",
      isDeletedIn1c: row[f.deleted] === true,
    }))
  },
}
```

- [ ] **Step 2: Проверить типы и линт**

Run: `npm run typecheck && npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add lib/integrations/one-c-odata-http.ts
git commit -m "feat: HTTP-клиент OData для чтения справочников 1С"
```

---

### Task 8: Эндпоинт ночного запуска

**Files:**
- Create: `app/api/jobs/sync-reference/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Написать эндпоинт**

Создать `app/api/jobs/sync-reference/route.ts`:

```ts
// Запуск синка справочников планировщиком (cron на сервере, раз в сутки ночью):
//   curl -X POST -H "x-sync-secret: $REFERENCE_SYNC_SECRET" <host>/api/jobs/sync-reference
import { NextRequest, NextResponse } from "next/server"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReferenceSync } from "@/lib/sync/run-reference-sync"

export async function POST(req: NextRequest) {
  const secret = process.env.REFERENCE_SYNC_SECRET
  if (!secret || req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runReferenceSync(getOneCGateway(), "cron")
  const status = !result.skipped && result.status === "error" ? 500 : 200
  return NextResponse.json(result, { status })
}
```

- [ ] **Step 2: Дописать переменные в `.env.example`**

В конец `.env.example`:

```
# --- Справочники из 1С (спека 2026-07-21-onec-reference-sync-design) ---
# Режим чтения: fixture (демо-данные, без сети — dev/e2e) | real
ONEC_ODATA_MODE="fixture"
# Для ONEC_ODATA_MODE=real:
# ONEC_ODATA_URL="http://192.168.79.250:1281/rbb_cut/odata/standard.odata"
# ONEC_ODATA_USER="<пользователь 1С только на чтение>"
# ONEC_ODATA_PASSWORD="<пароль>"
# Секрет ночного запуска: POST /api/jobs/sync-reference, заголовок x-sync-secret
REFERENCE_SYNC_SECRET="<случайная-строка>"
```

- [ ] **Step 3: Добавить те же переменные в локальный `.env`**

В `.env` дописать `ONEC_ODATA_MODE="fixture"` и `REFERENCE_SYNC_SECRET="local-dev-secret"`. Значения `ONEC_ODATA_URL` / `USER` / `PASSWORD` там уже есть.

- [ ] **Step 4: Проверить эндпоинт**

Запустить `npm run dev`, затем:

```bash
curl -s -X POST -H "x-sync-secret: local-dev-secret" http://localhost:3000/api/jobs/sync-reference
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/jobs/sync-reference
```

Expected: первый — JSON со `"status":"ok"`; второй — `401`.

- [ ] **Step 5: Commit**

```bash
git add app/api/jobs/sync-reference/route.ts .env.example
git commit -m "feat: эндпоинт ночного синка справочников"
```

---

### Task 9: Дата и время в интерфейсе

**Files:**
- Modify: `lib/domain/dates.ts`
- Test: `lib/domain/dates.test.ts`

- [ ] **Step 1: Написать падающий тест**

Дописать в конец `lib/domain/dates.test.ts`:

```ts
import { formatDateTime } from "./dates"

describe("formatDateTime", () => {
  it("показывает дату и время в московской зоне", () => {
    // 2026-07-21T00:15:00Z = 03:15 по Москве
    const d = new Date("2026-07-21T00:15:00.000Z")
    expect(formatDateTime(d)).toBe("21.07.2026, 03:15")
  })
})
```

Если в файле ещё нет импорта `describe`/`it`/`expect` из `vitest` — он уже есть в существующих тестах этого файла, дублировать не нужно.

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run: `npx vitest run lib/domain/dates.test.ts`
Expected: FAIL — `formatDateTime is not exported`.

- [ ] **Step 3: Реализовать**

Дописать в `lib/domain/dates.ts`:

```ts
// Дата со временем — для отметки «обновлено …» в справочниках.
export function formatDateTime(date: Date): string {
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

Run: `npx vitest run lib/domain/dates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/dates.ts lib/domain/dates.test.ts
git commit -m "feat: формат даты со временем для отметки синхронизации"
```

---

### Task 10: Панель статуса и кнопка «Обновить из 1С»

**Files:**
- Create: `app/reference/actions.ts`
- Create: `components/reference/sync-status.tsx`

- [ ] **Step 1: Написать server action**

Создать `app/reference/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReferenceSync } from "@/lib/sync/run-reference-sync"

// Ручной запуск синка. Ошибки не бросаются: неудача записывается в журнал
// и показывается панелью статуса при следующем рендере.
export async function syncReferenceNow(): Promise<void> {
  await runReferenceSync(getOneCGateway(), "manual")
  revalidatePath("/reference/cashflow-items")
  revalidatePath("/reference/pnl-items")
  revalidatePath("/reference/bank-accounts")
}
```

- [ ] **Step 2: Написать панель статуса**

Создать `components/reference/sync-status.tsx`:

```tsx
// Панель над справочником: когда данные приезжали из 1С, кнопка ручного
// обновления и предупреждение, если последняя попытка не удалась.
import { RefreshCw, TriangleAlert } from "lucide-react"
import { prisma } from "@/lib/db"
import { formatDateTime } from "@/lib/domain/dates"
import { Button } from "@/components/ui/button"
import { syncReferenceNow } from "@/app/reference/actions"

export async function SyncStatus() {
  const [lastOk, lastRun] = await Promise.all([
    prisma.referenceSyncRun.findFirst({
      where: { status: "ok" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.referenceSyncRun.findFirst({
      where: { status: { in: ["ok", "error"] } },
      orderBy: { startedAt: "desc" },
    }),
  ])

  const failed = lastRun?.status === "error"

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {lastOk?.finishedAt
            ? `Данные из 1С, обновлено ${formatDateTime(lastOk.finishedAt)}`
            : "Данные из 1С ещё не загружались"}
        </p>
        <form action={syncReferenceNow}>
          <Button type="submit" variant="outline" size="sm">
            <RefreshCw />
            Обновить из 1С
          </Button>
        </form>
      </div>

      {failed && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Последнее обновление не удалось</p>
            <p className="text-muted-foreground">{lastRun.error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add app/reference/actions.ts components/reference/sync-status.tsx
git commit -m "feat: панель статуса синка и кнопка обновления справочников"
```

---

### Task 11: Перевод справочников в режим только чтения

**Files:**
- Modify: `components/reference/article-dictionary.tsx`
- Modify: `app/reference/cashflow-items/page.tsx`
- Modify: `app/reference/pnl-items/page.tsx`
- Modify: `app/reference/bank-accounts/page.tsx`
- Delete: `app/reference/article-actions.ts`, `app/reference/cashflow-items/actions.ts`, `app/reference/pnl-items/actions.ts`, `app/reference/bank-accounts/actions.ts`, `app/reference/bank-accounts/bank-account-form.tsx`, `components/reference/article-form.tsx`

- [ ] **Step 1: Убрать форму и колонку «Действия» из таблицы статей**

Полностью заменить содержимое `components/reference/article-dictionary.tsx`:

```tsx
import Link from "next/link"
import {
  buildArticleTree,
  flattenArticleTree,
  type ArticleNode,
} from "@/lib/domain/reference/articles"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { FLOW_LABELS } from "./article-labels"

type Kind = "CASHFLOW" | "PNL"
type Row = ArticleNode & { isActive: boolean }

// Классы отступа по глубине (статические — Tailwind их видит; без инлайн-стилей).
const PAD = ["pl-0", "pl-4", "pl-8", "pl-12", "pl-16", "pl-20"]

export function ArticleDictionary({
  kind,
  articles,
  basePath,
  showArchived,
}: {
  kind: Kind
  articles: Row[]
  basePath: string
  showArchived: boolean
}) {
  const nodes: ArticleNode[] = articles.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    flow: a.flow,
    isGroup: a.isGroup,
    parentId: a.parentId,
  }))
  const rows = flattenArticleTree(buildArticleTree(nodes))
  const activeById = new Map(articles.map((a) => [a.id, a.isActive]))
  const labels = FLOW_LABELS[kind]

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          href={basePath + (showArchived ? "" : "?archived=1")}
          className="text-sm text-primary underline underline-offset-4"
        >
          {showArchived ? "Скрыть архивные" : "Показать архивные"}
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Наименование</TableHead>
            <TableHead>Код</TableHead>
            <TableHead>Тип</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const active = activeById.get(r.id) ?? true
            return (
              <TableRow key={r.id} className={active ? "" : "opacity-50"}>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center",
                      PAD[Math.min(r.depth, PAD.length - 1)]
                    )}
                  >
                    {r.name}
                    {r.isGroup && (
                      <Badge variant="outline" className="ml-2">
                        группа
                      </Badge>
                    )}
                    {!active && (
                      <Badge variant="outline" className="ml-2">
                        архив
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{r.code}</TableCell>
                <TableCell>
                  {r.flow ? (
                    <Badge variant="secondary">{labels[r.flow]}</Badge>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Переписать страницу статей ДДС**

Полностью заменить содержимое `app/reference/cashflow-items/page.tsx`:

```tsx
import { prisma } from "@/lib/db"
import { ArticleDictionary } from "@/components/reference/article-dictionary"
import { SyncStatus } from "@/components/reference/sync-status"

export const dynamic = "force-dynamic"
const BASE = "/reference/cashflow-items"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const articles = await prisma.article.findMany({
    where: { kind: "CASHFLOW", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи ДДС</h1>
      <SyncStatus />
      <ArticleDictionary
        kind="CASHFLOW"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
      />
    </main>
  )
}
```

- [ ] **Step 3: Переписать страницу статей БДР**

Полностью заменить содержимое `app/reference/pnl-items/page.tsx`:

```tsx
import { prisma } from "@/lib/db"
import { ArticleDictionary } from "@/components/reference/article-dictionary"
import { SyncStatus } from "@/components/reference/sync-status"

export const dynamic = "force-dynamic"
const BASE = "/reference/pnl-items"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const articles = await prisma.article.findMany({
    where: { kind: "PNL", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи БДР</h1>
      <SyncStatus />
      <ArticleDictionary
        kind="PNL"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
      />
    </main>
  )
}
```

- [ ] **Step 4: Переписать страницу банковских счетов**

Полностью заменить содержимое `app/reference/bank-accounts/page.tsx`:

```tsx
import Link from "next/link"
import { prisma } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SyncStatus } from "@/components/reference/sync-status"

export const dynamic = "force-dynamic"
const BASE = "/reference/bank-accounts"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const accounts = await prisma.bankAccount.findMany({
    where: showArchived ? {} : { isActive: true },
    orderBy: { createdAt: "asc" },
  })

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Банковские счета</h1>
      <SyncStatus />

      <div className="flex justify-end">
        <Link
          href={BASE + (showArchived ? "" : "?archived=1")}
          className="text-sm text-primary underline underline-offset-4"
        >
          {showArchived ? "Скрыть архивные" : "Показать архивные"}
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Номер</TableHead>
            <TableHead>Банк</TableHead>
            <TableHead>БИК</TableHead>
            <TableHead>Валюта</TableHead>
            <TableHead>Организация</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id} className={a.isActive ? "" : "opacity-50"}>
              <TableCell>
                {a.name}
                {!a.isActive && (
                  <Badge variant="outline" className="ml-2">
                    архив
                  </Badge>
                )}
              </TableCell>
              <TableCell>{a.accountNumber}</TableCell>
              <TableCell>{a.bankName}</TableCell>
              <TableCell>{a.bankBic}</TableCell>
              <TableCell>{a.currency}</TableCell>
              <TableCell>{a.organization}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
```

- [ ] **Step 5: Удалить осиротевшие формы и server actions**

```bash
git rm app/reference/article-actions.ts \
       app/reference/cashflow-items/actions.ts \
       app/reference/pnl-items/actions.ts \
       app/reference/bank-accounts/actions.ts \
       app/reference/bank-accounts/bank-account-form.tsx \
       components/reference/article-form.tsx
```

- [ ] **Step 6: Проверить, что удалённое больше нигде не импортируется**

Run: `npm run typecheck && npm run lint`
Expected: без ошибок. Если что-то ссылается на удалённые файлы — ошибка укажет место.

- [ ] **Step 7: Commit**

```bash
git add -A app/reference components/reference
git commit -m "feat: справочники переведены в режим только чтения"
```

---

### Task 12: Seed со стабильными UID

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Заменить ручное создание справочников на прогон синка по фикстуре**

В `prisma/seed.ts` найти блок наполнения справочников (создание `article` и `bankAccount`, начинается с `prisma.article.deleteMany()`) и заменить его целиком на:

```ts
  // Справочники приходят из 1С. В seed материализуем их тем же конвейером,
  // что и в проде — прогоном синка по фикстуре: так у записей появляются
  // стабильные externalUid и реальный синк опознаёт их как те же самые.
  await prisma.article.deleteMany()
  await prisma.bankAccount.deleteMany()
  await prisma.referenceSyncRun.deleteMany()
  await runReferenceSync(fixtureOneCGateway, "manual")
```

Добавить импорты в начало файла:

```ts
import { fixtureOneCGateway } from "../lib/integrations/one-c-odata-fixture"
import { runReferenceSync } from "../lib/sync/run-reference-sync"
```

- [ ] **Step 2: Прогнать seed**

Run: `npx prisma db seed`
Expected: завершается без ошибок.

- [ ] **Step 3: Проверить, что у записей есть UID**

```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.article.findMany({select:{name:true,externalUid:true,parentId:true}}).then(r=>{console.log(r.length,'статей, без UID:',r.filter(x=>!x.externalUid).length);console.log('с родителем:',r.filter(x=>x.parentId).length)}).finally(()=>p.\$disconnect())"
```

Expected: статей больше нуля, `без UID: 0`, `с родителем:` больше нуля (дерево собралось).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed справочников через синк по фикстуре"
```

---

### Task 13: E2e-смоук

**Files:**
- Modify: `tests/e2e/reference.spec.ts`

- [ ] **Step 1: Переписать смоук под режим только чтения**

Полностью заменить содержимое `tests/e2e/reference.spec.ts`:

```ts
import { expect, test } from "@playwright/test"

// Данные готовит сам тест: кнопка «Обновить из 1С» прогоняет синк
// fixture-шлюза (ONEC_ODATA_MODE=fixture в .env), от seed тест не зависит.
test("ДДС: справочник наполняется из 1С и показывается деревом", async ({
  page,
}) => {
  await page.goto("/reference/cashflow-items")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()

  await expect(
    page.getByRole("cell", { name: "Операционная деятельность" })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "Поступления от покупателей" })
  ).toBeVisible()
  await expect(page.getByText(/Данные из 1С, обновлено/)).toBeVisible()
})

test("ДДС: редактирование недоступно — источник истины в 1С", async ({
  page,
}) => {
  await page.goto("/reference/cashflow-items")
  await expect(page.getByRole("button", { name: "Добавить" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Изменить" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "В архив" })).toHaveCount(0)
})

test("ДДС: помеченная удалённой в 1С не попадает в справочник", async ({
  page,
}) => {
  await page.goto("/reference/cashflow-items")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()
  await expect(
    page.getByRole("cell", { name: "Устаревшая статья" })
  ).toHaveCount(0)

  // И в архиве её тоже нет: запись с пометкой удаления не заводится вовсе,
  // архивируются только те, что успели приехать активными (см. sync-diff.test.ts).
  await page.getByRole("link", { name: "Показать архивные" }).click()
  await expect(
    page.getByRole("cell", { name: "Устаревшая статья" })
  ).toHaveCount(0)
})

test("банковские счета наполняются из 1С", async ({ page }) => {
  await page.goto("/reference/bank-accounts")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()
  await expect(
    page.getByRole("cell", { name: "Расчётный счёт Сбербанк" })
  ).toBeVisible()
  await expect(page.getByRole("cell", { name: "044525225" })).toBeVisible()
})

test("витрина справочников открывается", async ({ page }) => {
  await page.goto("/reference")
  await expect(page.getByRole("heading", { name: "Справочники" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Статьи ДДС" })).toBeVisible()
})
```

- [ ] **Step 2: Прогнать e2e**

Run: `npm run test:e2e -- reference`
Expected: все тесты PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/reference.spec.ts
git commit -m "test: e2e-смоук справочников в режиме только чтения"
```

---

### Task 14: Полная проверка и доставка в песочницу

**Files:** —

- [ ] **Step 1: Прогнать все проверки**

Run: `npm run format && npm run lint && npm run typecheck && npm run test`
Expected: все четыре команды завершаются без ошибок.

- [ ] **Step 2: Прогнать все e2e**

Run: `npm run test:e2e`
Expected: PASS. Особое внимание — `requests.spec.ts` и `transactions.spec.ts` не должны сломаться: синк заявок мы не трогали.

- [ ] **Step 3: Убедиться, что миграция применяется на чистой базе**

Run: `npx prisma migrate status`
Expected: `Database schema is up to date!`

- [ ] **Step 4: Доставить в песочницу**

Использовать команду `/ship`. Вручную не мержить и не пушить.

---

### Task 15: Проверка на реальной 1С (после выдачи прав)

**Блокировано:** пока администратор 1С не выдаст право «Использование стандартного интерфейса OData» и не включит справочники в состав интерфейса, эта задача не выполняется. Все предыдущие задачи от неё не зависят.

**Files:**
- Modify: `lib/integrations/one-c-odata-http.ts` (карта `NAMES`)
- Modify: `lib/integrations/one-c-odata-fixture.ts` (при расхождении структуры)

- [ ] **Step 1: Проверить, что доступ появился**

```bash
node -e "
const u=process.env.ONEC_ODATA_URL, a='Basic '+Buffer.from(process.env.ONEC_ODATA_USER+':'+process.env.ONEC_ODATA_PASSWORD,'utf8').toString('base64');
fetch(u+'/?\$format=json',{headers:{Authorization:a}}).then(async r=>{console.log('HTTP',r.status); if(r.ok){const j=await r.json(); console.log((j.value||[]).map(x=>x.name).filter(n=>n.startsWith('Catalog_')).join('\n'))}})
"
```

Expected: `HTTP 200` и список наборов `Catalog_*`. Если снова `401` — права не выданы, задача остаётся заблокированной.

- [ ] **Step 2: Найти три нужных справочника**

В выводе Step 1 найти наборы для статей ДДС, статей БДР и банковских счетов. Выписать точные имена.

- [ ] **Step 3: Посмотреть реквизиты каждого набора**

Для каждого найденного имени выполнить (подставив имя вместо `<SET>`):

```bash
node -e "
const u=process.env.ONEC_ODATA_URL, a='Basic '+Buffer.from(process.env.ONEC_ODATA_USER+':'+process.env.ONEC_ODATA_PASSWORD,'utf8').toString('base64');
fetch(u+'/<SET>?\$format=json&\$top=1',{headers:{Authorization:a}}).then(r=>r.json()).then(j=>console.log(Object.keys(j.value[0]||{}).join('\n')))
"
```

Expected: список реквизитов. Сопоставить с картой `NAMES` в `one-c-odata-http.ts`.

- [ ] **Step 4: Подставить реальные имена в карту `NAMES`**

Обновить `NAMES` в `lib/integrations/one-c-odata-http.ts` значениями из Step 2 и Step 3. Убрать комментарий «значения предварительные».

- [ ] **Step 5: Проверить разбор видов движения**

```bash
node -e "
const u=process.env.ONEC_ODATA_URL, a='Basic '+Buffer.from(process.env.ONEC_ODATA_USER+':'+process.env.ONEC_ODATA_PASSWORD,'utf8').toString('base64');
fetch(u+'/<SET_СТАТЬИ_ДДС>?\$format=json&\$top=200',{headers:{Authorization:a}}).then(r=>r.json()).then(j=>console.log([...new Set((j.value||[]).map(x=>x['<ПОЛЕ_ВИД_ДВИЖЕНИЯ>']))].join('\n')))
"
```

Expected: список различных значений вида движения. Каждое должно попадать в `INFLOW_WORDS` или `OUTFLOW_WORDS` в `lib/domain/reference/sync-diff.ts`. Недостающие слова добавить туда **вместе с тестом** в `sync-diff.test.ts`.

- [ ] **Step 6: Прогнать синк в реальном режиме на dev**

```bash
ONEC_ODATA_MODE=real npx tsx -e "import { runReferenceSync } from './lib/sync/run-reference-sync'; import { getOneCGateway } from './lib/integrations/one-c-odata'; runReferenceSync(getOneCGateway(), 'manual').then(r => { console.log(r); process.exit(0) })"
```

Expected: `status: 'ok'`, `warnings: 0`, `created` больше нуля.

- [ ] **Step 7: Сверить выборочно с 1С**

Открыть http://localhost:3000/reference/cashflow-items и сравнить 5–10 статей с тем, что видно в 1С через браузер: наименование, код, вид, вложенность.

- [ ] **Step 8: Прогнать синк повторно — идемпотентность**

Повторить команду Step 6.
Expected: `created: 0`, `updated: 0`, `archived: 0`.

- [ ] **Step 9: Проверки и коммит**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/one-c-odata-http.ts lib/domain/reference/sync-diff.ts lib/domain/reference/sync-diff.test.ts
git commit -m "feat: реальные имена объектов 1С в клиенте OData"
```

- [ ] **Step 10: Доставить через `/ship`**

---

## Что остаётся за рамками плана

- **Настройка ночного расписания на сервере** (cron, дёргающий `/api/jobs/sync-reference`) — операционный шаг разработчика, не изменение кода.
- **Выдача прав на OData** — администратор 1С, Task 15 до этого заблокирована.
- Синхронизация контрагентов, организаций, валют, договоров.
- Привязка статей и счетов к транзакциям и заявкам.
