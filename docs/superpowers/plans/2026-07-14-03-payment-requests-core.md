# План 3: Ядро модуля «Заявки на оплату» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реестр и карточка заявок на расход ДС со статусами исполнения (зелёная/красная), комментариями бухгалтера, согласованием через REST API 1С и синком данных через подменяемый DWH-шлюз (в этом плане — fixture-режим с демо-данными).

**Architecture:** Чтение — только из своей PostgreSQL; данные приносит фоновый синк (`lib/sync/`) через интерфейс `DwhGateway` (реальный mssql-адаптер — план 04, здесь fixture-реализация). Запись в 1С (согласовать/отклонить) — через `lib/integrations/one-c.ts` (Bearer, режим mock для dev/e2e). Статусы исполнения — чистые функции в `lib/domain/` с unit-тестами. UI — по образцу `app/transactions/`: server components + server actions + `useActionState`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma + PostgreSQL, Tailwind + shadcn/ui, Vitest, Playwright.

**Спека:** `docs/superpowers/specs/2026-07-14-payment-requests-design.md`.

**Сознательно вне этого плана** (следующие планы, по мере закрытия предпосылок §11 спеки):
- План 04 — mssql-адаптер DWH (нужен контракт вьюх DEEONE) + cron на сервере.
- План 05 — отправка платёжек (таблицы `PaymentOrderDispatch`, `CashFlowItemSetting`, экран `app/dispatch/`, настройки статей ДДС, бот Яндекс Мессенджера).

**Правила репозитория, которые действуют в каждой задаче** (из `CLAUDE.md`):
- Перед каждым коммитом: `npm run format && npm run lint && npm run typecheck && npm run test`.
- Мутации — только server actions `(prevState: FormState, formData: FormData) => Promise<FormState>`; ожидаемые ошибки возвращаются как `{ error }`, не бросаются; после успеха `revalidatePath`.
- `lib/domain/` — без React/Prisma/I/O, тесты рядом. Unit-тесты компонентов запрещены — сценарии покрывает e2e.
- Деньги — целые копейки; в этом модуле `BigInt` (суммы заявок бывают > 21,4 млн ₽).
- Интерфейс на русском, код на английском, коммиты conventional (описание на русском).

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma` (modify) | Модели `PaymentRequest`, `Debit`, `ExecutionComment`, `SyncRun` + enum'ы |
| `lib/domain/money.ts` (modify) | + `formatMoneyBig` — форматирование BigInt-копеек |
| `lib/domain/execution-status.ts` (create) | `executionDeadline`, `computeExecutionStatus` — чистая логика статусов |
| `lib/integrations/dwh.ts` (create) | Типы строк DWH, интерфейс `DwhGateway`, фабрика `getDwhGateway()` |
| `lib/integrations/dwh-fixture.ts` (create) | Fixture-шлюз с демо-данными (dev, e2e, seed) |
| `lib/integrations/one-c.ts` (create) | Клиент REST API 1С: `approveBids`, `declineBid` (mock/real) |
| `lib/sync/run-sync.ts` (create) | Оркестрация синка: журнал `SyncRun`, upsert, пометка удалённых, пересчёт статусов |
| `app/api/jobs/sync/route.ts` (create) | `POST /api/jobs/sync` — запуск синка по cron-секрету |
| `app/requests/status.ts` (create) | Ярлыки и Tailwind-классы статусов исполнения |
| `app/requests/page.tsx` (create) | Реестр: фильтры, свежесть данных, таблица |
| `app/requests/actions.ts` (create) | `refreshData`, `bulkApproveRequests` |
| `app/requests/requests-table.tsx` (create) | Клиентская таблица с мультивыбором и массовым согласованием |
| `app/requests/[uid]/page.tsx` (create) | Карточка: реквизиты, блок исполнения, комментарии, согласование |
| `app/requests/[uid]/actions.ts` (create) | `addExecutionComment`, `approveRequest`, `declineRequest` |
| `app/requests/[uid]/comment-form.tsx` (create) | Форма комментария бухгалтера |
| `app/requests/[uid]/approval-controls.tsx` (create) | Кнопки «Согласовать» / «Отклонить с причиной» |
| `prisma/seed.ts` (modify) | + запуск синка на fixture-шлюзе |
| `.env.example` (modify) | Переменные DWH/синка/1С |
| `app/page.tsx` (modify) | Ссылка «Заявки на оплату» |
| `tests/e2e/helpers.ts` (create) | `syncFixtureData` — материализация fixture-данных через UI |
| `tests/e2e/requests.spec.ts` (create) | E2e-смоук модуля |

---

### Task 1: Prisma-схема и миграция

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_payment_requests_core/migration.sql` (генерирует Prisma)

- [ ] **Step 1: Добавить модели в конец `prisma/schema.prisma`**

```prisma
// --- Модуль «Заявки на оплату» (спека 2026-07-14-payment-requests-design) ---

enum ApprovalStatus {
  on_approval
  approved
  declined
}

enum ExecutionStatus {
  on_approval
  declined
  awaiting
  executed
  overdue
}

enum SyncRunStatus {
  running
  ok
  error
}

enum SyncTrigger {
  cron
  manual
  seed
}

// Снапшот заявки на расход ДС из DWH. Суммы — BigInt-копейки:
// Int ограничен ±21,4 млн ₽, заявки за товар бывают больше.
model PaymentRequest {
  id              String          @id @default(cuid())
  uid             String          @unique // UID документа 1С
  number          String
  date            DateTime        @db.Timestamptz(3)
  orgName         String
  orgInn          String?
  orgUid          String?
  initiator       String?
  department      String?
  amountMinor     BigInt
  currency        String          @default("RUB")
  cashFlowItem    String? // статья ДДС
  fund            String?
  partnerName     String?
  partnerInn      String?
  partnerUid      String?
  payDate         DateTime        @db.Timestamptz(3) // плановая дата оплаты
  approvalStatus  ApprovalStatus
  importance      Int             @default(0) // 1 = срочная
  comment         String?
  executionStatus ExecutionStatus
  executedAt      DateTime?       @db.Timestamptz(3)
  isDeletedIn1c   Boolean         @default(false)
  syncedAt        DateTime        @db.Timestamptz(3)

  debits            Debit[]
  executionComments ExecutionComment[]

  @@index([executionStatus])
  @@index([payDate])
  @@map("payment_requests")
}

// Списание из выписки банка (документ «Расход ДС» 1С), привязан к заявке.
model Debit {
  id          String   @id @default(cuid())
  docUid      String   @unique // UID документа «Расход ДС»
  date        DateTime @db.Timestamptz(3)
  amountMinor BigInt
  bankAccount String?
  bankName    String?
  requestUid  String
  syncedAt    DateTime @db.Timestamptz(3)

  request PaymentRequest @relation(fields: [requestUid], references: [uid])

  @@index([requestUid])
  @@map("debits")
}

// Объяснение бухгалтера к красной заявке. Живёт только в приложении.
model ExecutionComment {
  id        String   @id @default(cuid())
  requestId String
  text      String
  author    String // строка до появления авторизации
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  request PaymentRequest @relation(fields: [requestId], references: [id])

  @@index([requestId])
  @@map("execution_comments")
}

// Журнал запусков синка — питает индикатор свежести данных и диагностику.
model SyncRun {
  id                    String        @id @default(cuid())
  startedAt             DateTime      @default(now()) @db.Timestamptz(3)
  finishedAt            DateTime?     @db.Timestamptz(3)
  status                SyncRunStatus
  trigger               SyncTrigger
  requestsUpserted      Int           @default(0)
  debitsUpserted        Int           @default(0)
  debitsSkipped         Int           @default(0)
  requestsMarkedDeleted Int           @default(0)
  error                 String?

  @@index([status, startedAt])
  @@map("sync_runs")
}
```

- [ ] **Step 2: Создать миграцию**

Run: `npx prisma migrate dev --name payment_requests_core`
Expected: `Your database is now in sync with your schema.` + сгенерирован клиент.

- [ ] **Step 3: Проверки**

Run: `npm run format && npm run lint && npm run typecheck && npm run test`
Expected: всё зелёное (существующие тесты не задеты).

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: схема заявок на оплату — PaymentRequest, Debit, ExecutionComment, SyncRun"
```

---

### Task 2: Домен — деньги BigInt

**Files:**
- Modify: `lib/domain/money.ts`
- Test: `lib/domain/money.test.ts`

- [ ] **Step 1: Написать падающие тесты (добавить в конец `lib/domain/money.test.ts`)**

```typescript
import { formatMoneyBig } from "./money"

describe("formatMoneyBig", () => {
  it("форматирует BigInt-копейки в рубли по ru-RU", () => {
    expect(norm(formatMoneyBig(123456n))).toBe("1 234,56 ₽")
  })

  it("форматирует суммы больше Int-лимита (25 млн ₽)", () => {
    expect(norm(formatMoneyBig(2_500_000_000n))).toBe("25 000 000,00 ₽")
  })

  it("форматирует другие валюты по коду ISO", () => {
    expect(norm(formatMoneyBig(500000n, "CNY"))).toBe("5 000,00 CN¥")
  })
})
```

Импорт `formatMoneyBig` добавить к существующему импорту из `./money`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/money.test.ts`
Expected: FAIL — `formatMoneyBig` не экспортируется.

- [ ] **Step 3: Реализация (добавить в конец `lib/domain/money.ts`)**

```typescript
// Форматирование BigInt-копеек (суммы заявок бывают > Int-лимита).
// Точность Number достаточна до ~90 трлн ₽.
export function formatMoneyBig(amountMinor: bigint, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
    Number(amountMinor) / 100
  )
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/money.test.ts`
Expected: PASS (все, включая старые).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/money.ts lib/domain/money.test.ts
git commit -m "feat: formatMoneyBig — форматирование BigInt-копеек"
```

---

### Task 3: Домен — дедлайн выписки

Дедлайн исполнения = следующий рабочий день после даты оплаты, 11:00 МСК
(к этому времени выписка загружена в 1С). Москва — фиксированно UTC+3.

**Files:**
- Create: `lib/domain/execution-status.ts`
- Test: `lib/domain/execution-status.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```typescript
// lib/domain/execution-status.test.ts
import { describe, expect, it } from "vitest"
import { executionDeadline } from "./execution-status"

// 11:00 МСК = 08:00 UTC (Москва — фиксированно UTC+3, без переходов).
describe("executionDeadline", () => {
  it("будний день: следующий день, 11:00 МСК", () => {
    // вторник 2026-07-14 → среда 2026-07-15 11:00 МСК
    const payDate = new Date("2026-07-14T10:00:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-15T08:00:00.000Z"
    )
  })

  it("пятница: дедлайн в понедельник", () => {
    // пятница 2026-07-17 → понедельник 2026-07-20 11:00 МСК
    const payDate = new Date("2026-07-17T10:00:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-20T08:00:00.000Z"
    )
  })

  it("суббота: дедлайн в понедельник", () => {
    const payDate = new Date("2026-07-18T10:00:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-20T08:00:00.000Z"
    )
  })

  it("календарный день берётся по МСК, а не по UTC", () => {
    // 23:30 МСК вторника = 20:30 UTC — это ещё вторник по Москве,
    // дедлайн — среда 11:00 МСК
    const payDate = new Date("2026-07-14T23:30:00+03:00")
    expect(executionDeadline(payDate).toISOString()).toBe(
      "2026-07-15T08:00:00.000Z"
    )
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/execution-status.test.ts`
Expected: FAIL — файл `./execution-status` не существует.

- [ ] **Step 3: Реализация**

```typescript
// lib/domain/execution-status.ts
// Статусы исполнения заявки на расход ДС. Чистая логика, без I/O.
// Москва — фиксированно UTC+3 (переходов на летнее время нет с 2014 года).

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
const DEADLINE_HOUR_UTC = 8 // 11:00 МСК

// Следующий рабочий день (пока пропускаем только сб/вс, производственный
// календарь — открытый вопрос §11 спеки) после даты оплаты, 11:00 МСК.
export function executionDeadline(payDate: Date): Date {
  // Календарная дата payDate по Москве: сдвигаем на +3ч и читаем UTC-компоненты.
  const msk = new Date(payDate.getTime() + MSK_OFFSET_MS)
  const next = new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + 1)
  )
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
    next.setUTCDate(next.getUTCDate() + 1)
  }
  return new Date(
    Date.UTC(
      next.getUTCFullYear(),
      next.getUTCMonth(),
      next.getUTCDate(),
      DEADLINE_HOUR_UTC
    )
  )
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/execution-status.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/execution-status.ts lib/domain/execution-status.test.ts
git commit -m "feat: executionDeadline — дедлайн выписки (след. рабочий день, 11:00 МСК)"
```

---

### Task 4: Домен — статус исполнения

**Files:**
- Modify: `lib/domain/execution-status.ts`
- Test: `lib/domain/execution-status.test.ts`

- [ ] **Step 1: Написать падающие тесты (добавить в конец файла тестов)**

```typescript
import { computeExecutionStatus } from "./execution-status"

describe("computeExecutionStatus", () => {
  const base = {
    approvalStatus: "approved" as const,
    payDate: new Date("2026-07-14T10:00:00+03:00"), // вторник; дедлайн ср 11:00 МСК
    hasDebits: false,
  }

  it("есть списание → executed (даже после дедлайна)", () => {
    const now = new Date("2026-07-20T12:00:00+03:00")
    expect(computeExecutionStatus({ ...base, hasDebits: true }, now)).toBe(
      "executed"
    )
  })

  it("отклонена → declined", () => {
    const now = new Date("2026-07-20T12:00:00+03:00")
    expect(
      computeExecutionStatus({ ...base, approvalStatus: "declined" }, now)
    ).toBe("declined")
  })

  it("не согласована → on_approval", () => {
    const now = new Date("2026-07-20T12:00:00+03:00")
    expect(
      computeExecutionStatus({ ...base, approvalStatus: "on_approval" }, now)
    ).toBe("on_approval")
  })

  it("согласована, до дедлайна (10:59 МСК среды) → awaiting", () => {
    const now = new Date("2026-07-15T10:59:00+03:00")
    expect(computeExecutionStatus(base, now)).toBe("awaiting")
  })

  it("согласована, дедлайн наступил (11:00 МСК среды) → overdue", () => {
    const now = new Date("2026-07-15T11:00:00+03:00")
    expect(computeExecutionStatus(base, now)).toBe("overdue")
  })

  it("перенос даты оплаты вперёд возвращает красную в awaiting", () => {
    const now = new Date("2026-07-15T12:00:00+03:00")
    const moved = { ...base, payDate: new Date("2026-07-16T10:00:00+03:00") }
    expect(computeExecutionStatus(moved, now)).toBe("awaiting")
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/execution-status.test.ts`
Expected: FAIL — `computeExecutionStatus` не экспортируется.

- [ ] **Step 3: Реализация (добавить в конец `lib/domain/execution-status.ts`)**

```typescript
export type ApprovalStatus = "on_approval" | "approved" | "declined"

export type ExecutionStatus =
  | "on_approval"
  | "declined"
  | "awaiting"
  | "executed"
  | "overdue"

export type ExecutionStatusInput = {
  approvalStatus: ApprovalStatus
  payDate: Date
  hasDebits: boolean
}

// Исполнена = есть хотя бы одно привязанное списание (частичные оплаты
// v1 не интерпретирует — открытый вопрос §11 спеки).
export function computeExecutionStatus(
  input: ExecutionStatusInput,
  now: Date
): ExecutionStatus {
  if (input.hasDebits) return "executed"
  if (input.approvalStatus === "declined") return "declined"
  if (input.approvalStatus === "on_approval") return "on_approval"
  return now.getTime() >= executionDeadline(input.payDate).getTime()
    ? "overdue"
    : "awaiting"
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/execution-status.test.ts`
Expected: PASS (10 тестов).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/execution-status.ts lib/domain/execution-status.test.ts
git commit -m "feat: computeExecutionStatus — статусная модель исполнения заявки"
```

---

### Task 5: shadcn-компоненты badge и textarea

**Files:**
- Create: `components/ui/badge.tsx`, `components/ui/textarea.tsx` (генерирует CLI)

- [ ] **Step 1: Установить компоненты**

Run: `npx shadcn@latest add badge textarea`
Expected: созданы `components/ui/badge.tsx` и `components/ui/textarea.tsx`.

- [ ] **Step 2: Проверить, что новых npm-зависимостей не появилось**

Run: `git diff package.json`
Expected: пусто (компоненты используют уже установленный `@base-ui/react`).
Если diff не пуст — остановиться и показать разработчику (правило CLAUDE.md о новых зависимостях).

- [ ] **Step 3: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add components/ui/ package.json package-lock.json
git commit -m "chore: shadcn badge и textarea для модуля заявок"
```

---

### Task 6: DWH-шлюз — типы, интерфейс, fixture

`DwhGateway` — единственная точка, через которую синк видит DWH. В этом плане
есть только fixture-реализация; mssql-адаптер добавит план 04, не меняя синк.

**Files:**
- Create: `lib/integrations/dwh.ts`
- Create: `lib/integrations/dwh-fixture.ts`

- [ ] **Step 1: Написать интерфейс и фабрику**

```typescript
// lib/integrations/dwh.ts
// Контракт чтения из DWH (DEEONE). Синк работает только через DwhGateway —
// реализацию выбирает фабрика по env DWH_MODE.
import { fixtureDwhGateway } from "./dwh-fixture"

export type DwhApprovalStatus = "on_approval" | "approved" | "declined"

export type DwhRequestRow = {
  uid: string
  number: string
  date: Date
  orgName: string
  orgInn: string | null
  orgUid: string | null
  initiator: string | null
  department: string | null
  amountMinor: bigint
  currency: string
  cashFlowItem: string | null
  fund: string | null
  partnerName: string | null
  partnerInn: string | null
  partnerUid: string | null
  payDate: Date
  approvalStatus: DwhApprovalStatus
  importance: number
  comment: string | null
}

export type DwhDebitRow = {
  docUid: string
  date: Date
  amountMinor: bigint
  bankAccount: string | null
  bankName: string | null
  requestUid: string
}

export interface DwhGateway {
  fetchRequests(since: Date): Promise<DwhRequestRow[]>
  fetchDebits(since: Date): Promise<DwhDebitRow[]>
}

// DWH_MODE: "fixture" (по умолчанию — демо-данные) | "mssql" (план 04).
export function getDwhGateway(): DwhGateway {
  const mode = process.env.DWH_MODE ?? "fixture"
  if (mode === "fixture") return fixtureDwhGateway
  throw new Error(
    `DWH_MODE="${mode}" не поддерживается: mssql-адаптер появится в плане 04`
  )
}
```

- [ ] **Step 2: Написать fixture-шлюз**

Даты — относительные от текущего момента, чтобы демо-статусы были стабильны
в любой день запуска.

```typescript
// lib/integrations/dwh-fixture.ts
// Демо-данные в формате DWH: покрывают все статусы исполнения.
// Используются в dev (DWH_MODE=fixture), seed и e2e.
import type { DwhDebitRow, DwhGateway, DwhRequestRow } from "./dwh"

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function buildRequests(): DwhRequestRow[] {
  const common = {
    orgInn: null,
    orgUid: null,
    department: null,
    partnerInn: null,
    partnerUid: null,
    comment: null,
    importance: 0,
  }
  return [
    {
      ...common,
      uid: "fx-req-1",
      number: "REQ-0001",
      date: daysFromNow(-7),
      orgName: "ТОРИ БРЭНДС ООО",
      initiator: "Иванова А.",
      amountMinor: 1_250_000_00n,
      currency: "RUB",
      cashFlowItem: "Оплата поставщикам за товар",
      fund: "Закупки товара",
      partnerName: "ООО «Ткани Востока»",
      payDate: daysFromNow(-5),
      approvalStatus: "approved", // + списание ниже → executed (зелёная)
    },
    {
      ...common,
      uid: "fx-req-2",
      number: "REQ-0002",
      date: daysFromNow(-6),
      orgName: "ИП Бобровская",
      initiator: "Петров С.",
      amountMinor: 340_500_00n,
      currency: "RUB",
      cashFlowItem: "Реклама и продвижение",
      fund: "Маркетинг",
      partnerName: "ООО «Диджитал Плюс»",
      payDate: daysFromNow(-5),
      approvalStatus: "approved", // списания нет, дедлайн прошёл → overdue (красная)
    },
    {
      ...common,
      uid: "fx-req-3",
      number: "REQ-0003",
      date: daysFromNow(-2),
      orgName: "РУСБУБОН",
      initiator: "Иванова А.",
      amountMinor: 98_000_00n,
      currency: "RUB",
      cashFlowItem: "Аренда",
      fund: "Операционные расходы",
      partnerName: "ООО «БЦ Меркурий»",
      payDate: daysFromNow(3),
      approvalStatus: "approved", // дата оплаты впереди → awaiting
    },
    {
      ...common,
      uid: "fx-req-4",
      number: "REQ-0004",
      date: daysFromNow(-1),
      orgName: "ТОРИ БРЭНДС ООО",
      initiator: "Сидорова Е.",
      amountMinor: 25_700_000_00n, // 25,7 млн ₽ — больше Int-лимита
      currency: "RUB",
      cashFlowItem: "Оплата поставщикам за товар",
      fund: "Закупки товара",
      partnerName: "Guangzhou Textile Co.",
      payDate: daysFromNow(5),
      approvalStatus: "on_approval",
    },
    {
      ...common,
      uid: "fx-req-5",
      number: "REQ-0005",
      date: daysFromNow(-4),
      orgName: "ИП Бобровская",
      initiator: "Петров С.",
      amountMinor: 56_000_00n,
      currency: "RUB",
      cashFlowItem: "Хозяйственные расходы",
      fund: "Операционные расходы",
      partnerName: "ООО «Канцторг»",
      payDate: daysFromNow(-3),
      approvalStatus: "declined",
    },
    {
      ...common,
      uid: "fx-req-6",
      number: "REQ-0006",
      date: daysFromNow(0),
      orgName: "ТОРИ БРЭНДС ООО",
      initiator: "Сидорова Е.",
      amountMinor: 780_000_00n,
      currency: "CNY",
      cashFlowItem: "Оплата поставщикам за товар",
      fund: "Закупки товара",
      partnerName: "Shenzhen Buttons Ltd.",
      payDate: daysFromNow(2),
      approvalStatus: "on_approval",
      importance: 1, // срочная
    },
  ]
}

function buildDebits(): DwhDebitRow[] {
  return [
    {
      docUid: "fx-deb-1",
      date: daysFromNow(-4),
      amountMinor: 1_250_000_00n,
      bankAccount: "40702810900000012345",
      bankName: "Сбербанк",
      requestUid: "fx-req-1",
    },
    {
      // Списание по заявке вне окна синка — проверяет пропуск сирот.
      docUid: "fx-deb-orphan",
      date: daysFromNow(-4),
      amountMinor: 10_000_00n,
      bankAccount: "40702810900000012345",
      bankName: "Сбербанк",
      requestUid: "fx-req-missing",
    },
  ]
}

export const fixtureDwhGateway: DwhGateway = {
  async fetchRequests(since: Date): Promise<DwhRequestRow[]> {
    return buildRequests().filter((r) => r.date >= since)
  },
  async fetchDebits(since: Date): Promise<DwhDebitRow[]> {
    return buildDebits().filter((d) => d.date >= since)
  },
}
```

- [ ] **Step 3: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/dwh.ts lib/integrations/dwh-fixture.ts
git commit -m "feat: интерфейс DwhGateway и fixture-шлюз с демо-данными"
```

---

### Task 7: Синк — runSync

Оркестрация I/O без собственной бизнес-логики (она в `lib/domain/`), поэтому
без unit-тестов (политика тестов CLAUDE.md); сценарий покроет e2e в Task 10.

**Files:**
- Create: `lib/sync/run-sync.ts`

- [ ] **Step 1: Реализация**

```typescript
// lib/sync/run-sync.ts
// Синк из DWH: upsert заявок и списаний, пометка удалённых, пересчёт
// статусов исполнения. Каждый запуск журналируется в SyncRun.
import { prisma } from "@/lib/db"
import { computeExecutionStatus } from "@/lib/domain/execution-status"
import type { DwhGateway } from "@/lib/integrations/dwh"
import type { SyncTrigger } from "@prisma/client"

const DEFAULT_WINDOW_DAYS = 90
const RUNNING_STALE_MS = 10 * 60 * 1000

export type SyncResult =
  | { skipped: true }
  | { skipped: false; runId: string; status: "ok" | "error"; error?: string }

export async function runSync(
  gateway: DwhGateway,
  trigger: SyncTrigger
): Promise<SyncResult> {
  // Не более одного синка одновременно; зависший running старше 10 минут
  // не блокирует новый запуск.
  const running = await prisma.syncRun.findFirst({
    where: {
      status: "running",
      startedAt: { gt: new Date(Date.now() - RUNNING_STALE_MS) },
    },
  })
  if (running) return { skipped: true }

  const run = await prisma.syncRun.create({
    data: { status: "running", trigger },
  })

  try {
    const windowDays = Number(
      process.env.DWH_SYNC_WINDOW_DAYS ?? DEFAULT_WINDOW_DAYS
    )
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    const [requests, debits] = await Promise.all([
      gateway.fetchRequests(since),
      gateway.fetchDebits(since),
    ])
    const syncedAt = new Date()

    for (const r of requests) {
      const data = {
        number: r.number,
        date: r.date,
        orgName: r.orgName,
        orgInn: r.orgInn,
        orgUid: r.orgUid,
        initiator: r.initiator,
        department: r.department,
        amountMinor: r.amountMinor,
        currency: r.currency,
        cashFlowItem: r.cashFlowItem,
        fund: r.fund,
        partnerName: r.partnerName,
        partnerInn: r.partnerInn,
        partnerUid: r.partnerUid,
        payDate: r.payDate,
        approvalStatus: r.approvalStatus,
        importance: r.importance,
        comment: r.comment,
        isDeletedIn1c: false,
        syncedAt,
      }
      await prisma.paymentRequest.upsert({
        where: { uid: r.uid },
        update: data,
        create: {
          ...data,
          uid: r.uid,
          // Плейсхолдер: точный статус ставит пересчёт ниже (нужны списания).
          executionStatus: "on_approval",
        },
      })
    }

    // Заявки из окна, пропавшие из выгрузки, помечаем удалёнными в 1С.
    const fetchedUids = requests.map((r) => r.uid)
    const marked = await prisma.paymentRequest.updateMany({
      where: {
        date: { gte: since },
        uid: { notIn: fetchedUids },
        isDeletedIn1c: false,
      },
      data: { isDeletedIn1c: true, syncedAt },
    })

    // Списания: пропускаем сироты (заявка вне окна или ещё не приехала).
    const knownUids = new Set(
      (
        await prisma.paymentRequest.findMany({ select: { uid: true } })
      ).map((r) => r.uid)
    )
    let debitsUpserted = 0
    let debitsSkipped = 0
    for (const d of debits) {
      if (!knownUids.has(d.requestUid)) {
        debitsSkipped++
        continue
      }
      const data = {
        date: d.date,
        amountMinor: d.amountMinor,
        bankAccount: d.bankAccount,
        bankName: d.bankName,
        requestUid: d.requestUid,
        syncedAt,
      }
      await prisma.debit.upsert({
        where: { docUid: d.docUid },
        update: data,
        create: { ...data, docUid: d.docUid },
      })
      debitsUpserted++
    }

    // Пересчёт статусов: авторитетный статус — хранимый, единая точка истины.
    const all = await prisma.paymentRequest.findMany({
      where: { isDeletedIn1c: false },
      select: {
        id: true,
        payDate: true,
        approvalStatus: true,
        executionStatus: true,
        executedAt: true,
        debits: { orderBy: { date: "asc" }, take: 1, select: { date: true } },
      },
    })
    const now = new Date()
    for (const r of all) {
      const hasDebits = r.debits.length > 0
      const status = computeExecutionStatus(
        { approvalStatus: r.approvalStatus, payDate: r.payDate, hasDebits },
        now
      )
      const executedAt = hasDebits ? r.debits[0].date : null
      if (
        status !== r.executionStatus ||
        (executedAt?.getTime() ?? null) !== (r.executedAt?.getTime() ?? null)
      ) {
        await prisma.paymentRequest.update({
          where: { id: r.id },
          data: { executionStatus: status, executedAt },
        })
      }
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "ok",
        finishedAt: new Date(),
        requestsUpserted: requests.length,
        debitsUpserted,
        debitsSkipped,
        requestsMarkedDeleted: marked.count,
      },
    })
    return { skipped: false, runId: run.id, status: "ok" }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error: message },
    })
    return { skipped: false, runId: run.id, status: "error", error: message }
  }
}
```

- [ ] **Step 2: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/sync/run-sync.ts
git commit -m "feat: runSync — оркестрация синка DWH с журналом SyncRun"
```

---

### Task 8: Точки запуска синка — route handler, env, seed

**Files:**
- Create: `app/api/jobs/sync/route.ts`
- Modify: `.env.example`, локальный `.env`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Route handler для cron**

```typescript
// app/api/jobs/sync/route.ts
// Запуск синка планировщиком (cron на сервере, план 04):
//   curl -X POST -H "x-sync-secret: $SYNC_CRON_SECRET" <host>/api/jobs/sync
import { NextRequest, NextResponse } from "next/server"
import { getDwhGateway } from "@/lib/integrations/dwh"
import { runSync } from "@/lib/sync/run-sync"

export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_CRON_SECRET
  if (!secret || req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runSync(getDwhGateway(), "cron")
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Дополнить `.env.example` (в конец файла) и локальный `.env` теми же значениями**

```bash
# --- Модуль «Заявки на оплату» ---
# Источник DWH: fixture (демо-данные) | mssql (появится в плане 04)
DWH_MODE="fixture"
# Глубина выборки синка, дней
DWH_SYNC_WINDOW_DAYS="90"
# Секрет запуска синка кроном: POST /api/jobs/sync, заголовок x-sync-secret
SYNC_CRON_SECRET="<случайная-строка>"
# Согласование в 1С: mock (без сети, всегда успех — dev/e2e) | real
ONEC_API_MODE="mock"
# Для ONEC_API_MODE=real:
# ONEC_API_BASE_URL="http://192.168.79.250:4480"
# ONEC_API_TOKEN="<bearer-токен>"
```

- [ ] **Step 3: Seed запускает синк на fixture-шлюзе**

В `prisma/seed.ts` добавить импорты и вызов в конец `main()`:

```typescript
import { fixtureDwhGateway } from "../lib/integrations/dwh-fixture"
import { runSync } from "../lib/sync/run-sync"
```

```typescript
  // Демо-заявки — через реальный конвейер синка (fixture-шлюз).
  const sync = await runSync(fixtureDwhGateway, "seed")
  console.log(`Seed: синк заявок — ${JSON.stringify(sync)}`)
```

- [ ] **Step 4: Проверить сид и endpoint вручную**

Run: `npx prisma db seed`
Expected: `Seed: синк заявок — {"skipped":false,...,"status":"ok"}`.

Run (dev-сервер должен быть запущен: `npm run dev`):
`curl -s -X POST http://localhost:3000/api/jobs/sync` → `{"error":"unauthorized"}`;
`curl -s -X POST -H "x-sync-secret: <значение из .env>" http://localhost:3000/api/jobs/sync` → `{"skipped":false,...,"status":"ok"}`.

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/api/jobs/sync/route.ts .env.example prisma/seed.ts
git commit -m "feat: запуск синка — POST /api/jobs/sync (cron-секрет), env, seed"
```

---

### Task 9: Клиент REST API 1С

**Files:**
- Create: `lib/integrations/one-c.ts`

- [ ] **Step 1: Реализация**

```typescript
// lib/integrations/one-c.ts
// Запись в 1С: согласование/отклонение заявок (REST API, Bearer).
// ONEC_API_MODE: "real" — HTTP-вызовы; "mock" — успех без сети (dev/e2e);
// не задан/другое — явная ошибка (молчаливый mock в prod недопустим).
export type OneCResult = { ok: true } | { ok: false; error: string }

const TIMEOUT_MS = 10_000

async function post(path: string, body: unknown): Promise<OneCResult> {
  const mode = process.env.ONEC_API_MODE
  if (mode === "mock") return { ok: true }
  if (mode !== "real") {
    return { ok: false, error: "Интеграция с 1С не настроена (ONEC_API_MODE)" }
  }
  const base = process.env.ONEC_API_BASE_URL
  const token = process.env.ONEC_API_TOKEN
  if (!base || !token) {
    return {
      ok: false,
      error: "Не заданы ONEC_API_BASE_URL / ONEC_API_TOKEN",
    }
  }
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      return { ok: false, error: `1С ответила ошибкой: HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `1С недоступна: ${message}` }
  }
}

export async function approveBids(uids: string[]): Promise<OneCResult> {
  return post("/api/1crm/post/approveBid", { bids: uids })
}

export async function declineBid(
  uid: string,
  comment: string
): Promise<OneCResult> {
  return post("/api/1crm/post/declineBid", {
    bids: [{ UID: uid, comment }],
  })
}
```

- [ ] **Step 2: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/one-c.ts
git commit -m "feat: клиент REST API 1С — approveBids/declineBid (mock/real)"
```

---

### Task 10: Реестр заявок `/requests`

**Files:**
- Create: `app/requests/status.ts`
- Create: `app/requests/actions.ts` (пока только `refreshData`)
- Create: `app/requests/page.tsx`
- Test: `tests/e2e/helpers.ts`, `tests/e2e/requests.spec.ts`

- [ ] **Step 1: Метаданные статусов**

```typescript
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
```

- [ ] **Step 2: Server action «Обновить»**

```typescript
// app/requests/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { getDwhGateway } from "@/lib/integrations/dwh"
import { runSync } from "@/lib/sync/run-sync"

// Ручной запуск синка кнопкой «Обновить». Ошибки синка не бросаются —
// они журналируются в SyncRun и видны в строке свежести данных.
export async function refreshData(): Promise<void> {
  await runSync(getDwhGateway(), "manual")
  revalidatePath("/requests")
}
```

- [ ] **Step 3: Страница реестра**

```tsx
// app/requests/page.tsx
import Link from "next/link"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ExecutionStatus, Prisma } from "@prisma/client"
import { STATUS_CLASSES, STATUS_LABELS } from "./status"
import { refreshData } from "./actions"

export const dynamic = "force-dynamic"

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Все" },
  { value: "overdue", label: "Красные" },
  { value: "executed", label: "Исполненные" },
  { value: "awaiting", label: "Ждут оплаты" },
  { value: "on_approval", label: "На согласовании" },
  { value: "declined", label: "Отклонённые" },
]

type Search = Record<string, string | string[] | undefined>

function param(sp: Search, key: string): string {
  const v = sp[key]
  return typeof v === "string" ? v : ""
}

function buildQuery(sp: Search, overrides: Record<string, string>): string {
  const q = new URLSearchParams()
  for (const key of ["status", "org", "fund", "from", "to"]) {
    const value = key in overrides ? overrides[key] : param(sp, key)
    if (value) q.set(key, value)
  }
  const s = q.toString()
  return s ? `/requests?${s}` : "/requests"
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const sp = await searchParams
  const status = param(sp, "status")
  const org = param(sp, "org")
  const fund = param(sp, "fund")
  const from = param(sp, "from")
  const to = param(sp, "to")

  const where: Prisma.PaymentRequestWhereInput = {
    isDeletedIn1c: false,
    ...(status ? { executionStatus: status as ExecutionStatus } : {}),
    ...(org ? { orgName: org } : {}),
    ...(fund ? { fund } : {}),
    ...(from || to
      ? {
          payDate: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59+03:00`) } : {}),
          },
        }
      : {}),
  }

  const [requests, lastSync, orgs, funds] = await Promise.all([
    prisma.paymentRequest.findMany({
      where,
      orderBy: { payDate: "desc" },
      include: { _count: { select: { executionComments: true } } },
    }),
    prisma.syncRun.findFirst({
      where: { status: { in: ["ok", "error"] } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.paymentRequest.findMany({
      where: { isDeletedIn1c: false },
      distinct: ["orgName"],
      select: { orgName: true },
      orderBy: { orgName: "asc" },
    }),
    prisma.paymentRequest.findMany({
      where: { isDeletedIn1c: false, fund: { not: null } },
      distinct: ["fund"],
      select: { fund: true },
      orderBy: { fund: "asc" },
    }),
  ])

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Заявки на оплату</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {lastSync?.status === "error" ? (
            <span className="text-destructive">
              Ошибка обновления {formatDate(lastSync.startedAt)} — данные могли
              устареть
            </span>
          ) : lastSync?.finishedAt ? (
            <span>
              Данные на{" "}
              {lastSync.finishedAt.toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          ) : (
            <span>Данные ещё не загружались</span>
          )}
          <form action={refreshData}>
            <Button type="submit" variant="outline" size="sm">
              Обновить
            </Button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link key={f.value} href={buildQuery(sp, { status: f.value })}>
            <Badge variant={status === f.value ? "default" : "outline"}>
              {f.label}
            </Badge>
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        {status && <input type="hidden" name="status" value={status} />}
        <div className="grid gap-1.5">
          <label htmlFor="org" className="text-sm font-medium">
            Юрлицо
          </label>
          <select
            id="org"
            name="org"
            defaultValue={org}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Все</option>
            {orgs.map((o) => (
              <option key={o.orgName} value={o.orgName}>
                {o.orgName}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="fund" className="text-sm font-medium">
            Фонд
          </label>
          <select
            id="fund"
            name="fund"
            defaultValue={fund}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Все</option>
            {funds.map((f) => (
              <option key={f.fund} value={f.fund ?? ""}>
                {f.fund}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">
            Оплата с
          </label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">
            по
          </label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit" variant="secondary">
          Применить
        </Button>
        <Link href="/requests" className="text-sm underline underline-offset-4">
          Сбросить
        </Link>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Номер</TableHead>
            <TableHead>Юрлицо</TableHead>
            <TableHead>Контрагент</TableHead>
            <TableHead>Фонд</TableHead>
            <TableHead>Дата оплаты</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                Заявок нет. Нажмите «Обновить», чтобы загрузить данные.
              </TableCell>
            </TableRow>
          )}
          {requests.map((r) => (
            <TableRow key={r.uid}>
              <TableCell>
                <Link
                  href={`/requests/${r.uid}`}
                  className="text-primary underline underline-offset-4"
                >
                  {r.number}
                </Link>
                {r.importance === 1 && (
                  <span className="text-destructive ml-1" title="Срочная">
                    !
                  </span>
                )}
              </TableCell>
              <TableCell>{r.orgName}</TableCell>
              <TableCell>{r.partnerName}</TableCell>
              <TableCell>{r.fund}</TableCell>
              <TableCell>{formatDate(r.payDate)}</TableCell>
              <TableCell className="text-right">
                {formatMoneyBig(r.amountMinor, r.currency)}
              </TableCell>
              <TableCell>
                <Badge className={STATUS_CLASSES[r.executionStatus]}>
                  {STATUS_LABELS[r.executionStatus]}
                </Badge>
                {r.executionStatus === "overdue" &&
                  r._count.executionComments > 0 && (
                    <span
                      className="text-muted-foreground ml-1 text-xs"
                      title="Есть объяснение бухгалтера"
                    >
                      💬
                    </span>
                  )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
```

- [ ] **Step 4: E2e-хелпер и смоук**

```typescript
// tests/e2e/helpers.ts
import { expect, type Page } from "@playwright/test"

// Материализует fixture-данные через реальный конвейер: кнопка «Обновить»
// на реестре запускает синк fixture-шлюза (DWH_MODE=fixture в .env).
export async function syncFixtureData(page: Page) {
  await page.goto("/requests")
  await page.getByRole("button", { name: "Обновить" }).click()
  await expect(page.getByRole("link", { name: "REQ-0001" })).toBeVisible()
}
```

```typescript
// tests/e2e/requests.spec.ts
import { expect, test } from "@playwright/test"
import { syncFixtureData } from "./helpers"

test("реестр: синк наполняет таблицу, статусы подсвечены", async ({
  page,
}) => {
  await syncFixtureData(page)
  await expect(page.getByText("Исполнена")).toBeVisible()
  await expect(page.getByText("Просрочена")).toBeVisible()
  await expect(page.getByText("Данные на")).toBeVisible()
})

test("реестр: фильтр «Красные» оставляет только просроченные", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByText("Красные", { exact: true }).click()
  await expect(page.getByRole("link", { name: "REQ-0002" })).toBeVisible()
  await expect(page.getByRole("link", { name: "REQ-0001" })).toHaveCount(0)
})
```

- [ ] **Step 5: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/requests.spec.ts`
Expected: PASS (2 теста). Dev-БД и `.env` (DWH_MODE=fixture) должны быть настроены.

- [ ] **Step 6: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/ tests/e2e/
git commit -m "feat: реестр заявок — статусы исполнения, фильтры, свежесть данных"
```

---

### Task 11: Карточка заявки `/requests/[uid]`

**Files:**
- Create: `app/requests/[uid]/page.tsx`
- Test: `tests/e2e/requests.spec.ts` (дополнить)

- [ ] **Step 1: Страница карточки**

```tsx
// app/requests/[uid]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/domain/dates"
import { executionDeadline } from "@/lib/domain/execution-status"
import { formatMoneyBig } from "@/lib/domain/money"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { STATUS_CLASSES, STATUS_LABELS } from "../status"

export const dynamic = "force-dynamic"

export default async function RequestPage({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const { uid } = await params
  const request = await prisma.paymentRequest.findUnique({
    where: { uid },
    include: {
      debits: { orderBy: { date: "asc" } },
      executionComments: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!request) notFound()

  const deadline = executionDeadline(request.payDate)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <Link
          href="/requests"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← К реестру
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Заявка {request.number}</h1>
        <Badge className={STATUS_CLASSES[request.executionStatus]}>
          {STATUS_LABELS[request.executionStatus]}
        </Badge>
        {request.importance === 1 && (
          <Badge variant="destructive">Срочная</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Реквизиты</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Сумма</dt>
              <dd className="font-medium">
                {formatMoneyBig(request.amountMinor, request.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Дата оплаты</dt>
              <dd>{formatDate(request.payDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Юрлицо</dt>
              <dd>{request.orgName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Контрагент</dt>
              <dd>{request.partnerName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Статья ДДС</dt>
              <dd>{request.cashFlowItem}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Фонд</dt>
              <dd>{request.fund}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Инициатор</dt>
              <dd>{request.initiator}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Дата заявки</dt>
              <dd>{formatDate(request.date)}</dd>
            </div>
          </dl>
          {request.comment && (
            <p className="text-muted-foreground mt-4 text-sm">
              {request.comment}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Исполнение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {request.executionStatus === "executed" && request.executedAt ? (
            <p>Исполнена: списание {formatDate(request.executedAt)}.</p>
          ) : request.approvalStatus === "approved" ? (
            <p>
              Ожидалось списание до {formatDate(deadline)} 11:00 МСК.
              {request.executionStatus === "overdue" &&
                " Списания нет — заявка просрочена."}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Контроль исполнения начнётся после согласования.
            </p>
          )}

          {request.debits.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Банк</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {request.debits.map((d) => (
                  <TableRow key={d.docUid}>
                    <TableCell>{formatDate(d.date)}</TableCell>
                    <TableCell>{d.bankName}</TableCell>
                    <TableCell className="text-right">
                      {formatMoneyBig(d.amountMinor, request.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
```

- [ ] **Step 2: E2e (добавить в `tests/e2e/requests.spec.ts`)**

```typescript
test("карточка: исполненная заявка показывает списание", async ({ page }) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0001" }).click()
  await expect(
    page.getByRole("heading", { name: "Заявка REQ-0001" })
  ).toBeVisible()
  await expect(page.getByText("Исполнена: списание")).toBeVisible()
  await expect(page.getByText("Сбербанк")).toBeVisible()
})

test("карточка: несуществующий uid отдаёт 404", async ({ page }) => {
  const response = await page.goto("/requests/no-such-uid")
  expect(response?.status()).toBe(404)
})
```

- [ ] **Step 3: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/requests.spec.ts`
Expected: PASS (4 теста).

- [ ] **Step 4: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/ tests/e2e/requests.spec.ts
git commit -m "feat: карточка заявки — реквизиты и блок исполнения"
```

---

### Task 12: Комментарии бухгалтера

**Files:**
- Create: `app/requests/[uid]/actions.ts`
- Create: `app/requests/[uid]/comment-form.tsx`
- Modify: `app/requests/[uid]/page.tsx`
- Test: `tests/e2e/requests.spec.ts` (дополнить)

- [ ] **Step 1: Server action**

```typescript
// app/requests/[uid]/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export type FormState = { error: string | null }

// Объяснение бухгалтера к заявке (обычно — почему красная).
// Автор — текстовое поле до появления авторизации в приложении.
export async function addExecutionComment(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const uid = String(formData.get("uid") ?? "")
  const author = String(formData.get("author") ?? "").trim()
  const text = String(formData.get("text") ?? "").trim()

  if (!author) return { error: "Укажите автора" }
  if (!text) return { error: "Комментарий не может быть пустым" }

  const request = await prisma.paymentRequest.findUnique({ where: { uid } })
  if (!request) return { error: "Заявка не найдена" }

  await prisma.executionComment.create({
    data: { requestId: request.id, author, text },
  })

  revalidatePath(`/requests/${uid}`)
  revalidatePath("/requests")
  return { error: null }
}
```

- [ ] **Step 2: Клиентская форма**

```tsx
// app/requests/[uid]/comment-form.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addExecutionComment, type FormState } from "./actions"

const initialState: FormState = { error: null }

export function CommentForm({ uid }: { uid: string }) {
  const [state, formAction, isPending] = useActionState(
    addExecutionComment,
    initialState
  )

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="uid" value={uid} />
      <div className="grid gap-1.5">
        <Label htmlFor="author">Автор</Label>
        <Input id="author" name="author" required className="max-w-xs" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="text">Комментарий</Label>
        <Textarea
          id="text"
          name="text"
          required
          placeholder="Например: оплата перенесена, ждём подтверждение договора"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняю…" : "Добавить комментарий"}
      </Button>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Встроить в карточку**

В `app/requests/[uid]/page.tsx` добавить импорт и секцию после карточки «Исполнение»:

```tsx
import { CommentForm } from "./comment-form"
```

```tsx
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Комментарии бухгалтера</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {request.executionComments.length === 0 && (
            <p className="text-muted-foreground text-sm">Комментариев нет.</p>
          )}
          <ul className="space-y-3">
            {request.executionComments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium">{c.author}</span>{" "}
                <span className="text-muted-foreground">
                  {formatDate(c.createdAt)}
                </span>
                <p>{c.text}</p>
              </li>
            ))}
          </ul>
          <CommentForm uid={request.uid} />
        </CardContent>
      </Card>
```

- [ ] **Step 4: E2e (добавить в `tests/e2e/requests.spec.ts`)**

```typescript
test("комментарий бухгалтера сохраняется и виден на карточке", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0002" }).click()
  const text = `Ждём деньги от маркетплейса, оплатим позже — e2e-${Date.now()}`
  await page.getByLabel("Автор").fill("Бухгалтер Е2Е")
  await page.getByLabel("Комментарий").fill(text)
  await page.getByRole("button", { name: "Добавить комментарий" }).click()
  await expect(page.getByText(text)).toBeVisible()
})
```

- [ ] **Step 5: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/requests.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 6: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/ tests/e2e/requests.spec.ts
git commit -m "feat: комментарии бухгалтера к заявке"
```

---

### Task 13: Согласование и отклонение на карточке

**Files:**
- Modify: `app/requests/[uid]/actions.ts`
- Create: `app/requests/[uid]/approval-controls.tsx`
- Modify: `app/requests/[uid]/page.tsx`
- Test: `tests/e2e/requests.spec.ts` (дополнить)

- [ ] **Step 1: Server actions (добавить в `app/requests/[uid]/actions.ts`)**

```typescript
import { computeExecutionStatus } from "@/lib/domain/execution-status"
import { approveBids, declineBid } from "@/lib/integrations/one-c"

// Согласование уходит в 1С; при успехе статус в своей БД обновляется
// оптимистично — следующий синк из DWH его подтвердит.
export async function approveRequest(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const uid = String(formData.get("uid") ?? "")
  const request = await prisma.paymentRequest.findUnique({
    where: { uid },
    include: { _count: { select: { debits: true } } },
  })
  if (!request) return { error: "Заявка не найдена" }
  if (request.approvalStatus !== "on_approval")
    return { error: "Заявка уже обработана" }

  const res = await approveBids([uid])
  if (!res.ok) return { error: res.error }

  await prisma.paymentRequest.update({
    where: { uid },
    data: {
      approvalStatus: "approved",
      executionStatus: computeExecutionStatus(
        {
          approvalStatus: "approved",
          payDate: request.payDate,
          hasDebits: request._count.debits > 0,
        },
        new Date()
      ),
    },
  })

  revalidatePath(`/requests/${uid}`)
  revalidatePath("/requests")
  return { error: null }
}

export async function declineRequest(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const uid = String(formData.get("uid") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!reason) return { error: "Укажите причину отклонения" }

  const request = await prisma.paymentRequest.findUnique({ where: { uid } })
  if (!request) return { error: "Заявка не найдена" }
  if (request.approvalStatus !== "on_approval")
    return { error: "Заявка уже обработана" }

  const res = await declineBid(uid, reason)
  if (!res.ok) return { error: res.error }

  await prisma.paymentRequest.update({
    where: { uid },
    data: { approvalStatus: "declined", executionStatus: "declined" },
  })

  revalidatePath(`/requests/${uid}`)
  revalidatePath("/requests")
  return { error: null }
}
```

- [ ] **Step 2: Клиентский компонент**

```tsx
// app/requests/[uid]/approval-controls.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { approveRequest, declineRequest, type FormState } from "./actions"

const initialState: FormState = { error: null }

export function ApprovalControls({ uid }: { uid: string }) {
  const [approveState, approveAction, approvePending] = useActionState(
    approveRequest,
    initialState
  )
  const [declineState, declineAction, declinePending] = useActionState(
    declineRequest,
    initialState
  )

  return (
    <div className="space-y-4">
      <form action={approveAction}>
        <input type="hidden" name="uid" value={uid} />
        <Button type="submit" disabled={approvePending || declinePending}>
          {approvePending ? "Отправляю в 1С…" : "Согласовать"}
        </Button>
        {approveState.error && (
          <p className="text-destructive mt-2 text-sm">{approveState.error}</p>
        )}
      </form>

      <form action={declineAction} className="space-y-2">
        <input type="hidden" name="uid" value={uid} />
        <div className="grid gap-1.5">
          <Label htmlFor="reason">Причина отклонения</Label>
          <Textarea id="reason" name="reason" required />
        </div>
        <Button
          type="submit"
          variant="destructive"
          disabled={approvePending || declinePending}
        >
          {declinePending ? "Отправляю в 1С…" : "Отклонить"}
        </Button>
        {declineState.error && (
          <p className="text-destructive text-sm">{declineState.error}</p>
        )}
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Встроить в карточку**

В `app/requests/[uid]/page.tsx` добавить импорт и секцию (после «Реквизиты», перед «Исполнение»):

```tsx
import { ApprovalControls } from "./approval-controls"
```

```tsx
      {request.approvalStatus === "on_approval" && !request.isDeletedIn1c && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Согласование</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalControls uid={request.uid} />
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: E2e (добавить в `tests/e2e/requests.spec.ts`; работает в `ONEC_API_MODE=mock`)**

```typescript
test("согласование заявки меняет статус (mock 1С)", async ({ page }) => {
  await syncFixtureData(page) // синк возвращает fixture-статусы, тест повторяем
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await page.getByRole("button", { name: "Согласовать" }).click()
  await expect(page.getByText("Ждёт оплаты")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Согласовать" })
  ).toHaveCount(0)
})

test("отклонение без причины показывает ошибку", async ({ page }) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0006" }).click()
  // required-атрибут не даст отправить пустую форму — проверяем серверную
  // валидацию через пробел
  await page.getByLabel("Причина отклонения").fill(" ")
  await page.getByRole("button", { name: "Отклонить" }).click()
  await expect(page.getByText("Укажите причину отклонения")).toBeVisible()
})
```

- [ ] **Step 5: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/requests.spec.ts`
Expected: PASS (7 тестов).

- [ ] **Step 6: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/ tests/e2e/requests.spec.ts
git commit -m "feat: согласование и отклонение заявки через REST API 1С"
```

---

### Task 14: Массовое согласование в реестре

**Files:**
- Modify: `app/requests/actions.ts`
- Create: `app/requests/requests-table.tsx`
- Modify: `app/requests/page.tsx`
- Test: `tests/e2e/requests.spec.ts` (дополнить)

- [ ] **Step 1: Server action (добавить в `app/requests/actions.ts`)**

```typescript
import { prisma } from "@/lib/db"
import { computeExecutionStatus } from "@/lib/domain/execution-status"
import { approveBids } from "@/lib/integrations/one-c"

export type FormState = { error: string | null }

export async function bulkApproveRequests(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const uids = formData.getAll("uids").map(String)
  if (uids.length === 0) return { error: "Выберите заявки" }

  const requests = await prisma.paymentRequest.findMany({
    where: { uid: { in: uids }, approvalStatus: "on_approval" },
    include: { _count: { select: { debits: true } } },
  })
  if (requests.length === 0)
    return { error: "Среди выбранных нет заявок на согласовании" }

  const res = await approveBids(requests.map((r) => r.uid))
  if (!res.ok) return { error: res.error }

  const now = new Date()
  for (const r of requests) {
    await prisma.paymentRequest.update({
      where: { uid: r.uid },
      data: {
        approvalStatus: "approved",
        executionStatus: computeExecutionStatus(
          {
            approvalStatus: "approved",
            payDate: r.payDate,
            hasDebits: r._count.debits > 0,
          },
          now
        ),
      },
    })
  }

  revalidatePath("/requests")
  return { error: null }
}
```

- [ ] **Step 2: Клиентская таблица с мультивыбором**

Суммы и даты форматируются на сервере (BigInt нельзя передавать в клиентские
props) — клиент получает готовые строки.

```tsx
// app/requests/requests-table.tsx
"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { bulkApproveRequests, type FormState } from "./actions"

export type RequestRow = {
  uid: string
  number: string
  urgent: boolean
  orgName: string
  partnerName: string
  fund: string
  payDateText: string
  amountText: string
  statusLabel: string
  statusClass: string
  hasExplanation: boolean
  canSelect: boolean // approvalStatus === on_approval
}

const initialState: FormState = { error: null }

export function RequestsTable({ rows }: { rows: RequestRow[] }) {
  const [state, formAction, isPending] = useActionState(
    bulkApproveRequests,
    initialState
  )
  const selectable = rows.filter((r) => r.canSelect)

  return (
    <form action={formAction} className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Номер</TableHead>
            <TableHead>Юрлицо</TableHead>
            <TableHead>Контрагент</TableHead>
            <TableHead>Фонд</TableHead>
            <TableHead>Дата оплаты</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                Заявок нет. Нажмите «Обновить», чтобы загрузить данные.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.uid}>
              <TableCell>
                {r.canSelect && (
                  // Нативный checkbox: сабмитится формой без JS-состояния
                  <input
                    type="checkbox"
                    name="uids"
                    value={r.uid}
                    aria-label={`Выбрать ${r.number}`}
                    className="accent-primary size-4"
                  />
                )}
              </TableCell>
              <TableCell>
                <Link
                  href={`/requests/${r.uid}`}
                  className="text-primary underline underline-offset-4"
                >
                  {r.number}
                </Link>
                {r.urgent && (
                  <span className="text-destructive ml-1" title="Срочная">
                    !
                  </span>
                )}
              </TableCell>
              <TableCell>{r.orgName}</TableCell>
              <TableCell>{r.partnerName}</TableCell>
              <TableCell>{r.fund}</TableCell>
              <TableCell>{r.payDateText}</TableCell>
              <TableCell className="text-right">{r.amountText}</TableCell>
              <TableCell>
                <Badge className={r.statusClass}>{r.statusLabel}</Badge>
                {r.hasExplanation && (
                  <span
                    className="text-muted-foreground ml-1 text-xs"
                    title="Есть объяснение бухгалтера"
                  >
                    💬
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectable.length > 0 && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Отправляю в 1С…" : "Согласовать выбранные"}
          </Button>
          {state.error && (
            <p className="text-destructive text-sm">{state.error}</p>
          )}
        </div>
      )}
    </form>
  )
}
```

- [ ] **Step 3: Переключить `app/requests/page.tsx` на клиентскую таблицу**

Удалить из `page.tsx` JSX-блок `<Table>…</Table>` и импорты Table-компонентов,
добавить импорт и маппинг:

```tsx
import { RequestsTable, type RequestRow } from "./requests-table"
```

```tsx
  const rows: RequestRow[] = requests.map((r) => ({
    uid: r.uid,
    number: r.number,
    urgent: r.importance === 1,
    orgName: r.orgName,
    partnerName: r.partnerName ?? "",
    fund: r.fund ?? "",
    payDateText: formatDate(r.payDate),
    amountText: formatMoneyBig(r.amountMinor, r.currency),
    statusLabel: STATUS_LABELS[r.executionStatus],
    statusClass: STATUS_CLASSES[r.executionStatus],
    hasExplanation:
      r.executionStatus === "overdue" && r._count.executionComments > 0,
    canSelect: r.approvalStatus === "on_approval",
  }))
```

и вместо прежней таблицы:

```tsx
      <RequestsTable rows={rows} />
```

- [ ] **Step 4: E2e (добавить в `tests/e2e/requests.spec.ts`)**

```typescript
test("массовое согласование выбранных заявок (mock 1С)", async ({ page }) => {
  await syncFixtureData(page)
  await page.getByLabel("Выбрать REQ-0004").check()
  await page.getByLabel("Выбрать REQ-0006").check()
  await page.getByRole("button", { name: "Согласовать выбранные" }).click()
  await expect(
    page.getByRole("button", { name: "Согласовать выбранные" })
  ).toHaveCount(0) // заявок on_approval не осталось
})
```

- [ ] **Step 5: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/requests.spec.ts`
Expected: PASS (8 тестов).

- [ ] **Step 6: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/ tests/e2e/requests.spec.ts
git commit -m "feat: массовое согласование заявок в реестре"
```

---

### Task 15: Навигация и финальный прогон

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Ссылка на модуль с главной**

В `app/page.tsx` добавить блок рядом со ссылкой «Транзакции» (внутри
родительского `div` с `gap-4`):

```tsx
        <div>
          <Link
            href="/requests"
            className="text-primary underline underline-offset-4"
          >
            Заявки на оплату
          </Link>
        </div>
```

- [ ] **Step 2: Полный прогон всех проверок и e2e**

Run: `npm run format && npm run lint && npm run typecheck && npm run test && npm run test:e2e`
Expected: всё зелёное, включая старые тесты транзакций.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: ссылка на заявки на оплату с главной страницы"
```

---

## Что считается готовым (Definition of Done)

- Реестр `/requests` показывает заявки с цветными статусами, фильтрами,
  свежестью данных и кнопкой «Обновить»; карточка — реквизиты, исполнение,
  комментарии, согласование.
- Синк идемпотентен, журналируется в `SyncRun`, работает через `DwhGateway`
  (fixture); `POST /api/jobs/sync` защищён секретом.
- Все unit-тесты домена и e2e-смоук зелёные; `npm run format && npm run lint
  && npm run typecheck && npm run test` проходит.
- Планы 04 (mssql-адаптер DWH) и 05 (отправка платёжек) можно начинать,
  не переделывая ядро: контракт `DwhGateway` и схема БД уже на месте.
