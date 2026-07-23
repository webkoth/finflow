# Сверка расчётных счётов — план реализации (этап 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ежедневная сверка независимой банковской выписки с движениями 1С и заявками на оплату: расхождения по остаткам/оборотам и подмена получателя видны в приложении и бейджем на остатках.

**Architecture:** Чистое доменное ядро сверки и парсер выписки `1CClientBankExchange` в `lib/domain/reconciliation/` (без сети и Prisma, TDD). Данные из 1С (движения, остаток) и заявки собирает оркестратор `lib/sync/run-reconciliation.ts`, выписку даёт слой `StatementSource` (этап 1 — ручной файл/папка). Результат пишется append-only в 3 таблицы Postgres и читается экраном `app/reconciliation/` и бейджами.

**Tech Stack:** Next.js (App Router) + TypeScript + Prisma + PostgreSQL + Vitest + Playwright. Никаких новых npm-зависимостей.

**Спека:** `docs/superpowers/specs/2026-07-23-bank-reconciliation-design.md`

**Границы этапа 1:** источник выписки — только `manual-file` (файл на экране + чтение из папки). Коннекторы `bank-api` к банкам — отдельный будущий план (этап 2), зависят от read-only доступов и одобрения библиотек разработчиком. Абстракция `StatementSource` в этом плане заложена так, чтобы коннекторы вставлялись без переделки.

---

## Структура файлов

Создаётся:
- `lib/domain/reconciliation/types.ts` — нормализованные типы (выписка, движение 1С, заявка, расхождение, результат).
- `lib/domain/reconciliation/amounts.ts` (+ `.test.ts`) — разбор денежных строк выписки в BigInt-копейки.
- `lib/domain/reconciliation/recipients.ts` (+ `.test.ts`) — нормализация имени и матч получателя.
- `lib/domain/reconciliation/reconcile.ts` (+ `.test.ts`) — ядро сверки (остатки/обороты + заявки).
- `lib/domain/reconciliation/parse-1c-statement.ts` (+ `.test.ts`) — парсер формата `1CClientBankExchange`.
- `lib/integrations/bank-statement/statement-source.ts` — интерфейс `StatementSource` и фабрика по env.
- `lib/integrations/bank-statement/manual-file-source.ts` — провайдер чтения из папки (+ декодирование win1251/utf8).
- `lib/integrations/bank-statement/fixture-source.ts` — демо-выписки для dev/e2e.
- `lib/sync/run-reconciliation.ts` — оркестрация одного прогона.
- `app/api/jobs/reconcile/route.ts` — джоб для cron (13:00 МСК).
- `app/reconciliation/page.tsx` — список прогонов.
- `app/reconciliation/[id]/page.tsx` — детали прогона + разбор расхождений.
- `app/reconciliation/actions.ts` — server actions (ручной прогон, разбор расхождения).
- `components/reconciliation/verified-badge.tsx` — бейдж «Проверено/Расхождение/…».
- `tests/e2e/reconciliation.spec.ts` — e2e-смоук.

Изменяется:
- `prisma/schema.prisma` — 3 модели + enum'ы + relation на `User`.
- `lib/integrations/one-c-odata.ts` — тип `OneCMovement` + метод `fetchAccountMovements`.
- `lib/integrations/one-c-odata-fixture.ts` — реализация `fetchAccountMovements`.
- `lib/integrations/one-c-odata-http.ts` — реализация `fetchAccountMovements`.
- `app/page.tsx` — бейдж на карточке «Остатки по счетам».
- `app/reference/bank-accounts/page.tsx` — бейдж в строке счёта.
- `components/app-sidebar.tsx` (или где меню) — пункт «Сверка».
- `prisma/seed.ts` — демо-прогон для dev.

---

## Task 1: Схема БД — таблицы сверки

**Files:**
- Modify: `prisma/schema.prisma`
- Modify (relation): `prisma/schema.prisma` модель `User`

- [ ] **Step 1: Добавить enum'ы и модели в конец `prisma/schema.prisma`**

```prisma
// --- Сверка расчётных счётов (спека 2026-07-23-bank-reconciliation-design) ---

enum ReconRunStatus {
  matched
  discrepancy
  no_data
}

enum ReconAccountStatus {
  matched
  discrepancy
  no_data
  source_error
}

enum ReconSourceType {
  bank_api
  manual_file
}

enum ReconSourceStatus {
  ok
  error
}

enum ReconResolution {
  new
  reviewed
  accepted
}

enum ReconTrigger {
  cron
  manual
}

enum ReconDiscrepancyType {
  closing_balance
  debit_turnover
  credit_turnover
  balance_identity
  recipient_mismatch
  request_not_executed
  payment_without_request
  amount_mismatch
}

// Прогон сверки за день. Append-only: записи не редактируются.
model ReconciliationRun {
  id          String         @id @default(cuid())
  runAt       DateTime       @default(now()) @db.Timestamptz(3)
  periodStart DateTime       @db.Timestamptz(3)
  periodEnd   DateTime       @db.Timestamptz(3)
  status      ReconRunStatus
  trigger     ReconTrigger

  accountResults ReconciliationAccountResult[]
  discrepancies  ReconciliationDiscrepancy[]

  @@index([runAt])
  @@map("reconciliation_runs")
}

// Итог по одному счёту в прогоне. Суммы — BigInt-копейки.
model ReconciliationAccountResult {
  id            String @id @default(cuid())
  runId         String
  accountUid    String? // UID банковского счёта 1С
  bankName      String?
  accountNumber String
  currency      String

  stmtOpeningMinor BigInt? // эталон (выписка)
  stmtClosingMinor BigInt?
  stmtDebitMinor   BigInt?
  stmtCreditMinor  BigInt?

  onecClosingMinor BigInt? // 1С
  onecDebitMinor   BigInt?
  onecCreditMinor  BigInt?

  status ReconAccountStatus

  sourceType   ReconSourceType
  sourceStatus ReconSourceStatus
  sourceError  String?

  statementFileName String?
  statementSha256   String? // хеш первоисточника — детекция подмены

  run           ReconciliationRun          @relation(fields: [runId], references: [id], onDelete: Cascade)
  discrepancies ReconciliationDiscrepancy[]

  @@index([runId])
  @@index([accountNumber])
  @@map("reconciliation_account_results")
}

// Одно расхождение. Руками правится только блок разбора (resolution*).
model ReconciliationDiscrepancy {
  id              String               @id @default(cuid())
  runId           String
  accountResultId String?
  requestUid      String? // ссылка на заявку (PaymentRequest.uid)
  type            ReconDiscrepancyType
  expected        String // значение эталона (строка для показа)
  actual          String // значение 1С
  amountMinor     BigInt?
  detail          String // где именно разошлось, напр. «заявка↔выписка»

  resolutionStatus ReconResolution @default(new)
  resolvedById     String?
  resolvedAt       DateTime?       @db.Timestamptz(3)
  note             String?

  run           ReconciliationRun            @relation(fields: [runId], references: [id], onDelete: Cascade)
  accountResult ReconciliationAccountResult? @relation(fields: [accountResultId], references: [id], onDelete: Cascade)
  resolvedBy    User?                        @relation(fields: [resolvedById], references: [id])

  @@index([runId])
  @@index([resolutionStatus])
  @@map("reconciliation_discrepancies")
}
```

- [ ] **Step 2: Добавить обратную связь в модель `User`**

В модель `User` (около строки 371) добавить поле-связь рядом с существующими связями:

```prisma
  reconResolutions ReconciliationDiscrepancy[]
```

- [ ] **Step 3: Создать миграцию**

Run: `npx prisma migrate dev --name bank-reconciliation`
Expected: миграция создаётся и применяется; `Your database is now in sync`. Это НЕ деструктивная миграция — только новые таблицы.

- [ ] **Step 4: Проверить генерацию клиента и типов**

Run: `npx prisma generate && npm run typecheck`
Expected: без ошибок; в `@prisma/client` появились `ReconRunStatus`, `ReconDiscrepancyType` и модели.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: схема сверки расчётных счётов (3 таблицы)"
```

---

## Task 2: Доменные типы сверки

**Files:**
- Create: `lib/domain/reconciliation/types.ts`

- [ ] **Step 1: Создать файл типов**

```ts
// Нормализованные типы сверки. Не зависят ни от Prisma, ни от формата выписки —
// адаптеры (парсер, gateway 1С, репозиторий) приводят данные к ним.

export type Direction = "debit" | "credit" // debit — списание, credit — приход

// Одна строка независимой выписки (эталон).
export type StatementLine = {
  direction: Direction
  amountMinor: bigint
  counterpartyName: string
  counterpartyInn: string | null
  counterpartyAccount: string | null
  purpose: string
}

// Разобранная выписка по одному счёту за период.
export type BankStatement = {
  accountNumber: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  openingMinor: bigint
  closingMinor: bigint
  lines: StatementLine[]
}

// Движение по счёту из 1С (Document_РасходСоСчета / Document_ПоступлениеНаСчет).
export type OneCMovement = {
  direction: Direction
  amountMinor: bigint
  counterpartyName: string
  counterpartyInn: string | null
  counterpartyAccount: string | null
  purpose: string
  basisRequestUid: string | null // ДокументОснование → заявка, null если нет
}

// Заявка на оплату для проверки исполнения (снапшот из finflow PaymentRequest).
export type RequestForCheck = {
  uid: string
  amountMinor: bigint
  partnerName: string
  partnerInn: string | null
  payDate: string // YYYY-MM-DD, плановая дата оплаты
  approved: boolean // одобрена к оплате
  executedIn1c: boolean // executionStatus говорит, что исполнена
}

export type ReconAccountStatus =
  | "matched"
  | "discrepancy"
  | "no_data"
  | "source_error"

export type DiscrepancyType =
  | "closing_balance"
  | "debit_turnover"
  | "credit_turnover"
  | "balance_identity"
  | "recipient_mismatch"
  | "request_not_executed"
  | "payment_without_request"
  | "amount_mismatch"

export type Discrepancy = {
  type: DiscrepancyType
  expected: string
  actual: string
  amountMinor: bigint | null
  detail: string
  requestUid: string | null
}

// Вход сверки по одному счёту.
export type AccountReconInput = {
  currency: string
  sourceError: boolean // источник выписки вернул ошибку (не absent)
  statement: BankStatement | null // null — выписки нет
  onecClosingMinor: bigint | null // остаток из AccountBalance, null — нет данных
  movements: OneCMovement[] | null // null — движения из 1С недоступны
  requests: RequestForCheck[]
}

// Итог сверки по одному счёту.
export type AccountReconResult = {
  status: ReconAccountStatus
  stmtOpeningMinor: bigint | null
  stmtClosingMinor: bigint | null
  stmtDebitMinor: bigint | null
  stmtCreditMinor: bigint | null
  onecClosingMinor: bigint | null
  onecDebitMinor: bigint | null
  onecCreditMinor: bigint | null
  discrepancies: Discrepancy[]
}
```

- [ ] **Step 2: Проверить типизацию**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add lib/domain/reconciliation/types.ts
git commit -m "feat: доменные типы сверки счётов"
```

---

## Task 3: Разбор денежных строк выписки

**Files:**
- Create: `lib/domain/reconciliation/amounts.ts`
- Test: `lib/domain/reconciliation/amounts.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from "vitest"
import { parseStatementAmount } from "./amounts"

describe("parseStatementAmount", () => {
  it("разбирает сумму с точкой", () => {
    expect(parseStatementAmount("1500.00")).toBe(150000n)
  })

  it("разбирает сумму с запятой", () => {
    expect(parseStatementAmount("1500,50")).toBe(150050n)
  })

  it("игнорирует пробелы-разделители тысяч", () => {
    expect(parseStatementAmount("1 234 567.89")).toBe(123456789n)
  })

  it("дополняет одну цифру дробной части до копеек", () => {
    expect(parseStatementAmount("10.5")).toBe(1050n)
  })

  it("целое без дробной части", () => {
    expect(parseStatementAmount("42")).toBe(4200n)
  })

  it("больше двух знаков дробной части — округляет до копеек", () => {
    expect(parseStatementAmount("10.005")).toBe(1001n)
    expect(parseStatementAmount("10.004")).toBe(1000n)
  })

  it("пустая или нечисловая строка — ошибка", () => {
    expect(() => parseStatementAmount("")).toThrow()
    expect(() => parseStatementAmount("abc")).toThrow()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test -- amounts`
Expected: FAIL, `parseStatementAmount is not a function` / модуль не найден.

- [ ] **Step 3: Реализовать**

```ts
// Разбор денежной строки выписки в целые BigInt-копейки.
// Выписки 1CClientBankExchange используют точку; допускаем и запятую,
// и пробелы-разделители тысяч. Округление дробной части — до копейки.
export function parseStatementAmount(input: string): bigint {
  const cleaned = input.trim().replace(/\s+/g, "").replace(",", ".")
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`Не число в сумме выписки: "${input}"`)
  }
  const negative = cleaned.startsWith("-")
  const abs = negative ? cleaned.slice(1) : cleaned
  const [whole, frac = ""] = abs.split(".")
  // до трёх знаков достаточно для корректного округления сотых
  const frac3 = (frac + "000").slice(0, 3)
  const thousandths = BigInt(whole) * 1000n + BigInt(frac3)
  // округление до копеек (сотых): делим на 10 с округлением
  const rounded = (thousandths + 5n) / 10n
  return negative ? -rounded : rounded
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test -- amounts`
Expected: PASS, все кейсы.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reconciliation/amounts.ts lib/domain/reconciliation/amounts.test.ts
git commit -m "feat: разбор денежных строк выписки в копейки"
```

---

## Task 4: Нормализация имени и матч получателя

**Files:**
- Create: `lib/domain/reconciliation/recipients.ts`
- Test: `lib/domain/reconciliation/recipients.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from "vitest"
import { normalizeName, matchRecipient } from "./recipients"

describe("normalizeName", () => {
  it("убирает орг-форму, кавычки и регистр", () => {
    expect(normalizeName('ООО «Ромашка»')).toBe("РОМАШКА")
    expect(normalizeName('ИП Иванов И.И.')).toBe("ИВАНОВ И.И.")
  })

  it("схлопывает пробелы", () => {
    expect(normalizeName("  Тори   Брэндс ")).toBe("ТОРИ БРЭНДС")
  })
})

describe("matchRecipient", () => {
  it("совпадение по ИНН — сильный матч", () => {
    const r = matchRecipient(
      { name: "ООО Ромашка", inn: "7701234567", account: "111" },
      { name: "Ромашка", inn: "7701234567", account: "222" }
    )
    expect(r).toBe("match")
  })

  it("разные ИНН — mismatch, даже если имена похожи", () => {
    const r = matchRecipient(
      { name: "Ромашка", inn: "7701234567", account: null },
      { name: "Ромашка", inn: "7709999999", account: null }
    )
    expect(r).toBe("mismatch")
  })

  it("нет ИНН — сверка по счёту", () => {
    expect(
      matchRecipient(
        { name: "A", inn: null, account: "40817810099910004312" },
        { name: "B", inn: null, account: "40817810099910004312" }
      )
    ).toBe("match")
    expect(
      matchRecipient(
        { name: "A", inn: null, account: "111" },
        { name: "B", inn: null, account: "222" }
      )
    ).toBe("mismatch")
  })

  it("нет ни ИНН, ни счёта — слабый матч по имени", () => {
    expect(
      matchRecipient(
        { name: "ООО «Ромашка»", inn: null, account: null },
        { name: "Ромашка", inn: null, account: null }
      )
    ).toBe("weak-match")
    expect(
      matchRecipient(
        { name: "Ромашка", inn: null, account: null },
        { name: "Одуванчик", inn: null, account: null }
      )
    ).toBe("mismatch")
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test -- recipients`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализовать**

```ts
export type Party = {
  name: string
  inn: string | null
  account: string | null
}

export type RecipientMatch = "match" | "mismatch" | "weak-match"

const ORG_FORMS = /\b(ООО|ОАО|ЗАО|ПАО|АО|ИП|НКО|ОО|ФГУП|МУП|ГУП)\b/gi

// Нормализация названия для слабого матча: регистр, кавычки, орг-форма, пробелы.
export function normalizeName(name: string): string {
  return name
    .replace(ORG_FORMS, " ")
    .replace(/[«»"'`]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

// Матч получателя по приоритету: ИНН → номер счёта → нормализованное имя.
export function matchRecipient(a: Party, b: Party): RecipientMatch {
  if (a.inn && b.inn) return a.inn === b.inn ? "match" : "mismatch"
  if (a.account && b.account) {
    return a.account === b.account ? "match" : "mismatch"
  }
  return normalizeName(a.name) === normalizeName(b.name)
    ? "weak-match"
    : "mismatch"
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test -- recipients`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reconciliation/recipients.ts lib/domain/reconciliation/recipients.test.ts
git commit -m "feat: нормализация имени и матч получателя по ИНН/счёту/имени"
```

---

## Task 5: Ядро сверки — плоскость 1 (остатки и обороты)

**Files:**
- Create: `lib/domain/reconciliation/reconcile.ts`
- Test: `lib/domain/reconciliation/reconcile.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from "vitest"
import { reconcileAccount } from "./reconcile"
import type { AccountReconInput, BankStatement } from "./types"

function stmt(over: Partial<BankStatement> = {}): BankStatement {
  return {
    accountNumber: "40702810900000001111",
    periodStart: "2026-07-23",
    periodEnd: "2026-07-23",
    openingMinor: 100000n,
    closingMinor: 90000n,
    lines: [
      {
        direction: "debit",
        amountMinor: 10000n,
        counterpartyName: "ООО Ромашка",
        counterpartyInn: "7701234567",
        counterpartyAccount: "222",
        purpose: "оплата",
      },
    ],
    ...over,
  }
}

function baseInput(over: Partial<AccountReconInput> = {}): AccountReconInput {
  return {
    currency: "RUB",
    sourceError: false,
    statement: stmt(),
    onecClosingMinor: 90000n,
    movements: [
      {
        direction: "debit",
        amountMinor: 10000n,
        counterpartyName: "ООО Ромашка",
        counterpartyInn: "7701234567",
        counterpartyAccount: "222",
        purpose: "оплата",
        basisRequestUid: null,
      },
    ],
    requests: [],
    ...over,
  }
}

describe("reconcileAccount — остатки и обороты", () => {
  it("всё сходится — matched, без расхождений", () => {
    const r = reconcileAccount(baseInput())
    expect(r.status).toBe("matched")
    expect(r.discrepancies).toEqual([])
    expect(r.stmtDebitMinor).toBe(10000n)
    expect(r.onecDebitMinor).toBe(10000n)
  })

  it("ошибка источника — source_error, сверки нет", () => {
    const r = reconcileAccount(
      baseInput({ sourceError: true, statement: null })
    )
    expect(r.status).toBe("source_error")
    expect(r.discrepancies).toEqual([])
  })

  it("нет выписки и нет движений — no_data", () => {
    const r = reconcileAccount(
      baseInput({ statement: null, movements: null, onecClosingMinor: null })
    )
    expect(r.status).toBe("no_data")
  })

  it("конечный остаток 1С ≠ выписке — closing_balance", () => {
    const r = reconcileAccount(baseInput({ onecClosingMinor: 91000n }))
    expect(r.status).toBe("discrepancy")
    expect(r.discrepancies.map((d) => d.type)).toContain("closing_balance")
  })

  it("оборот-дебет 1С ≠ выписке — debit_turnover", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 9999n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "оплата",
            basisRequestUid: null,
          },
        ],
      })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain("debit_turnover")
  })

  it("нарушено тождество остатков выписки — balance_identity", () => {
    // opening 100000 + credit 0 - debit 10000 = 90000, но closing = 80000
    const r = reconcileAccount(
      baseInput({ statement: stmt({ closingMinor: 80000n }) })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain("balance_identity")
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test -- reconcile`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализовать (плоскость 1 + каркас статуса)**

```ts
import { formatMoneyBig } from "@/lib/domain/money"
import type {
  AccountReconInput,
  AccountReconResult,
  Direction,
  Discrepancy,
  OneCMovement,
} from "./types"

function sumMovements(movements: OneCMovement[], dir: Direction): bigint {
  return movements
    .filter((m) => m.direction === dir)
    .reduce((acc, m) => acc + m.amountMinor, 0n)
}

function sumLines(
  lines: { direction: Direction; amountMinor: bigint }[],
  dir: Direction
): bigint {
  return lines
    .filter((l) => l.direction === dir)
    .reduce((acc, l) => acc + l.amountMinor, 0n)
}

const rub = (v: bigint, currency: string) => formatMoneyBig(v, currency)

export function reconcileAccount(input: AccountReconInput): AccountReconResult {
  const { statement, movements, onecClosingMinor, currency } = input

  const empty: AccountReconResult = {
    status: "no_data",
    stmtOpeningMinor: statement?.openingMinor ?? null,
    stmtClosingMinor: statement?.closingMinor ?? null,
    stmtDebitMinor: statement ? sumLines(statement.lines, "debit") : null,
    stmtCreditMinor: statement ? sumLines(statement.lines, "credit") : null,
    onecClosingMinor,
    onecDebitMinor: movements ? sumMovements(movements, "debit") : null,
    onecCreditMinor: movements ? sumMovements(movements, "credit") : null,
    discrepancies: [],
  }

  // Сбой источника выписки не может выглядеть как «проверено».
  if (input.sourceError) return { ...empty, status: "source_error" }

  // Нечего сверять.
  if (!statement && !movements) return { ...empty, status: "no_data" }

  const discrepancies: Discrepancy[] = []
  const stmtDebit = empty.stmtDebitMinor
  const stmtCredit = empty.stmtCreditMinor
  const onecDebit = empty.onecDebitMinor
  const onecCredit = empty.onecCreditMinor

  // Тождество остатков внутри выписки: начало + кредит − дебет = конец.
  if (statement) {
    const derived =
      statement.openingMinor + (stmtCredit ?? 0n) - (stmtDebit ?? 0n)
    if (derived !== statement.closingMinor) {
      discrepancies.push({
        type: "balance_identity",
        expected: rub(statement.closingMinor, currency),
        actual: rub(derived, currency),
        amountMinor: statement.closingMinor - derived,
        detail: "начало + кредит − дебет ≠ конец (выписка)",
        requestUid: null,
      })
    }
  }

  // Конечный остаток: выписка ↔ 1С (AccountBalance).
  if (statement && onecClosingMinor !== null) {
    if (statement.closingMinor !== onecClosingMinor) {
      discrepancies.push({
        type: "closing_balance",
        expected: rub(statement.closingMinor, currency),
        actual: rub(onecClosingMinor, currency),
        amountMinor: statement.closingMinor - onecClosingMinor,
        detail: "конечный остаток: выписка ↔ 1С",
        requestUid: null,
      })
    }
  }

  // Обороты: выписка ↔ движения 1С.
  if (statement && movements) {
    if (stmtDebit !== onecDebit) {
      discrepancies.push({
        type: "debit_turnover",
        expected: rub(stmtDebit ?? 0n, currency),
        actual: rub(onecDebit ?? 0n, currency),
        amountMinor: (stmtDebit ?? 0n) - (onecDebit ?? 0n),
        detail: "оборот-дебет: выписка ↔ 1С",
        requestUid: null,
      })
    }
    if (stmtCredit !== onecCredit) {
      discrepancies.push({
        type: "credit_turnover",
        expected: rub(stmtCredit ?? 0n, currency),
        actual: rub(onecCredit ?? 0n, currency),
        amountMinor: (stmtCredit ?? 0n) - (onecCredit ?? 0n),
        detail: "оборот-кредит: выписка ↔ 1С",
        requestUid: null,
      })
    }
  }

  const status = discrepancies.length > 0 ? "discrepancy" : "matched"
  return { ...empty, status, discrepancies }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test -- reconcile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reconciliation/reconcile.ts lib/domain/reconciliation/reconcile.test.ts
git commit -m "feat: ядро сверки — остатки и обороты"
```

---

## Task 6: Ядро сверки — плоскость 2 (заявка → списание → выписка)

**Files:**
- Modify: `lib/domain/reconciliation/reconcile.ts`
- Modify: `lib/domain/reconciliation/reconcile.test.ts`

- [ ] **Step 1: Добавить падающие тесты в `reconcile.test.ts`**

```ts
import type { RequestForCheck } from "./types"

function req(over: Partial<RequestForCheck> = {}): RequestForCheck {
  return {
    uid: "req-1",
    amountMinor: 10000n,
    partnerName: "ООО Ромашка",
    partnerInn: "7701234567",
    payDate: "2026-07-23",
    approved: true,
    executedIn1c: true,
    ...over,
  }
}

describe("reconcileAccount — заявки", () => {
  it("одобренная заявка без списания — request_not_executed", () => {
    const r = reconcileAccount(
      baseInput({ movements: [], requests: [req()] })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain("request_not_executed")
  })

  it("списание без заявки-основания — payment_without_request", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 10000n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "оплата",
            basisRequestUid: null,
          },
        ],
        requests: [],
      })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain(
      "payment_without_request"
    )
  })

  it("списали больше заявки — amount_mismatch", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 15000n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "оплата",
            basisRequestUid: "req-1",
          },
        ],
        requests: [req({ amountMinor: 10000n })],
        onecClosingMinor: 90000n,
        statement: stmt({ closingMinor: 90000n }),
      })
    )
    expect(r.discrepancies.map((d) => d.type)).toContain("amount_mismatch")
  })

  it("частичная оплата (списание меньше заявки) — НЕ расхождение", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 6000n,
            counterpartyName: "ООО Ромашка",
            counterpartyInn: "7701234567",
            counterpartyAccount: "222",
            purpose: "аванс",
            basisRequestUid: "req-1",
          },
        ],
        requests: [req({ amountMinor: 10000n })],
      })
    )
    expect(r.discrepancies.map((d) => d.type)).not.toContain("amount_mismatch")
  })

  it("получатель списания ≠ заявке — recipient_mismatch (заявка↔1С)", () => {
    const r = reconcileAccount(
      baseInput({
        movements: [
          {
            direction: "debit",
            amountMinor: 10000n,
            counterpartyName: "ООО Одуванчик",
            counterpartyInn: "7709999999",
            counterpartyAccount: "333",
            purpose: "оплата",
            basisRequestUid: "req-1",
          },
        ],
        requests: [req({ partnerInn: "7701234567" })],
      })
    )
    const mism = r.discrepancies.filter((d) => d.type === "recipient_mismatch")
    expect(mism.length).toBeGreaterThan(0)
    expect(mism[0].detail).toContain("заявка↔1С")
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test -- reconcile`
Expected: FAIL (новые кейсы не проходят — проверок заявок ещё нет).

- [ ] **Step 3: Добавить проверку заявок в `reconcile.ts`**

В начало файла добавить импорт матчера:

```ts
import { matchRecipient } from "./recipients"
```

Добавить функцию проверки заявок перед `reconcileAccount`:

```ts
// Плоскость 2: заявка → списание (1С) → выписка.
function checkPayments(input: AccountReconInput): Discrepancy[] {
  const { movements, requests, statement, currency } = input
  if (!movements) return []
  const out: Discrepancy[] = []

  const debitMovements = movements.filter((m) => m.direction === "debit")
  const byRequestUid = new Map<string, OneCMovement>()
  for (const m of debitMovements) {
    if (m.basisRequestUid) byRequestUid.set(m.basisRequestUid, m)
  }

  // Одобренная заявка со сроком ≤ конец периода без списания.
  for (const r of requests) {
    if (!r.approved) continue
    if (r.payDate > (statement?.periodEnd ?? r.payDate)) continue
    if (!byRequestUid.has(r.uid)) {
      out.push({
        type: "request_not_executed",
        expected: `исполнение заявки ${r.uid} на ${formatMoneyBig(r.amountMinor, currency)}`,
        actual: "списания нет",
        amountMinor: r.amountMinor,
        detail: `заявка «${r.partnerName}» одобрена, не исполнена`,
        requestUid: r.uid,
      })
    }
  }

  const requestByUid = new Map(requests.map((r) => [r.uid, r]))
  for (const m of debitMovements) {
    // Списание без заявки-основания.
    if (!m.basisRequestUid) {
      out.push({
        type: "payment_without_request",
        expected: "списание по заявке",
        actual: `списание «${m.counterpartyName}» на ${formatMoneyBig(m.amountMinor, currency)} без основания`,
        amountMinor: m.amountMinor,
        detail: "списание без заявки-основания",
        requestUid: null,
      })
      continue
    }
    const r = requestByUid.get(m.basisRequestUid)
    if (!r) continue // основание есть, но заявки нет в выборке дня — не наш кейс

    // Сумма: превышение — расхождение; недоплата — частичная (не расхождение).
    if (m.amountMinor > r.amountMinor) {
      out.push({
        type: "amount_mismatch",
        expected: formatMoneyBig(r.amountMinor, currency),
        actual: formatMoneyBig(m.amountMinor, currency),
        amountMinor: m.amountMinor - r.amountMinor,
        detail: `списание больше заявки ${r.uid}`,
        requestUid: r.uid,
      })
    }

    // Получатель: заявка ↔ 1С.
    const reqVs1c = matchRecipient(
      { name: r.partnerName, inn: r.partnerInn, account: null },
      { name: m.counterpartyName, inn: m.counterpartyInn, account: m.counterpartyAccount }
    )
    if (reqVs1c === "mismatch") {
      out.push({
        type: "recipient_mismatch",
        expected: `${r.partnerName} (ИНН ${r.partnerInn ?? "—"})`,
        actual: `${m.counterpartyName} (ИНН ${m.counterpartyInn ?? "—"})`,
        amountMinor: m.amountMinor,
        detail: "получатель: заявка↔1С",
        requestUid: r.uid,
      })
    }

    // Получатель: 1С ↔ выписка (по строке выписки с той же суммой).
    if (statement) {
      const line = statement.lines.find(
        (l) => l.direction === "debit" && l.amountMinor === m.amountMinor
      )
      if (line) {
        const oneCVsStmt = matchRecipient(
          { name: m.counterpartyName, inn: m.counterpartyInn, account: m.counterpartyAccount },
          { name: line.counterpartyName, inn: line.counterpartyInn, account: line.counterpartyAccount }
        )
        if (oneCVsStmt === "mismatch") {
          out.push({
            type: "recipient_mismatch",
            expected: `${m.counterpartyName} (ИНН ${m.counterpartyInn ?? "—"})`,
            actual: `${line.counterpartyName} (ИНН ${line.counterpartyInn ?? "—"})`,
            amountMinor: m.amountMinor,
            detail: "получатель: 1С↔выписка",
            requestUid: r.uid,
          })
        }
      }
    }
  }

  return out
}
```

Затем в `reconcileAccount` перед вычислением `status` слить расхождения заявок:

```ts
  // Плоскость 2 (заявки) — добавляем к расхождениям по счёту.
  discrepancies.push(...checkPayments(input))

  const status = discrepancies.length > 0 ? "discrepancy" : "matched"
  return { ...empty, status, discrepancies }
```

(заменяет прежние две строки `const status = ...` / `return ...`).

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test -- reconcile`
Expected: PASS, все кейсы плоскостей 1 и 2.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reconciliation/reconcile.ts lib/domain/reconciliation/reconcile.test.ts
git commit -m "feat: ядро сверки — заявка → списание → выписка"
```

---

## Task 7: Парсер выписки 1CClientBankExchange

**Files:**
- Create: `lib/domain/reconciliation/parse-1c-statement.ts`
- Test: `lib/domain/reconciliation/parse-1c-statement.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, expect, it } from "vitest"
import { parse1CStatement } from "./parse-1c-statement"

// Синтетический образец в формате реального kl_to_1c (WB Банк, ВерсияФормата=1.02):
// — остатки и обороты в секции счёта (НачальныйОстаток/КонечныйОстаток есть);
// — у документов ДВА поля имени: «Получатель=ИНН NNN ФИО» и чистый «Получатель1=ФИО»;
// — период охватывает несколько дней. Числа/имена вымышлены (реальные данные в git не кладём).
const SAMPLE = `1CClientBankExchange
ВерсияФормата=1.02
Кодировка=Windows
Отправитель=Вайлдберриз Банк
Получатель=1C
ДатаНачала=21.06.2026
ДатаКонца=23.06.2026
РасчСчет=40702810900000001111
СекцияРасчСчет
ДатаНачала=21.06.2026
ДатаКонца=23.06.2026
РасчСчет=40702810900000001111
НачальныйОстаток=1000.00
ВсегоПоступило=50.00
ВсегоСписано=100.00
КонечныйОстаток=950.00
КонецРасчСчет
СекцияДокумент=Платежное поручение
Номер=101
Дата=22.06.2026
Сумма=100.00
ПлательщикСчет=40702810900000001111
ПлательщикИНН=2311366523
Плательщик=ИНН 2311366523 ТОРИ БРЭНДС ООО
Плательщик1=ТОРИ БРЭНДС ООО
ПолучательСчет=40817810099910004312
ПолучательИНН=7701234567
Получатель=ИНН 7701234567 ООО "Ромашка"
Получатель1=ООО "Ромашка"
НазначениеПлатежа=Оплата по счету 5
КонецДокумента
СекцияДокумент=Платежное поручение
Номер=102
Дата=23.06.2026
Сумма=50.00
ПлательщикСчет=40817810000000009999
ПлательщикИНН=7708888888
Плательщик=ИНН 7708888888 ООО "Клиент"
Плательщик1=ООО "Клиент"
ПолучательСчет=40702810900000001111
ПолучательИНН=2311366523
Получатель=ИНН 2311366523 ТОРИ БРЭНДС ООО
Получатель1=ТОРИ БРЭНДС ООО
НазначениеПлатежа=Поступление
КонецДокумента
КонецФайла`

describe("parse1CStatement", () => {
  it("читает реквизиты счёта, период и остатки", () => {
    const s = parse1CStatement(SAMPLE, "40702810900000001111")
    expect(s.accountNumber).toBe("40702810900000001111")
    expect(s.periodStart).toBe("2026-06-21")
    expect(s.periodEnd).toBe("2026-06-23")
    expect(s.openingMinor).toBe(100000n)
    expect(s.closingMinor).toBe(95000n) // из поля КонечныйОстаток
  })

  it("списание: наш счёт — плательщик; имя из *1, ИНН отдельно", () => {
    const s = parse1CStatement(SAMPLE, "40702810900000001111")
    const debit = s.lines.find((l) => l.direction === "debit")
    expect(debit?.amountMinor).toBe(10000n)
    expect(debit?.counterpartyInn).toBe("7701234567")
    // чистое имя из «Получатель1», без префикса «ИНН NNN »
    expect(debit?.counterpartyName).toBe('ООО "Ромашка"')
    expect(debit?.counterpartyAccount).toBe("40817810099910004312")
  })

  it("приход: наш счёт — получатель", () => {
    const s = parse1CStatement(SAMPLE, "40702810900000001111")
    const credit = s.lines.find((l) => l.direction === "credit")
    expect(credit?.amountMinor).toBe(5000n)
    expect(credit?.counterpartyInn).toBe("7708888888")
    expect(credit?.counterpartyName).toBe('ООО "Клиент"')
  })

  it("если чистого *1 нет — снимает префикс «ИНН NNN » из основного поля", () => {
    const noClean = SAMPLE.replace(/Получатель1=[^\n]*\n/g, "")
    const s = parse1CStatement(noClean, "40702810900000001111")
    const debit = s.lines.find((l) => l.direction === "debit")
    expect(debit?.counterpartyName).toBe('ООО "Ромашка"')
  })

  it("конечный остаток выводится из тождества, если в файле его нет", () => {
    const noClosing = SAMPLE.replace(/КонечныйОстаток=[^\n]*\n/, "")
    const s = parse1CStatement(noClosing, "40702810900000001111")
    expect(s.closingMinor).toBe(95000n) // 1000 + 50 − 100
  })

  it("нет секции нужного счёта — ошибка", () => {
    expect(() => parse1CStatement(SAMPLE, "40702810900000009999")).toThrow()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test -- parse-1c-statement`
Expected: FAIL, модуль не найден.

- [ ] **Step 3: Реализовать**

```ts
import type { BankStatement, StatementLine } from "./types"
import { parseStatementAmount } from "./amounts"

// dd.mm.yyyy → yyyy-mm-dd
function toIso(d: string): string {
  const m = d.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) throw new Error(`Неверная дата в выписке: "${d}"`)
  return `${m[3]}-${m[2]}-${m[1]}`
}

// Разбирает блок "ключ=значение" построчно в Map (первое вхождение ключа).
function kv(block: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of block.split(/\r?\n/)) {
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!map.has(key)) map.set(key, line.slice(idx + 1).trim())
  }
  return map
}

// Имя контрагента: предпочитаем чистое поле «*1» (Плательщик1/Получатель1),
// иначе снимаем префикс «ИНН <цифры> » из основного поля (формат WB Банка и др.).
function partyName(d: Map<string, string>, base: string): string {
  const clean = d.get(base + "1")
  if (clean && clean.trim() !== "") return clean.trim()
  const raw = d.get(base) ?? ""
  return raw.replace(/^ИНН\s+\d+\s+/i, "").trim()
}

// Парсер стандартного обмена «банк-клиент ↔ 1С» (1CClientBankExchange, kl_to_1c).
// account — номер расчётного счёта, по которому строим выписку.
export function parse1CStatement(
  text: string,
  account: string
): BankStatement {
  // Секция реквизитов счёта.
  const acctMatch = text.match(
    /СекцияРасчСчет\r?\n([\s\S]*?)\r?\nКонецРасчСчет/
  )
  const acct = acctMatch ? kv(acctMatch[1]) : new Map<string, string>()
  const acctInFile = acct.get("РасчСчет")
  if (acctInFile !== account) {
    throw new Error(
      `В выписке нет секции счёта ${account} (найден ${acctInFile ?? "—"})`
    )
  }

  const periodStart = toIso(acct.get("ДатаНачала") ?? "")
  const periodEnd = toIso(acct.get("ДатаКонца") ?? acct.get("ДатаНачала") ?? "")
  const openingMinor = parseStatementAmount(acct.get("НачальныйОстаток") ?? "0")

  // Документы.
  const lines: StatementLine[] = []
  const docRe = /СекцияДокумент=[^\n]*\r?\n([\s\S]*?)\r?\nКонецДокумента/g
  let dm: RegExpExecArray | null
  while ((dm = docRe.exec(text)) !== null) {
    const d = kv(dm[1])
    const payerAccount = d.get("ПлательщикСчет")
    const payeeAccount = d.get("ПолучательСчет")
    const amountMinor = parseStatementAmount(d.get("Сумма") ?? "0")

    if (payerAccount === account) {
      // Наш счёт — плательщик → списание; контрагент = получатель.
      lines.push({
        direction: "debit",
        amountMinor,
        counterpartyName: partyName(d, "Получатель"),
        counterpartyInn: d.get("ПолучательИНН") ?? null,
        counterpartyAccount: payeeAccount ?? null,
        purpose: d.get("НазначениеПлатежа") ?? "",
      })
    } else if (payeeAccount === account) {
      // Наш счёт — получатель → приход; контрагент = плательщик.
      lines.push({
        direction: "credit",
        amountMinor,
        counterpartyName: partyName(d, "Плательщик"),
        counterpartyInn: d.get("ПлательщикИНН") ?? null,
        counterpartyAccount: payerAccount ?? null,
        purpose: d.get("НазначениеПлатежа") ?? "",
      })
    }
    // Документ, не затрагивающий наш счёт, пропускаем.
  }

  const debit = lines
    .filter((l) => l.direction === "debit")
    .reduce((a, l) => a + l.amountMinor, 0n)
  const credit = lines
    .filter((l) => l.direction === "credit")
    .reduce((a, l) => a + l.amountMinor, 0n)

  // Конечный остаток: из файла, иначе выводим из тождества.
  const closingRaw = acct.get("КонечныйОстаток")
  const closingMinor =
    closingRaw !== undefined
      ? parseStatementAmount(closingRaw)
      : openingMinor + credit - debit

  return {
    accountNumber: account,
    periodStart,
    periodEnd,
    openingMinor,
    closingMinor,
    lines,
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test -- parse-1c-statement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reconciliation/parse-1c-statement.ts lib/domain/reconciliation/parse-1c-statement.test.ts
git commit -m "feat: парсер выписки 1CClientBankExchange"
```

---

## Task 8: Движения 1С — расширение gateway

**Files:**
- Modify: `lib/integrations/one-c-odata.ts`
- Modify: `lib/integrations/one-c-odata-fixture.ts`
- Modify: `lib/integrations/one-c-odata-http.ts`

- [ ] **Step 1: Добавить тип и метод в контракт `one-c-odata.ts`**

Импортировать доменный тип и расширить интерфейс. В начало файла добавить:

```ts
import type { OneCMovement } from "@/lib/domain/reconciliation/types"
```

В интерфейс `OneCGateway` добавить метод:

```ts
  // Движения по счёту за период [from, to] (YYYY-MM-DD включительно): расход + приход.
  fetchAccountMovements(
    accountUid: string,
    from: string,
    to: string
  ): Promise<OneCMovement[]>
```

- [ ] **Step 2: Реализовать в фикстуре `one-c-odata-fixture.ts`**

Добавить демо-движения и метод (в объект `fixtureOneCGateway`):

```ts
import type { OneCMovement } from "@/lib/domain/reconciliation/types"

// Демо-движения: одно списание по заявке fx-req-1 и один приход.
const MOVEMENTS: Record<string, OneCMovement[]> = {
  "fx-acc-sber": [
    {
      direction: "debit",
      amountMinor: 10000n,
      counterpartyName: "ООО Ромашка",
      counterpartyInn: "7701234567",
      counterpartyAccount: "40817810099910004312",
      purpose: "Оплата по счету 5",
      basisRequestUid: "fx-req-1",
    },
    {
      direction: "credit",
      amountMinor: 5000n,
      counterpartyName: "ООО Клиент",
      counterpartyInn: "7708888888",
      counterpartyAccount: "40817810000000009999",
      purpose: "Поступление",
      basisRequestUid: null,
    },
  ],
}
```

В объект `fixtureOneCGateway` добавить метод:

```ts
  async fetchAccountMovements(accountUid: string) {
    return MOVEMENTS[accountUid] ?? []
  },
```

- [ ] **Step 3: Реализовать в HTTP-клиенте `one-c-odata-http.ts`**

Добавить имена наборов движений в карту `NAMES` (после `accountFields`):

```ts
  movements: {
    expense: "Document_РасходСоСчета",
    receipt: "Document_ПоступлениеНаСчет",
  },
  movementFields: {
    account: "БанковскийСчет_Key",
    amount: "СуммаДокумента",
    counterpartyName: "Контрагент/Description",
    counterpartyInn: "Контрагент/ИНН",
    counterpartyAccount: "СчетКонтрагента/НомерСчета",
    purpose: "НазначениеПлатежа",
    basis: "ДокументОснование",
    date: "Date",
  },
```

Добавить импорт типа и метод в объект `httpOneCGateway`:

```ts
import type { OneCMovement } from "@/lib/domain/reconciliation/types"
```

```ts
  async fetchAccountMovements(
    accountUid: string,
    from: string,
    to: string
  ): Promise<OneCMovement[]> {
    const f = NAMES.movementFields
    // Границы периода по московскому времени в формате OData datetime.
    const fromDt = `${from}T00:00:00`
    const toDt = `${to}T23:59:59`
    const filter = (extra: string) =>
      `${f.account} eq guid'${accountUid}' and ${f.date} ge datetime'${fromDt}' and ${f.date} le datetime'${toDt}'${extra}`

    const build = (set: string, dir: "debit" | "credit") =>
      `${set}?$format=json&$filter=${encodeURIComponent(filter(""))}` +
      `&$expand=${encodeURIComponent("Контрагент,СчетКонтрагента")}`

    const [expense, receipt] = await Promise.all([
      fetchFiltered(build(NAMES.movements.expense, "debit")),
      fetchFiltered(build(NAMES.movements.receipt, "credit")),
    ])

    const map = (rows: Row[], dir: "debit" | "credit"): OneCMovement[] =>
      rows.map((row) => ({
        direction: dir,
        amountMinor: rublesToMinor(row[f.amount]),
        counterpartyName: nestedStr(row, "Контрагент", "Description") ?? "",
        counterpartyInn: nestedStr(row, "Контрагент", "ИНН"),
        counterpartyAccount: nestedStr(row, "СчетКонтрагента", "НомерСчета"),
        purpose: str(row, f.purpose) ?? "",
        basisRequestUid: str(row, f.basis),
      }))

    return [...map(expense, "debit"), ...map(receipt, "credit")]
  },
```

Добавить вспомогательные функции в конец файла (перед экспортом объекта не обязательно — можно после `fetchAll`):

```ts
// Запрос с готовым query-string (в отличие от постраничного fetchAll).
async function fetchFiltered(query: string): Promise<Row[]> {
  const { base, auth } = config()
  const res = await fetch(`${base}/${query}`, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`1С ответила ошибкой: HTTP ${res.status} (движения)`)
  }
  const json = (await res.json()) as { value?: Row[] }
  return json.value ?? []
}

// Сумма из 1С приходит в рублях (число/строка) → BigInt-копейки.
function rublesToMinor(v: unknown): bigint {
  const n = typeof v === "number" ? v : Number(String(v ?? "0"))
  if (!Number.isFinite(n)) return 0n
  return BigInt(Math.round(n * 100))
}

// Значение вложенного (expand) объекта: row["Контрагент"]["Description"].
function nestedStr(row: Row, rel: string, field: string): string | null {
  const obj = row[rel]
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[field]
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return String(v).trim()
    }
  }
  return null
}
```

> Примечание для исполнителя: точные пути expand (`Контрагент/ИНН`, `СчетКонтрагента/НомерСчета`) и имя типа `ДокументОснование_Type` проверяются живым запросом к 1С при переключении в `real`-режим (см. открытые вопросы спеки). В `fixture`-режиме (dev/e2e) HTTP-клиент не вызывается.

- [ ] **Step 4: Проверить типизацию и тесты**

Run: `npm run typecheck && npm run test`
Expected: без ошибок; существующие тесты зелёные.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/one-c-odata.ts lib/integrations/one-c-odata-fixture.ts lib/integrations/one-c-odata-http.ts
git commit -m "feat: чтение движений по счёту из 1С (расход + приход)"
```

---

## Task 9: Слой источника выписки (StatementSource)

**Files:**
- Create: `lib/integrations/bank-statement/statement-source.ts`
- Create: `lib/integrations/bank-statement/fixture-source.ts`
- Create: `lib/integrations/bank-statement/manual-file-source.ts`

- [ ] **Step 1: Создать контракт `statement-source.ts`**

```ts
import type { BankStatement } from "@/lib/domain/reconciliation/types"
import { fixtureStatementSource } from "./fixture-source"
import { manualFileStatementSource } from "./manual-file-source"

export type StatementAccount = {
  accountNumber: string
  accountUid: string | null
}

// Результат получения выписки по счёту за день.
export type StatementFetch =
  | {
      status: "ok"
      statement: BankStatement
      fileName: string
      sha256: string
    }
  | { status: "error"; error: string } // сбой источника → source_error
  | { status: "absent" } // выписки нет (не ошибка) → no_data

export interface StatementSource {
  getStatement(account: StatementAccount, day: string): Promise<StatementFetch>
}

// RECON_STATEMENT_MODE: "fixture" (dev/e2e) | "manual_file" (чтение из папки).
// Незаданный режим не даёт молчаливый mock — по умолчанию fixture в dev.
export function getStatementSource(): StatementSource {
  const mode = process.env.RECON_STATEMENT_MODE ?? "fixture"
  if (mode === "fixture") return fixtureStatementSource
  if (mode === "manual_file") return manualFileStatementSource
  throw new Error(`RECON_STATEMENT_MODE="${mode}" не поддерживается`)
}
```

- [ ] **Step 2: Создать демо-источник `fixture-source.ts`**

```ts
import { createHash } from "node:crypto"
import { parse1CStatement } from "@/lib/domain/reconciliation/parse-1c-statement"
import type { StatementFetch, StatementSource } from "./statement-source"

// Демо-выписка для fx-acc-sber: сходится с фикстурой движений 1С.
// Списание 100 (Ромашка), приход 50 (Клиент); opening 1000 → closing 950.
function sampleFor(accountNumber: string, day: string): string {
  const d = day.split("-").reverse().join(".") // YYYY-MM-DD → dd.mm.yyyy
  return `1CClientBankExchange
ВерсияФормата=1.03
Кодировка=Windows
СекцияРасчСчет
РасчСчет=${accountNumber}
ДатаНачала=${d}
ДатаКонца=${d}
НачальныйОстаток=1000.00
КонецРасчСчет
СекцияДокумент=Платежное поручение
Номер=101
Дата=${d}
Сумма=100.00
ПлательщикСчет=${accountNumber}
ПлательщикИНН=2311366523
Плательщик=ТОРИ БРЭНДС ООО
ПолучательСчет=40817810099910004312
ПолучательИНН=7701234567
Получатель=ООО Ромашка
НазначениеПлатежа=Оплата по счету 5
КонецДокумента
СекцияДокумент=Платежное поручение
Номер=102
Дата=${d}
Сумма=50.00
ПлательщикСчет=40817810000000009999
ПлательщикИНН=7708888888
Плательщик=ООО Клиент
ПолучательСчет=${accountNumber}
ПолучательИНН=2311366523
Получатель=ТОРИ БРЭНДС ООО
НазначениеПлатежа=Поступление
КонецДокумента
КонецФайла`
}

export const fixtureStatementSource: StatementSource = {
  async getStatement(account, day): Promise<StatementFetch> {
    // Демо-выписка есть только для сбербанковского счёта фикстуры.
    if (account.accountNumber !== "40702810900000001111") {
      return { status: "absent" }
    }
    const raw = sampleFor(account.accountNumber, day)
    const statement = parse1CStatement(raw, account.accountNumber)
    const sha256 = createHash("sha256").update(raw, "utf8").digest("hex")
    return {
      status: "ok",
      statement,
      fileName: `fixture-${account.accountNumber}-${day}.txt`,
      sha256,
    }
  },
}
```

- [ ] **Step 3: Создать файловый источник `manual-file-source.ts`**

```ts
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { parse1CStatement } from "@/lib/domain/reconciliation/parse-1c-statement"
import type { StatementFetch, StatementSource } from "./statement-source"

// Папка с выписками: RECON_STATEMENTS_DIR/<НомерСчёта>/<YYYY-MM-DD>.txt
// Файлы кладёт собственник из независимого read-only доступа — казначей
// сюда не пишет. Это организационная гарантия независимости эталона.
function baseDir(): string {
  const dir = process.env.RECON_STATEMENTS_DIR
  if (!dir) throw new Error("Не задан RECON_STATEMENTS_DIR")
  return dir
}

// Декодирование: win1251 (типично для kl_to_1c) или utf8. Определяем по
// строке "Кодировка=" в файле; читаем как latin1-байты для повторного декода.
function decode(buf: Buffer): string {
  const head = buf.toString("latin1", 0, 300)
  const isUtf8 = /Кодировка\s*=\s*UTF-?8/i.test(buf.toString("utf8", 0, 300))
  if (isUtf8 || /^﻿/.test(buf.toString("utf8", 0, 3))) {
    return buf.toString("utf8")
  }
  // Windows-1251 → Unicode через TextDecoder.
  void head
  return new TextDecoder("windows-1251").decode(buf)
}

export const manualFileStatementSource: StatementSource = {
  async getStatement(account, day): Promise<StatementFetch> {
    const dir = path.join(baseDir(), account.accountNumber)
    let file: string | null = null
    try {
      const names = await readdir(dir)
      // Файл дня: <day>.txt; допускаем любой .txt, начинающийся с даты.
      file = names.find((n) => n === `${day}.txt` || n.startsWith(day)) ?? null
    } catch {
      return { status: "absent" } // папки счёта нет — выписки ещё не клали
    }
    if (!file) return { status: "absent" }

    try {
      const buf = await readFile(path.join(dir, file))
      const raw = decode(buf)
      const statement = parse1CStatement(raw, account.accountNumber)
      const sha256 = createHash("sha256").update(buf).digest("hex")
      return { status: "ok", statement, fileName: file, sha256 }
    } catch (e) {
      // Файл есть, но не разобрался — это сбой источника, НЕ «нет данных».
      return {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      }
    }
  },
}
```

- [ ] **Step 4: Проверить типизацию**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/bank-statement
git commit -m "feat: слой источника выписки (фикстура + чтение из папки)"
```

---

## Task 10: Оркестрация прогона сверки

**Files:**
- Create: `lib/sync/run-reconciliation.ts`

- [ ] **Step 1: Создать оркестратор**

```ts
// Один прогон сверки: по каждому активному счёту собрать выписку, движения 1С,
// остаток и заявки → прогнать доменное ядро → записать результат append-only.
import { prisma } from "@/lib/db"
import { reconcileAccount } from "@/lib/domain/reconciliation/reconcile"
import type {
  AccountReconInput,
  RequestForCheck,
} from "@/lib/domain/reconciliation/types"
import { startOfMoscowDay } from "@/lib/domain/dates"
import type { OneCGateway } from "@/lib/integrations/one-c-odata"
import { getStatementSource } from "@/lib/integrations/bank-statement/statement-source"
import type {
  ReconAccountStatus,
  ReconTrigger,
} from "@prisma/client"

export type ReconciliationRunResult = {
  runId: string
  status: "matched" | "discrepancy" | "no_data"
  accounts: number
  discrepancies: number
}

// day — строка YYYY-MM-DD; по умолчанию сегодня (МСК).
function moscowToday(): string {
  const now = new Date()
  // Москва = UTC+3; формат YYYY-MM-DD.
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  return msk.toISOString().slice(0, 10)
}

export async function runReconciliation(
  gateway: OneCGateway,
  trigger: ReconTrigger,
  day: string = moscowToday()
): Promise<ReconciliationRunResult> {
  const source = getStatementSource()

  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    select: {
      externalUid: true,
      accountNumber: true,
      bankName: true,
      currency: true,
    },
  })

  // Прогон охватывает как минимум запрошенный день; итоговый период
  // уточняется по фактической выписке каждого счёта (см. ниже).
  const dayStart = startOfMoscowDay(new Date(`${day}T12:00:00.000Z`))

  const run = await prisma.reconciliationRun.create({
    data: { periodStart: dayStart, periodEnd: dayStart, status: "no_data", trigger },
  })

  let anyDiscrepancy = false
  let anyData = false
  let discrepancyCount = 0

  for (const acc of accounts) {
    // 1. Выписка (эталон). Её период задаёт окно сверки.
    const fetch = await source.getStatement(
      { accountNumber: acc.accountNumber, accountUid: acc.externalUid },
      day
    )
    const from = fetch.status === "ok" ? fetch.statement.periodStart : day
    const to = fetch.status === "ok" ? fetch.statement.periodEnd : day
    const winStart = startOfMoscowDay(new Date(`${from}T12:00:00.000Z`))
    const winEnd = startOfMoscowDay(new Date(`${to}T12:00:00.000Z`))

    // 2. Движения и остаток из 1С (только если счёт связан с 1С).
    let movements = null as AccountReconInput["movements"]
    let onecClosingMinor: bigint | null = null
    if (acc.externalUid) {
      try {
        movements = await gateway.fetchAccountMovements(
          acc.externalUid,
          from,
          to
        )
      } catch {
        movements = null
      }
      const bal = await prisma.accountBalance.findUnique({
        where: { accountUid: acc.externalUid },
        select: { balanceMinor: true },
      })
      onecClosingMinor = bal?.balanceMinor ?? null
    }

    // 3. Заявки со сроком оплаты в окне сверки.
    const reqRows = await prisma.paymentRequest.findMany({
      where: {
        debitAccountUid: acc.externalUid ?? undefined,
        payDate: { gte: winStart, lte: winEnd },
        isDeletedIn1c: false,
      },
      select: {
        uid: true,
        amountMinor: true,
        partnerName: true,
        partnerInn: true,
        payDate: true,
        approvalStatus: true,
        executionStatus: true,
      },
    })
    const isoMoscow = (d: Date) =>
      new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const requests: RequestForCheck[] = reqRows.map((r) => ({
      uid: r.uid,
      amountMinor: r.amountMinor,
      partnerName: r.partnerName ?? "",
      partnerInn: r.partnerInn,
      payDate: isoMoscow(r.payDate),
      approved: r.approvalStatus === "approved",
      executedIn1c: r.executionStatus === "executed",
    }))

    // 4. Доменная сверка.
    const input: AccountReconInput = {
      currency: acc.currency,
      sourceError: fetch.status === "error",
      statement: fetch.status === "ok" ? fetch.statement : null,
      onecClosingMinor,
      movements,
      requests,
    }
    const result = reconcileAccount(input)

    if (result.status === "discrepancy") anyDiscrepancy = true
    if (result.status !== "no_data") anyData = true

    // 5. Запись итога по счёту + расхождений.
    const accountResult = await prisma.reconciliationAccountResult.create({
      data: {
        runId: run.id,
        accountUid: acc.externalUid,
        bankName: acc.bankName,
        accountNumber: acc.accountNumber,
        currency: acc.currency,
        stmtOpeningMinor: result.stmtOpeningMinor,
        stmtClosingMinor: result.stmtClosingMinor,
        stmtDebitMinor: result.stmtDebitMinor,
        stmtCreditMinor: result.stmtCreditMinor,
        onecClosingMinor: result.onecClosingMinor,
        onecDebitMinor: result.onecDebitMinor,
        onecCreditMinor: result.onecCreditMinor,
        status: result.status as ReconAccountStatus,
        sourceType: "manual_file",
        sourceStatus: fetch.status === "error" ? "error" : "ok",
        sourceError: fetch.status === "error" ? fetch.error : null,
        statementFileName: fetch.status === "ok" ? fetch.fileName : null,
        statementSha256: fetch.status === "ok" ? fetch.sha256 : null,
      },
      select: { id: true },
    })

    for (const d of result.discrepancies) {
      discrepancyCount++
      await prisma.reconciliationDiscrepancy.create({
        data: {
          runId: run.id,
          accountResultId: accountResult.id,
          requestUid: d.requestUid,
          type: d.type,
          expected: d.expected,
          actual: d.actual,
          amountMinor: d.amountMinor,
          detail: d.detail,
        },
      })
    }
  }

  const status = anyDiscrepancy
    ? "discrepancy"
    : anyData
      ? "matched"
      : "no_data"

  await prisma.reconciliationRun.update({
    where: { id: run.id },
    data: { status },
  })

  return {
    runId: run.id,
    status,
    accounts: accounts.length,
    discrepancies: discrepancyCount,
  }
}
```

- [ ] **Step 2: Проверить типизацию**

Run: `npm run typecheck`
Expected: без ошибок. Если `startOfMoscowDay` имеет другую сигнатуру — свериться с `lib/domain/dates.ts` и подставить корректный вызов (нужен `Date` начала московских суток для `day`).

- [ ] **Step 3: Commit**

```bash
git add lib/sync/run-reconciliation.ts
git commit -m "feat: оркестрация прогона сверки счётов"
```

---

## Task 11: Джоб для cron

**Files:**
- Create: `app/api/jobs/reconcile/route.ts`

- [ ] **Step 1: Создать роут по образцу sync-reference**

```ts
// Запуск сверки планировщиком (cron на сервере, рабочий день 13:00 МСК):
//   curl -X POST -H "x-sync-secret: $RECONCILE_SECRET" <host>/api/jobs/reconcile
import { NextRequest, NextResponse } from "next/server"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReconciliation } from "@/lib/sync/run-reconciliation"

export async function POST(req: NextRequest) {
  const secret = process.env.RECONCILE_SECRET
  if (!secret || req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runReconciliation(getOneCGateway(), "cron")
  return NextResponse.json(result, { status: 200 })
}
```

- [ ] **Step 2: Задокументировать переменные окружения**

Добавить в `.env.example` (если файла нет — создать раздел в README интеграций):

```
# Сверка счётов
RECONCILE_SECRET="<секрет для cron>"
RECON_STATEMENT_MODE="fixture"       # fixture | manual_file
RECON_STATEMENTS_DIR=""              # папка выписок для manual_file
```

- [ ] **Step 3: Проверить сборку роутов**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add app/api/jobs/reconcile/route.ts .env.example
git commit -m "feat: джоб сверки для cron (13:00 МСК)"
```

---

## Task 12: Server actions — ручной прогон и разбор расхождения

**Files:**
- Create: `app/reconciliation/actions.ts`

- [ ] **Step 1: Создать server actions**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { requireAction } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReconciliation } from "@/lib/sync/run-reconciliation"
import type { ReconResolution } from "@prisma/client"

export type FormState = { error: string | null }

// Ручной запуск прогона сверки за указанный день (или сегодня).
export async function runManualReconciliation(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return { error: auth.error }

  const day = String(formData.get("day") ?? "").trim()
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(day)

  try {
    await runReconciliation(
      getOneCGateway(),
      "manual",
      isDay ? day : undefined
    )
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось выполнить сверку" }
  }

  revalidatePath("/reconciliation")
  return { error: null }
}

// Перевод расхождения по статусу разбора: new → reviewed → accepted.
export async function resolveDiscrepancy(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return { error: auth.error }

  const id = String(formData.get("id") ?? "").trim()
  const status = String(formData.get("status") ?? "").trim()
  const note = String(formData.get("note") ?? "").trim()
  if (!id) return { error: "Не указано расхождение" }
  if (status !== "reviewed" && status !== "accepted" && status !== "new") {
    return { error: "Недопустимый статус" }
  }

  const disc = await prisma.reconciliationDiscrepancy.findUnique({
    where: { id },
    select: { runId: true },
  })
  if (!disc) return { error: "Расхождение не найдено" }

  await prisma.reconciliationDiscrepancy.update({
    where: { id },
    data: {
      resolutionStatus: status as ReconResolution,
      note: note || null,
      resolvedById: auth.user.id,
      resolvedAt: new Date(),
    },
  })

  revalidatePath(`/reconciliation/${disc.runId}`)
  return { error: null }
}
```

- [ ] **Step 2: Проверить роль `manage_reference` и сигнатуру `requireAction`**

Свериться с `lib/auth/session.ts`: `requireAction` возвращает `{ user, error }` (как в `app/transactions/actions.ts`). Если имя права отличается — подставить существующее право на запись справочных данных.

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add app/reconciliation/actions.ts
git commit -m "feat: server actions сверки — ручной прогон и разбор расхождений"
```

---

## Task 13: Экран истории — список прогонов

**Files:**
- Create: `app/reconciliation/page.tsx`

- [ ] **Step 1: Создать страницу списка**

```tsx
import Link from "next/link"
import { requirePageUser } from "@/lib/auth/session"
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
import { formatDate } from "@/lib/domain/dates"

export const dynamic = "force-dynamic"

const RUN_LABEL: Record<string, string> = {
  matched: "Сошлось",
  discrepancy: "Есть расхождения",
  no_data: "Нет данных",
}

export default async function Page() {
  await requirePageUser()

  const runs = await prisma.reconciliationRun.findMany({
    orderBy: { runAt: "desc" },
    take: 60,
    include: {
      _count: { select: { discrepancies: true, accountResults: true } },
    },
  })

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Сверка счётов</h1>
      <p className="text-sm text-muted-foreground">
        Ежедневная сверка независимой выписки с движениями 1С и заявками.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата прогона</TableHead>
            <TableHead>Период</TableHead>
            <TableHead>Счетов</TableHead>
            <TableHead>Расхождений</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link
                  href={`/reconciliation/${r.id}`}
                  className="text-primary underline underline-offset-4"
                >
                  {formatDate(r.runAt)}
                </Link>
              </TableCell>
              <TableCell>{formatDate(r.periodStart)}</TableCell>
              <TableCell>{r._count.accountResults}</TableCell>
              <TableCell>{r._count.discrepancies}</TableCell>
              <TableCell>
                <Badge
                  variant={r.status === "discrepancy" ? "destructive" : "outline"}
                >
                  {RUN_LABEL[r.status] ?? r.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Прогонов ещё не было.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </main>
  )
}
```

- [ ] **Step 2: Проверить `formatDate` и `requirePageUser`**

Свериться с `lib/domain/dates.ts` (есть `formatDate`) и `lib/auth/session.ts` (`requirePageUser`). Оба используются в существующих страницах.

Run: `npm run typecheck && npm run lint`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add app/reconciliation/page.tsx
git commit -m "feat: экран истории сверок (список прогонов)"
```

---

## Task 14: Экран деталей прогона + разбор расхождений

**Files:**
- Create: `app/reconciliation/[id]/page.tsx`
- Create: `app/reconciliation/[id]/resolve-form.tsx`

- [ ] **Step 1: Создать клиентскую форму разбора**

```tsx
"use client"

import { useActionState } from "react"
import { resolveDiscrepancy, type FormState } from "../actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const initial: FormState = { error: null }

export function ResolveForm({
  id,
  current,
}: {
  id: string
  current: string
}) {
  const [state, action, pending] = useActionState(resolveDiscrepancy, initial)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Select name="status" defaultValue={current}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="new">Новое</SelectItem>
          <SelectItem value="reviewed">Проверено</SelectItem>
          <SelectItem value="accepted">Принято</SelectItem>
        </SelectContent>
      </Select>
      <Input
        name="note"
        placeholder="Примечание"
        className="w-64"
      />
      <Button type="submit" disabled={pending}>
        Сохранить
      </Button>
      {state.error && (
        <span className="text-sm text-destructive">{state.error}</span>
      )}
    </form>
  )
}
```

- [ ] **Step 2: Создать страницу деталей**

```tsx
import { notFound } from "next/navigation"
import { requirePageUser } from "@/lib/auth/session"
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
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { ResolveForm } from "./resolve-form"

export const dynamic = "force-dynamic"

const ACC_STATUS: Record<string, string> = {
  matched: "Сошлось",
  discrepancy: "Расхождения",
  no_data: "Нет данных",
  source_error: "Выписка не получена",
}

const DISC_TYPE: Record<string, string> = {
  closing_balance: "Конечный остаток",
  debit_turnover: "Оборот-дебет",
  credit_turnover: "Оборот-кредит",
  balance_identity: "Тождество остатков",
  recipient_mismatch: "Получатель",
  request_not_executed: "Заявка не исполнена",
  payment_without_request: "Списание без заявки",
  amount_mismatch: "Сумма",
}

function money(v: bigint | null, currency: string): string {
  return v === null ? "—" : formatMoneyBig(v, currency)
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePageUser()
  const { id } = await params

  const run = await prisma.reconciliationRun.findUnique({
    where: { id },
    include: {
      accountResults: { orderBy: { accountNumber: "asc" } },
      discrepancies: { orderBy: { type: "asc" } },
    },
  })
  if (!run) notFound()

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Прогон сверки · {formatDate(run.runAt)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Период: {formatDate(run.periodStart)}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Счета</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Счёт</TableHead>
              <TableHead>Банк</TableHead>
              <TableHead className="text-right">Остаток (выписка)</TableHead>
              <TableHead className="text-right">Остаток (1С)</TableHead>
              <TableHead className="text-right">Дебет в/1С</TableHead>
              <TableHead className="text-right">Кредит в/1С</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Файл</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.accountResults.map((a) => {
              const bad = (x: bigint | null, y: bigint | null) =>
                x !== null && y !== null && x !== y
                  ? "text-destructive"
                  : ""
              return (
                <TableRow key={a.id}>
                  <TableCell>{a.accountNumber}</TableCell>
                  <TableCell>{a.bankName ?? "—"}</TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtClosingMinor, a.onecClosingMinor)}`}
                  >
                    {money(a.stmtClosingMinor, a.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtClosingMinor, a.onecClosingMinor)}`}
                  >
                    {money(a.onecClosingMinor, a.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtDebitMinor, a.onecDebitMinor)}`}
                  >
                    {money(a.stmtDebitMinor, a.currency)} /{" "}
                    {money(a.onecDebitMinor, a.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtCreditMinor, a.onecCreditMinor)}`}
                  >
                    {money(a.stmtCreditMinor, a.currency)} /{" "}
                    {money(a.onecCreditMinor, a.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        a.status === "matched" ? "outline" : "destructive"
                      }
                    >
                      {ACC_STATUS[a.status] ?? a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.statementFileName ?? "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Расхождения ({run.discrepancies.length})
        </h2>
        {run.discrepancies.length === 0 ? (
          <p className="text-muted-foreground">Расхождений нет.</p>
        ) : (
          <div className="space-y-4">
            {run.discrepancies.map((d) => (
              <div key={d.id} className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">
                    {DISC_TYPE[d.type] ?? d.type}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {d.detail}
                  </span>
                  {d.requestUid && (
                    <span className="text-xs text-muted-foreground">
                      заявка: {d.requestUid}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm">
                  Ожидалось: <b>{d.expected}</b> · Факт: <b>{d.actual}</b>
                </p>
                <div className="mt-3">
                  <ResolveForm id={d.id} current={d.resolutionStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Проверить компоненты shadcn (select, input, badge, button)**

Все используемые примитивы уже установлены (используются в проекте). Если `input` отсутствует — добавить: `npx shadcn@latest add input`.

Run: `npm run typecheck && npm run lint`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add app/reconciliation/[id]
git commit -m "feat: экран деталей прогона сверки + разбор расхождений"
```

---

## Task 15: Бейджи «Проверено» на остатках + пункт меню

**Files:**
- Create: `components/reconciliation/verified-badge.tsx`
- Modify: `app/reference/bank-accounts/page.tsx`
- Modify: `app/page.tsx`
- Modify: `components/app-sidebar.tsx` (или файл навигации)

- [ ] **Step 1: Создать компонент бейджа**

```tsx
import { Badge } from "@/components/ui/badge"
import { CircleCheck, CircleAlert, CircleHelp, CircleX } from "lucide-react"

export type VerifiedState =
  | "matched"
  | "discrepancy"
  | "source_error"
  | "no_data"

export function VerifiedBadge({
  state,
  date,
  count,
}: {
  state: VerifiedState
  date?: string
  count?: number
}) {
  if (state === "matched") {
    return (
      <Badge variant="outline" className="gap-1">
        <CircleCheck className="size-3" />
        Проверено{date ? ` ${date}` : ""}
      </Badge>
    )
  }
  if (state === "discrepancy") {
    return (
      <Badge variant="destructive" className="gap-1">
        <CircleAlert className="size-3" />
        Расхождения{count ? `: ${count}` : ""}
      </Badge>
    )
  }
  if (state === "source_error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <CircleX className="size-3" />
        Выписка не получена
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <CircleHelp className="size-3" />
      Нет сверки
    </Badge>
  )
}
```

- [ ] **Step 2: Хелпер выборки последнего результата по счёту**

Добавить в новый файл `lib/reconciliation-status.ts`:

```ts
import { prisma } from "@/lib/db"
import type { VerifiedState } from "@/components/reconciliation/verified-badge"

// Последний результат сверки по номеру счёта: состояние + дата + число расхождений.
export async function latestAccountStatuses(): Promise<
  Map<string, { state: VerifiedState; runAt: Date; discrepancies: number }>
> {
  const rows = await prisma.reconciliationAccountResult.findMany({
    orderBy: { run: { runAt: "desc" } },
    select: {
      accountNumber: true,
      status: true,
      run: { select: { runAt: true } },
      _count: { select: { discrepancies: true } },
    },
  })
  const map = new Map<
    string,
    { state: VerifiedState; runAt: Date; discrepancies: number }
  >()
  for (const r of rows) {
    // findMany уже отсортирован по убыванию — берём первое (самое свежее).
    if (!map.has(r.accountNumber)) {
      map.set(r.accountNumber, {
        state: r.status as VerifiedState,
        runAt: r.run.runAt,
        discrepancies: r._count.discrepancies,
      })
    }
  }
  return map
}
```

- [ ] **Step 3: Бейдж в справочнике счётов**

В `app/reference/bank-accounts/page.tsx` импортировать и добавить колонку. В начало файла:

```tsx
import { VerifiedBadge } from "@/components/reconciliation/verified-badge"
import { latestAccountStatuses } from "@/lib/reconciliation-status"
import { formatDate } from "@/lib/domain/dates"
```

После загрузки `accounts` добавить:

```tsx
  const statuses = await latestAccountStatuses()
```

В `TableHeader` добавить колонку (после «Организация»):

```tsx
            <TableHead>Сверка</TableHead>
```

В теле строки после ячейки организации добавить:

```tsx
              <TableCell>
                {(() => {
                  const s = statuses.get(a.accountNumber)
                  return (
                    <VerifiedBadge
                      state={s?.state ?? "no_data"}
                      date={s ? formatDate(s.runAt) : undefined}
                      count={s?.discrepancies}
                    />
                  )
                })()}
              </TableCell>
```

- [ ] **Step 4: Бейдж на карточке «Остатки по счетам» дашборда**

В `app/page.tsx` импортировать хелпер и компонент (рядом с прочими импортами):

```tsx
import { VerifiedBadge } from "@/components/reconciliation/verified-badge"
import { latestAccountStatuses } from "@/lib/reconciliation-status"
```

Внутри `Promise.all([...])` добавить загрузку (или отдельным `await` после):

```tsx
  const reconStatuses = await latestAccountStatuses()
  const allMatched =
    reconStatuses.size > 0 &&
    [...reconStatuses.values()].every((s) => s.state === "matched")
```

В карточке «Остатки по счетам» (около `CardTitle`) добавить общий бейдж:

```tsx
          <VerifiedBadge state={allMatched ? "matched" : "discrepancy"} />
```

(показывает «Проверено», только если все счета сошлись; иначе «Расхождения»).

- [ ] **Step 5: Пункт меню «Сверка»**

Иконки в меню мапятся по имени (`components/nav-main.tsx`), а не JSX. Сначала
зарегистрировать иконку. В `components/nav-main.tsx`:

В импорт из `lucide-react` добавить `Scale`:

```tsx
  Gauge,
  LayoutDashboard,
  ListChecks,
  Scale,
  Send,
```

В объект `ICONS` добавить ключ:

```tsx
  reconciliation: Scale,
```

Затем в `components/app-sidebar.tsx` в группу «Операции» массива `NAV_CONFIG`
добавить пункт после «Отправка платёжек»:

```tsx
      { title: "Сверка счётов", href: "/reconciliation", icon: "reconciliation" },
```

(без `action` — пункт виден всем ролям, как «Транзакции»).

- [ ] **Step 6: Проверки в браузере**

Run: `npm run typecheck && npm run lint`
Expected: без ошибок.

Затем preview: открыть дашборд и `/reference/bank-accounts`, убедиться, что бейджи рендерятся в обеих темах, консоль чистая. Пункт «Сверка» ведёт на `/reconciliation`.

- [ ] **Step 7: Commit**

```bash
git add components/reconciliation/verified-badge.tsx lib/reconciliation-status.ts app/reference/bank-accounts/page.tsx app/page.tsx components/app-sidebar.tsx
git commit -m "feat: бейджи Проверено на остатках + пункт меню Сверка"
```

---

## Task 16: Seed + e2e-смоук

**Files:**
- Modify: `prisma/seed.ts`
- Create: `tests/e2e/reconciliation.spec.ts`

- [ ] **Step 1: Убедиться, что фикстура даёт связную сверку**

Демо-данные уже согласованы: `fixtureStatementSource` (счёт `40702810900000001111`) и `MOVEMENTS["fx-acc-sber"]` дают одинаковые обороты (дебет 100, кредит 50). Для «зелёного» прогона в seed счёт `fx-acc-sber` должен иметь `AccountBalance.balanceMinor = 95000` (opening 1000 + 50 − 100 = 950 ₽).

Проверить/добавить в `prisma/seed.ts` запись `accountBalance` для `accountUid: "fx-acc-sber"` c `balanceMinor: 95000n`, `currency: "RUB"`. Если seed уже создаёт остатки через синк срезов — согласовать значение.

- [ ] **Step 2: Написать e2e-смоук**

```ts
import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

// Смоук главного сценария: ручной прогон сверки → прогон виден в истории,
// сошедшийся счёт помечен, экран деталей открывается.
test("сверка: ручной прогон и просмотр результата", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/reconciliation")
  await expect(page.getByRole("heading", { name: "Сверка счётов" })).toBeVisible()

  // Запуск прогона через API-джоб не годится (нужен секрет); используем
  // ручной прогон, если на экране есть кнопка. Иначе проверяем, что seed
  // создал прогон и он открывается.
  const firstRun = page.getByRole("link").filter({ hasText: /\d{2}\.\d{2}\.\d{4}/ }).first()
  await expect(firstRun).toBeVisible()
  await firstRun.click()

  await expect(
    page.getByRole("heading", { name: /Прогон сверки/ })
  ).toBeVisible()
  await expect(page.getByText("Счета")).toBeVisible()
})

test("сверка: бейдж на справочнике счётов", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/reference/bank-accounts")
  await expect(page.getByRole("heading", { name: "Банковские счета" })).toBeVisible()
  await expect(page.getByText("Сверка")).toBeVisible()
})
```

> Примечание: e2e не должны зависеть от seed-данных для создаваемых сущностей. Если на экране списка нет прогонов (seed их не создаёт), добавить в `prisma/seed.ts` один демонстрационный `reconciliationRun` c одним `reconciliationAccountResult` (status `matched`) — либо добавить на страницу `/reconciliation` кнопку «Запустить сверку» (форма с `runManualReconciliation`) и в тесте нажимать её, создавая данные внутри теста. Предпочтителен второй вариант (кнопка) — тогда тест самодостаточен.

- [ ] **Step 3: Добавить кнопку ручного прогона на страницу списка (для самодостаточного e2e)**

Создать `app/reconciliation/run-button.tsx`:

```tsx
"use client"

import { useActionState } from "react"
import { runManualReconciliation, type FormState } from "./actions"
import { Button } from "@/components/ui/button"

const initial: FormState = { error: null }

export function RunButton() {
  const [state, action, pending] = useActionState(
    runManualReconciliation,
    initial
  )
  return (
    <form action={action}>
      <Button type="submit" disabled={pending}>
        {pending ? "Сверяю…" : "Запустить сверку"}
      </Button>
      {state.error && (
        <span className="ml-2 text-sm text-destructive">{state.error}</span>
      )}
    </form>
  )
}
```

Вставить `<RunButton />` в `app/reconciliation/page.tsx` под заголовком (импорт вверху). Обновить e2e: в первом тесте нажимать кнопку «Запустить сверку», затем проверять появление прогона.

- [ ] **Step 4: Прогнать e2e**

Run: `npm run test:e2e -- reconciliation` (или команда e2e проекта из `package.json`)
Expected: оба теста PASS.

- [ ] **Step 5: Полные проверки перед коммитом**

Run: `npm run format && npm run lint && npm run typecheck && npm run test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts tests/e2e/reconciliation.spec.ts app/reconciliation/run-button.tsx app/reconciliation/page.tsx
git commit -m "feat: seed и e2e-смоук сверки счётов"
```

---

## Готово к доставке

После Task 16 контур сверки на источнике `manual-file` полностью рабочий:
прогон (ручной/cron) → сверка → история → бейджи → разбор расхождений. Доставка
в песочницу — через `/ship` (см. CLAUDE.md).

## Что НЕ входит (этап 2, отдельный план)

- Коннекторы `bank-api` к Сбер/ВТБ/Альфа/Азия-Инвест/WB — по одному, по мере
  read-only доступов и одобрения библиотек разработчиком (Минас).
- Автозабор выписки из банка вместо чтения из папки.
- Метка результата сверки на экране заявок (можно добавить срезом после этапа 1,
  когда накопится история по `requestUid`).
