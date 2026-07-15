# План 6: Светофор авто-проверок и контекст карточки заявки — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматическая оценка заявки перед согласованием (вердикт 🟢/🟡/🔴 из 5 проверок), контекстные секции в карточке (ликвидность, фонд, контрагент, заказ, вложения), сводка в реестре (метрики, остатки, фонды) и страница настроек порогов — целиком на fixture-срезах.

**Architecture:** Данные светофора — «срезы» в PostgreSQL (остатки, курсы, фонды, контрагенты, договоры, заказы, вложения), которые наполняет существующий синк через per-slice гейтвеи (`lib/integrations/slices.ts`; в этом плане — только fixture-реализация, боевые 1С/DWH-адаптеры — план DWH). Вердикт не хранится: чистая функция `lib/domain/verdict.ts` вычисляет его при рендере из срезов и настроек из БД. UI читает только свою PostgreSQL (принцип спеки заявок).

**Tech Stack:** Next.js App Router, TypeScript, Prisma + PostgreSQL, Tailwind + shadcn/ui, Vitest, Playwright.

**Спека:** `docs/superpowers/specs/2026-07-14-verdict-traffic-light-design.md`.

**Зависимость:** план 03 (`2026-07-14-03-payment-requests-core.md`) должен быть реализован полностью — этот план модифицирует его файлы (`app/requests/`, `lib/sync/run-sync.ts`, `lib/integrations/dwh*.ts`).

**Сознательно вне этого плана:**
- Боевые адаптеры срезов (методы API 1С `get/balance`/`get/fund`/`get/currencyRate` и вьюхи DWH) — в план DWH: схемы ответов ещё не подтверждены (предпосылки §11 спеки). Фабрика источников и env-переменные готовятся здесь.
- Проверки «финплан» и «заранее согласовано» — в UI всегда серые «нет данных» (источник — финмодель, её нет в DWH).
- Скачивание файлов вложений, Excel-экспорт, «запросить уточнение» — бэклог.

**Правила репозитория, которые действуют в каждой задаче** (из `CLAUDE.md`):
- Перед каждым коммитом: `npm run format && npm run lint && npm run typecheck && npm run test`.
- Мутации — только server actions `(prevState: FormState, formData: FormData) => Promise<FormState>`; ожидаемые ошибки возвращаются как `{ error }`; после успеха `revalidatePath`.
- `lib/domain/` — без React/Prisma/I/O, unit-тесты рядом. Unit-тесты компонентов запрещены — сценарии покрывает e2e.
- Деньги — BigInt-копейки; формат — `formatMoneyBig`.
- Интерфейс на русском, код на английском, conventional commits с русским описанием.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma` (modify) | Модели срезов (`AccountBalance`, `CurrencyRate`, `FundSnapshot`, `PartnerStats`, `PartnerContract`, `SupplierOrder`, `AttachmentMeta`), настройки (`VerdictThreshold`, `VerdictCheckSetting`), + поля `PaymentRequest`, + `SyncRun.slices` |
| `lib/domain/verdict.ts` (create) | Чистая логика светофора: типы, 5 проверок, сборка вердикта, деградация «нет данных» |
| `lib/domain/verdict.test.ts` (create) | Unit-тесты всех проверок и сборки |
| `lib/integrations/dwh.ts` (modify) | + поля заявки: `debitAccountUid`, `contractUid`, `orderUid`, `initiatorHead` |
| `lib/integrations/dwh-fixture.ts` (modify) | + новые поля в fixture-заявках, + красная заявка `fx-req-7` |
| `lib/integrations/slices.ts` (create) | Типы строк срезов, интерфейс `SliceFetcher`, фабрика `getSliceFetchers()` (env `SLICE_*_SOURCE`) |
| `lib/integrations/slices-fixture.ts` (create) | Fixture-данные всех 7 срезов, согласованные с `dwh-fixture.ts` |
| `lib/sync/sync-slices.ts` (create) | Upsert срезов; каждый срез независим (ошибка одного не валит синк) |
| `lib/sync/run-sync.ts` (modify) | Вызов `syncSlices`, отчёт в `SyncRun.slices` |
| `lib/verdicts.ts` (create) | Read-path: настройки+срезы из БД → `computeVerdicts` (реестр) и `loadRequestContext` (карточка) |
| `app/requests/status.ts` (modify) | + ярлыки/классы вердиктов |
| `app/requests/page.tsx` (modify) | + вердикты, метрики, панель остатков/фондов, фильтры «контрагент»/«красные флаги» |
| `app/requests/actions.ts` (modify) | Guard: массово — только 🟢 |
| `app/requests/requests-table.tsx` (modify) | + колонка вердикта, панель остатков с проекцией «после отмеченных» |
| `app/requests/[uid]/page.tsx` (modify) | Двухколоночная карточка: секции + панель авто-проверки |
| `app/requests/[uid]/context-sections.tsx` (create) | Секции «Ликвидность», «Фонд», «Контрагент», «Заказ/Основание», «Вложения», «Связанные заявки» |
| `app/requests/[uid]/verdict-panel.tsx` (create) | Панель вердикта с чек-листом проверок |
| `app/settings/verdict/page.tsx` (create) | Страница настроек порогов и флагов |
| `app/settings/verdict/settings-form.tsx` (create) | Клиентская форма настроек (`useActionState`) |
| `app/settings/verdict/actions.ts` (create) | `saveVerdictSettings` |
| `prisma/seed.ts` (modify) | Сид настроек светофора (срезы приезжают через `runSync`) |
| `.env.example` (modify) | `SLICE_*_SOURCE` |
| `tests/e2e/verdict.spec.ts` (create) | E2e светофора (serial: карточка, реестр, настройки) |
| `tests/e2e/requests.spec.ts` (modify) | Актуализация теста массового согласования |

---

### Task 1: Prisma — срезы, настройки, расширение заявки

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить поля в модель `PaymentRequest`** (после поля `comment`):

```prisma
  // Светофор (план 6): счёт списания, договор, заказ, руководитель отдела.
  debitAccountUid String?
  contractUid     String?
  orderUid        String?
  initiatorHead   String?
```

- [ ] **Step 2: Добавить поле в модель `SyncRun`** (после `error`):

```prisma
  slices Json? // отчёт синка срезов светофора: { balances: {upserted}|{error}, ... }
```

- [ ] **Step 3: Добавить модели срезов и настроек в конец `prisma/schema.prisma`**

```prisma
// --- Светофор авто-проверок (спека 2026-07-14-verdict-traffic-light-design) ---
// Срезы данных: наполняет синк через per-slice гейтвеи, читают экраны.
// Пустая таблица = срез недоступен → проверки по нему серые «нет данных».

model AccountBalance {
  id          String   @id @default(cuid())
  accountUid  String   @unique // UID банковского счёта 1С
  orgUid      String?
  orgName     String
  accountName String
  bankName    String?
  currency    String
  balanceMinor BigInt
  syncedAt    DateTime @db.Timestamptz(3)

  @@index([orgName])
  @@map("account_balances")
}

model CurrencyRate {
  id           String   @id @default(cuid())
  currencyCode String   @unique // ISO-код: "USD", "CNY"
  rate         Decimal  @db.Decimal(18, 6) // ₽ за единицу валюты
  rateDate     DateTime @db.Timestamptz(3)
  syncedAt     DateTime @db.Timestamptz(3)

  @@map("currency_rates")
}

model FundSnapshot {
  id            String   @id @default(cuid())
  fundUid       String   @unique
  name          String   @unique // заявка ссылается на фонд по имени (PaymentRequest.fund)
  planWeekMinor BigInt
  factWeekMinor BigInt
  balanceMinor  BigInt
  syncedAt      DateTime @db.Timestamptz(3)

  @@map("fund_snapshots")
}

model PartnerStats {
  id               String    @id @default(cuid())
  partnerUid       String    @unique
  firstOperationAt DateTime? @db.Timestamptz(3)
  lastPaymentAt    DateTime? @db.Timestamptz(3)
  paymentCount     Int
  totalPaidMinor   BigInt
  receivableMinor  BigInt // дебиторка (наш аванс контрагенту)
  payableMinor     BigInt // кредиторка (наш долг)
  recentPayments   Json // последние 3–5: [{ date, basis, amountMinor: string }]
  chatUrl          String?
  syncedAt         DateTime  @db.Timestamptz(3)

  @@map("partner_stats")
}

model PartnerContract {
  id          String   @id @default(cuid())
  contractUid String   @unique
  partnerUid  String
  number      String
  date        DateTime @db.Timestamptz(3)
  isActive    Boolean
  amountMinor BigInt
  paidMinor   BigInt
  debtMinor   BigInt // задолженность по договору (ТЗ §10.1)
  currency    String
  syncedAt    DateTime @db.Timestamptz(3)

  @@index([partnerUid])
  @@map("partner_contracts")
}

model SupplierOrder {
  id          String   @id @default(cuid())
  orderUid    String   @unique
  partnerUid  String
  contractUid String?
  number      String
  date        DateTime @db.Timestamptz(3)
  amountMinor BigInt
  paidMinor   BigInt // оплачено ранее по заказу
  currency    String
  syncedAt    DateTime @db.Timestamptz(3)

  @@index([partnerUid])
  @@map("supplier_orders")
}

model AttachmentMeta {
  id         String   @id @default(cuid())
  requestUid String
  fileName   String
  fileType   String? // «инвойс», «спецификация», «счёт»
  createdAt  DateTime @db.Timestamptz(3)
  syncedAt   DateTime @db.Timestamptz(3)

  @@unique([requestUid, fileName])
  @@map("attachment_meta")
}

// Настройки светофора: редактируются на app/settings/verdict.
// Отсутствующая строка = дефолт из lib/domain/verdict.ts.
model VerdictThreshold {
  id    String  @id @default(cuid())
  key   String  @unique // fundDeficitPercent | oldPartnerMonths | minOperationsForConstant
  value Decimal @db.Decimal(18, 6)

  @@map("verdict_thresholds")
}

model VerdictCheckSetting {
  id               String  @id @default(cuid())
  checkId          String  @unique // funds | fund_balance | finplan | document | order_contract | partner | preapproved
  includeInVerdict Boolean

  @@map("verdict_check_settings")
}
```

- [ ] **Step 4: Создать миграцию**

Run: `npx prisma migrate dev --name verdict_traffic_light`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add prisma/
git commit -m "feat: схема срезов светофора и настроек вердикта"
```

---

### Task 2: Домен — каркас вердикта и проверка основания

Чистая функция без I/O. Все проверки принимают один `VerdictInput`; `null`-срез
означает «данных нет» → статус `info`, из вердикта исключается.

**Files:**
- Create: `lib/domain/verdict.ts`
- Test: `lib/domain/verdict.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```typescript
// lib/domain/verdict.test.ts
import { describe, expect, it } from "vitest"
import {
  computeVerdict,
  DEFAULT_INCLUDE,
  DEFAULT_THRESHOLDS,
  type VerdictInput,
  type VerdictSettings,
} from "./verdict"

export const SETTINGS: VerdictSettings = {
  thresholds: { ...DEFAULT_THRESHOLDS },
  include: { ...DEFAULT_INCLUDE },
}

// Базовый вход: все срезы дают 🟢 по каждой проверке.
export function makeInput(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    request: {
      amountMinor: 100_000_00n, // 100 000 ₽
      currency: "RUB",
      debitAccountUid: "acc-1",
      orgName: "ТОРИ БРЭНДС ООО",
      comment: null,
    },
    now: new Date("2026-07-15T10:00:00+03:00"),
    balances: [
      {
        accountUid: "acc-1",
        orgName: "ТОРИ БРЭНДС ООО",
        accountName: "Сбербанк ₽",
        currency: "RUB",
        balanceMinor: 1_000_000_00n,
      },
    ],
    rates: { CNY: 11.5, USD: 76 },
    fund: {
      name: "Закупки товара",
      planWeekMinor: 500_000_00n,
      factWeekMinor: 100_000_00n,
      balanceMinor: 400_000_00n,
    },
    attachmentsCount: 2,
    partner: {
      paymentCount: 12,
      firstOperationAt: new Date("2024-05-01"),
      lastPaymentAt: new Date("2026-07-01"),
    },
    order: {
      number: "78",
      amountMinor: 400_000_00n,
      paidMinor: 0n,
      currency: "RUB",
    },
    contract: null,
    orderContractAvailable: true,
    ...overrides,
  }
}

function check(input: VerdictInput, id: string) {
  const verdict = computeVerdict(input, SETTINGS)
  const found = verdict.checks.find((c) => c.id === id)
  if (!found) throw new Error(`нет проверки ${id}`)
  return found
}

describe("computeVerdict: сборка", () => {
  it("все проверки 🟢 → вердикт ok «Можно согласовать»", () => {
    const v = computeVerdict(makeInput(), SETTINGS)
    expect(v.level).toBe("ok")
    expect(v.title).toBe("Можно согласовать")
    expect(v.checks).toHaveLength(7)
  })

  it("худшая обязательная проверка задаёт уровень (warn)", () => {
    const v = computeVerdict(makeInput({ attachmentsCount: 0, request: { ...makeInput().request, comment: "аванс" } }), SETTINGS)
    expect(v.level).toBe("warn")
    expect(v.title).toBe("Можно согласовать с оговоркой")
  })

  it("bad перекрывает warn", () => {
    const v = computeVerdict(
      makeInput({ attachmentsCount: 0, request: { ...makeInput().request, comment: null } }),
      SETTINGS
    )
    expect(v.level).toBe("bad")
    expect(v.title).toBe("Требует внимания")
  })

  it("проверка со статусом info не влияет на вердикт", () => {
    const v = computeVerdict(makeInput({ attachmentsCount: null }), SETTINGS)
    expect(check(makeInput({ attachmentsCount: null }), "document").status).toBe("info")
    expect(v.level).toBe("ok")
  })

  it("выключенная в настройках проверка не влияет на вердикт", () => {
    const settings: VerdictSettings = {
      ...SETTINGS,
      include: { ...SETTINGS.include, document: false },
    }
    const v = computeVerdict(makeInput({ attachmentsCount: 0 }), settings)
    expect(v.level).toBe("ok")
  })

  it("финплан и «заранее согласовано» — всегда info (нет источника)", () => {
    expect(check(makeInput(), "finplan").status).toBe("info")
    expect(check(makeInput(), "preapproved").status).toBe("info")
  })
})

describe("проверка «Документ-основание»", () => {
  it("есть вложения → ok", () => {
    expect(check(makeInput({ attachmentsCount: 2 }), "document").status).toBe("ok")
  })

  it("вложений нет, есть комментарий → warn", () => {
    const input = makeInput({ attachmentsCount: 0 })
    input.request.comment = "оплата по устной договорённости"
    expect(check(input, "document").status).toBe("warn")
  })

  it("ни вложений, ни комментария → bad", () => {
    expect(check(makeInput({ attachmentsCount: 0 }), "document").status).toBe("bad")
  })

  it("срез вложений недоступен → info", () => {
    expect(check(makeInput({ attachmentsCount: null }), "document").status).toBe("info")
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/verdict.test.ts`
Expected: FAIL — файл `./verdict` не существует.

- [ ] **Step 3: Реализация каркаса**

```typescript
// lib/domain/verdict.ts
// Светофор авто-проверок заявки. Чистая логика без I/O (порт
// fin/composables/useVerdict.ts с исправлениями по спеке).
// null-срез = «данных нет» → проверка info, из вердикта исключается.

export type VerdictLevel = "ok" | "warn" | "bad" | "block" // block зарезервирован, автоматически не выставляется
export type CheckStatus = "ok" | "warn" | "bad" | "info"
export type CheckId =
  | "funds"
  | "fund_balance"
  | "finplan"
  | "document"
  | "order_contract"
  | "partner"
  | "preapproved"

export type VerdictCheck = {
  id: CheckId
  label: string
  status: CheckStatus
  sublabel: string
}

export type Verdict = {
  level: VerdictLevel
  title: string
  description: string
  checks: VerdictCheck[]
}

export type VerdictThresholds = {
  fundDeficitPercent: number
  oldPartnerMonths: number
  minOperationsForConstant: number
}

export const DEFAULT_THRESHOLDS: VerdictThresholds = {
  fundDeficitPercent: 20,
  oldPartnerMonths: 12,
  minOperationsForConstant: 3,
}

export const DEFAULT_INCLUDE: Record<CheckId, boolean> = {
  funds: true,
  fund_balance: true,
  finplan: false, // нет источника (финмодель вне DWH)
  document: true,
  order_contract: true,
  partner: true,
  preapproved: false, // нет источника
}

export const CHECK_LABELS: Record<CheckId, string> = {
  funds: "Деньги на счёте",
  fund_balance: "Остаток фонда",
  finplan: "Соответствие финплану",
  document: "Документ-основание",
  order_contract: "Заказ / договор",
  partner: "История контрагента",
  preapproved: "Заранее согласовано",
}

export type VerdictSettings = {
  thresholds: VerdictThresholds
  include: Record<CheckId, boolean>
}

export type BalanceSlice = {
  accountUid: string
  orgName: string
  accountName: string
  currency: string
  balanceMinor: bigint
}

// ₽ за единицу валюты; RUB подразумевается = 1.
export type RatesSlice = Record<string, number>

export type FundSlice = {
  name: string
  planWeekMinor: bigint
  factWeekMinor: bigint
  balanceMinor: bigint
}

export type PartnerSlice = {
  paymentCount: number
  firstOperationAt: Date | null
  lastPaymentAt: Date | null
}

export type ContractSlice = {
  number: string
  date: Date
  isActive: boolean
  amountMinor: bigint
  paidMinor: bigint
  currency: string
}

export type OrderSlice = {
  number: string
  amountMinor: bigint
  paidMinor: bigint
  currency: string
}

export type VerdictInput = {
  request: {
    amountMinor: bigint
    currency: string
    debitAccountUid: string | null
    orgName: string
    comment: string | null
  }
  now: Date
  balances: BalanceSlice[] | null
  rates: RatesSlice | null
  fund: FundSlice | null
  attachmentsCount: number | null
  partner: PartnerSlice | null
  order: OrderSlice | null
  contract: ContractSlice | null
  // true = срезы заказов/договоров есть, но у заявки нет ни того ни другого → bad;
  // false = срезы недоступны → info.
  orderContractAvailable: boolean
}

// Сумма в рублях (не копейках); null — нет курса для валюты.
export function toRub(
  amountMinor: bigint,
  currency: string,
  rates: RatesSlice
): number | null {
  const rate = currency === "RUB" ? 1 : rates[currency]
  if (rate == null) return null
  return (Number(amountMinor) / 100) * rate
}

const RANK: Record<CheckStatus, number> = { ok: 0, warn: 1, bad: 2, info: 0 }

const TITLES: Record<Exclude<VerdictLevel, "block">, string> = {
  ok: "Можно согласовать",
  warn: "Можно согласовать с оговоркой",
  bad: "Требует внимания",
}

function noData(id: CheckId, sublabel = "нет данных"): VerdictCheck {
  return { id, label: CHECK_LABELS[id], status: "info", sublabel }
}

function checkDocument(input: VerdictInput): VerdictCheck {
  const { attachmentsCount, request } = input
  if (attachmentsCount === null) return noData("document")
  if (attachmentsCount > 0)
    return {
      id: "document",
      label: "Основание есть",
      status: "ok",
      sublabel: `${attachmentsCount} документ(ов)`,
    }
  if (request.comment && request.comment.trim().length > 0)
    return {
      id: "document",
      label: "Только текстовое описание",
      status: "warn",
      sublabel: "нет прикреплённых файлов",
    }
  return {
    id: "document",
    label: "Нет основания",
    status: "bad",
    sublabel: "необходимо прикрепить документы",
  }
}

function checkFinplan(): VerdictCheck {
  return noData("finplan", "нет данных — финмодель вне DWH")
}

function checkPreapproved(): VerdictCheck {
  return noData("preapproved", "нет данных — финмодель вне DWH")
}

function describeVerdict(
  level: Exclude<VerdictLevel, "block">,
  checks: VerdictCheck[]
): string {
  const bad = checks.filter((c) => c.status === "bad")
  const warn = checks.filter((c) => c.status === "warn")
  if (level === "ok") return "Все ключевые проверки пройдены"
  if (level === "warn")
    return warn.length === 1
      ? warn[0].sublabel || "Есть замечание"
      : `Есть замечания: ${warn.length}`
  return bad.length === 1
    ? bad[0].sublabel || "Есть критичная проблема"
    : `Критичные проблемы: ${bad.map((c) => c.label).join(", ")}`
}

export function computeVerdict(
  input: VerdictInput,
  settings: VerdictSettings
): Verdict {
  const checks: VerdictCheck[] = [
    checkFunds(input),
    checkFundBalance(input, settings.thresholds),
    checkFinplan(),
    checkDocument(input),
    checkOrderContract(input),
    checkPartnerHistory(input, settings.thresholds),
    checkPreapproved(),
  ]
  const level = checks.reduce<Exclude<VerdictLevel, "block">>((worst, c) => {
    if (c.status === "info" || !settings.include[c.id]) return worst
    return RANK[c.status] > RANK[worst]
      ? (c.status as Exclude<VerdictLevel, "block">)
      : worst
  }, "ok")
  return {
    level,
    title: TITLES[level],
    description: describeVerdict(level, checks),
    checks,
  }
}
```

Функции `checkFunds`, `checkFundBalance`, `checkOrderContract`,
`checkPartnerHistory` появятся в Task 3–4; чтобы Task 2 компилировался
и тесты сборки проходили, добавить в этот же файл временные заглушки,
которые Task 3–4 заменят реальной логикой:

```typescript
function checkFunds(input: VerdictInput): VerdictCheck {
  void input
  return noData("funds") // Task 3
}

function checkFundBalance(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  void input
  void thresholds
  return noData("fund_balance") // Task 3
}

function checkOrderContract(input: VerdictInput): VerdictCheck {
  void input
  return noData("order_contract") // Task 4
}

function checkPartnerHistory(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  void input
  void thresholds
  return noData("partner") // Task 4
}
```

Импорты `formatMoneyBig` (из `./money`) и `formatDate` (из `./dates`) в этой
задаче НЕ добавлять — они появятся вместе с использующим их кодом в Task 3 и
Task 4 (иначе lint упадёт на неиспользуемых импортах).

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/verdict.test.ts`
Expected: PASS (10 тестов).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/verdict.ts lib/domain/verdict.test.ts
git commit -m "feat: каркас вердикта светофора — типы, сборка, проверка основания"
```

---

### Task 3: Домен — проверки «Деньги на счёте» и «Остаток фонда»

Исправление бага старого кода: фонд считается **после платежа**
(остаток минус сумма заявки), как требует ТЗ.

**Files:**
- Modify: `lib/domain/verdict.ts`
- Test: `lib/domain/verdict.test.ts`

- [ ] **Step 1: Написать падающие тесты (добавить в конец `lib/domain/verdict.test.ts`)**

```typescript
describe("проверка «Деньги на счёте»", () => {
  it("остаток счёта списания ≥ суммы → ok", () => {
    expect(check(makeInput(), "funds").status).toBe("ok")
  })

  it("на счёте не хватает, по юрлицу хватает → warn «нужен перевод»", () => {
    const input = makeInput({
      balances: [
        {
          accountUid: "acc-1",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          currency: "RUB",
          balanceMinor: 10_000_00n,
        },
        {
          accountUid: "acc-2",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "ВТБ $",
          currency: "USD",
          balanceMinor: 5_000_00n, // 5 000 $ × 76 = 380 000 ₽
        },
      ],
    })
    const c = check(input, "funds")
    expect(c.status).toBe("warn")
    expect(c.label).toBe("Нужен перевод между счетами")
  })

  it("не хватает по юрлицу целиком → bad", () => {
    const input = makeInput({
      balances: [
        {
          accountUid: "acc-1",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          currency: "RUB",
          balanceMinor: 10_000_00n,
        },
      ],
    })
    expect(check(input, "funds").status).toBe("bad")
  })

  it("счета другого юрлица не учитываются", () => {
    const input = makeInput({
      balances: [
        {
          accountUid: "acc-1",
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          currency: "RUB",
          balanceMinor: 10_000_00n,
        },
        {
          accountUid: "acc-9",
          orgName: "РУСБУБОН",
          accountName: "Альфа ₽",
          currency: "RUB",
          balanceMinor: 100_000_000_00n,
        },
      ],
    })
    expect(check(input, "funds").status).toBe("bad")
  })

  it("счёт списания не указан, по юрлицу хватает → warn", () => {
    const input = makeInput()
    input.request.debitAccountUid = null
    const c = check(input, "funds")
    expect(c.status).toBe("warn")
    expect(c.label).toBe("Счёт списания не указан")
  })

  it("срез остатков пуст → info", () => {
    expect(check(makeInput({ balances: null }), "funds").status).toBe("info")
    expect(check(makeInput({ balances: [] }), "funds").status).toBe("info")
  })

  it("нет курса валюты заявки → info", () => {
    const input = makeInput({ rates: {} })
    input.request.currency = "CNY"
    expect(check(input, "funds").status).toBe("info")
  })
})

describe("проверка «Остаток фонда» (после платежа)", () => {
  const fund = {
    name: "Закупки товара",
    planWeekMinor: 500_000_00n,
    factWeekMinor: 100_000_00n,
    balanceMinor: 400_000_00n,
  }

  it("остаток после платежа ровно 0 → ok", () => {
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    expect(check(input, "fund_balance").status).toBe("ok") // 100k − 100k = 0
  })

  it("после платежа минус ровно 20% плана недели → warn (граница)", () => {
    // 100k − 200k = −100k; план 500k → 20%
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    input.request.amountMinor = 200_000_00n
    const c = check(input, "fund_balance")
    expect(c.status).toBe("warn")
  })

  it("минус глубже 20% → bad", () => {
    // 100k − 201k = −101k; план 500k → 20,2%
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    input.request.amountMinor = 201_000_00n
    expect(check(input, "fund_balance").status).toBe("bad")
  })

  it("план недели 0 и фонд в минусе → bad", () => {
    const input = makeInput({
      fund: { ...fund, planWeekMinor: 0n, balanceMinor: 0n },
    })
    input.request.amountMinor = 1_00n
    expect(check(input, "fund_balance").status).toBe("bad")
  })

  it("валютная заявка пересчитывается в ₽ по курсу", () => {
    // 10 000 CNY × 11,5 = 115 000 ₽ > остатка 100 000 ₽ → минус 15 000 ₽ = 3% плана → warn
    const input = makeInput({ fund: { ...fund, balanceMinor: 100_000_00n } })
    input.request.currency = "CNY"
    input.request.amountMinor = 10_000_00n
    expect(check(input, "fund_balance").status).toBe("warn")
  })

  it("фонда нет в срезе → info", () => {
    expect(check(makeInput({ fund: null }), "fund_balance").status).toBe("info")
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/verdict.test.ts`
Expected: FAIL — заглушки возвращают `info`.

- [ ] **Step 3: Заменить заглушки `checkFunds` и `checkFundBalance` реализацией**

Добавить в начало файла импорт: `import { formatMoneyBig } from "./money"`.

```typescript
function checkFunds(input: VerdictInput): VerdictCheck {
  const { request, balances, rates } = input
  if (!balances || balances.length === 0 || !rates) return noData("funds")

  const amountRub = toRub(request.amountMinor, request.currency, rates)
  if (amountRub === null)
    return noData("funds", `нет курса валюты ${request.currency}`)

  const account = request.debitAccountUid
    ? (balances.find((b) => b.accountUid === request.debitAccountUid) ?? null)
    : null
  if (
    account &&
    account.currency === request.currency &&
    account.balanceMinor >= request.amountMinor
  )
    return {
      id: "funds",
      label: "Денег на счёте достаточно",
      status: "ok",
      sublabel: formatMoneyBig(account.balanceMinor, account.currency),
    }

  // Счёт не покрывает (или не указан) — смотрим все счета юрлица в ₽.
  let orgTotalRub = 0
  for (const b of balances) {
    if (b.orgName !== request.orgName) continue
    const rub = toRub(b.balanceMinor, b.currency, rates)
    if (rub !== null) orgTotalRub += rub
  }
  if (orgTotalRub >= amountRub) {
    if (!account)
      return {
        id: "funds",
        label: "Счёт списания не указан",
        status: "warn",
        sublabel: `по юрлицу достаточно (${Math.round(orgTotalRub).toLocaleString("ru-RU")} ₽)`,
      }
    return {
      id: "funds",
      label: "Нужен перевод между счетами",
      status: "warn",
      sublabel: `на счёте ${formatMoneyBig(account.balanceMinor, account.currency)}, по юрлицу ${Math.round(orgTotalRub).toLocaleString("ru-RU")} ₽`,
    }
  }
  return {
    id: "funds",
    label: "Недостаточно средств",
    status: "bad",
    sublabel: `нужно ${formatMoneyBig(request.amountMinor, request.currency)}, по юрлицу ${Math.round(orgTotalRub).toLocaleString("ru-RU")} ₽`,
  }
}

function checkFundBalance(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  const { fund, rates, request } = input
  if (!fund || !rates) return noData("fund_balance")
  const amountRub = toRub(request.amountMinor, request.currency, rates)
  if (amountRub === null)
    return noData("fund_balance", `нет курса валюты ${request.currency}`)

  // Ключевое отличие от старого кода: остаток считаем ПОСЛЕ платежа (ТЗ §4).
  const afterRub = Number(fund.balanceMinor) / 100 - amountRub
  const afterText = `${Math.round(afterRub).toLocaleString("ru-RU")} ₽ после платежа`
  if (afterRub >= 0)
    return {
      id: "fund_balance",
      label: "Фонд в плюсе",
      status: "ok",
      sublabel: afterText,
    }

  const planWeekRub = Number(fund.planWeekMinor) / 100
  const deficitPercent =
    planWeekRub > 0 ? (Math.abs(afterRub) / planWeekRub) * 100 : 100
  if (deficitPercent <= thresholds.fundDeficitPercent)
    return {
      id: "fund_balance",
      label: "Фонд уходит в минус",
      status: "warn",
      sublabel: `${afterText} (${deficitPercent.toFixed(0)}% от плана недели)`,
    }
  return {
    id: "fund_balance",
    label: "Фонд критично в минусе",
    status: "bad",
    sublabel: `${afterText} (${deficitPercent.toFixed(0)}% от плана недели)`,
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/verdict.test.ts`
Expected: PASS (23 теста).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/verdict.ts lib/domain/verdict.test.ts
git commit -m "feat: проверки светофора — деньги на счёте и остаток фонда после платежа"
```

---

### Task 4: Домен — проверки «Заказ / договор» и «История контрагента»

**Files:**
- Modify: `lib/domain/verdict.ts`
- Test: `lib/domain/verdict.test.ts`

- [ ] **Step 1: Написать падающие тесты (добавить в конец `lib/domain/verdict.test.ts`)**

```typescript
describe("проверка «Заказ / договор»", () => {
  it("заказ: оплата с платежом ровно 100% → ok", () => {
    const input = makeInput({
      order: { number: "78", amountMinor: 400_000_00n, paidMinor: 300_000_00n, currency: "RUB" },
    })
    // 300k + 100k = 400k → 100%
    const c = check(input, "order_contract")
    expect(c.status).toBe("ok")
    expect(c.sublabel).toContain("100")
  })

  it("заказ: переплата > 100% → warn", () => {
    const input = makeInput({
      order: { number: "78", amountMinor: 350_000_00n, paidMinor: 300_000_00n, currency: "RUB" },
    })
    expect(check(input, "order_contract").status).toBe("warn")
  })

  it("валютный заказ пересчитывается по курсу", () => {
    // заказ 10 000 $ = 760 000 ₽; оплачено 0; платёж 100 000 ₽ → 13,2% → ok
    const input = makeInput({
      order: { number: "91", amountMinor: 10_000_00n, paidMinor: 0n, currency: "USD" },
    })
    expect(check(input, "order_contract").status).toBe("ok")
  })

  it("заказа нет, договор активен, платёж в рамках остатка → ok", () => {
    const input = makeInput({
      order: null,
      contract: {
        number: "14",
        date: new Date("2025-03-02"),
        isActive: true,
        amountMinor: 500_000_00n,
        paidMinor: 100_000_00n,
        currency: "RUB",
      },
    })
    expect(check(input, "order_contract").status).toBe("ok")
  })

  it("платёж превысит сумму договора → warn", () => {
    const input = makeInput({
      order: null,
      contract: {
        number: "14",
        date: new Date("2025-03-02"),
        isActive: true,
        amountMinor: 150_000_00n,
        paidMinor: 100_000_00n, // остаток 50k < платежа 100k
        currency: "RUB",
      },
    })
    expect(check(input, "order_contract").status).toBe("warn")
  })

  it("договор закрыт → bad", () => {
    const input = makeInput({
      order: null,
      contract: {
        number: "14",
        date: new Date("2025-03-02"),
        isActive: false,
        amountMinor: 500_000_00n,
        paidMinor: 0n,
        currency: "RUB",
      },
    })
    expect(check(input, "order_contract").status).toBe("bad")
  })

  it("ни заказа, ни договора при доступных срезах → bad", () => {
    const input = makeInput({ order: null, contract: null })
    expect(check(input, "order_contract").status).toBe("bad")
  })

  it("срезы заказов/договоров недоступны → info", () => {
    const input = makeInput({
      order: null,
      contract: null,
      orderContractAvailable: false,
    })
    expect(check(input, "order_contract").status).toBe("info")
  })
})

describe("проверка «История контрагента»", () => {
  const recent = new Date("2026-07-01")

  it("ровно 3 платежа, недавние → ok (граница «постоянного»)", () => {
    const input = makeInput({
      partner: { paymentCount: 3, firstOperationAt: recent, lastPaymentAt: recent },
    })
    expect(check(input, "partner").status).toBe("ok")
  })

  it("2 платежа → warn «эпизодический»", () => {
    const input = makeInput({
      partner: { paymentCount: 2, firstOperationAt: recent, lastPaymentAt: recent },
    })
    const c = check(input, "partner")
    expect(c.status).toBe("warn")
    expect(c.label).toBe("Эпизодический контрагент")
  })

  it("постоянный, но пауза больше 12 месяцев → warn «давно не работали»", () => {
    const input = makeInput({
      partner: {
        paymentCount: 12,
        firstOperationAt: new Date("2023-01-01"),
        lastPaymentAt: new Date("2025-05-01"), // now = 2026-07-15 → 14 месяцев
      },
    })
    const c = check(input, "partner")
    expect(c.status).toBe("warn")
    expect(c.label).toBe("Давно не работали")
  })

  it("0 платежей → bad «новый поставщик»", () => {
    const input = makeInput({
      partner: { paymentCount: 0, firstOperationAt: null, lastPaymentAt: null },
    })
    expect(check(input, "partner").status).toBe("bad")
  })

  it("срез контрагентов недоступен → info", () => {
    expect(check(makeInput({ partner: null }), "partner").status).toBe("info")
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/verdict.test.ts`
Expected: FAIL — заглушки возвращают `info`.

- [ ] **Step 3: Заменить заглушки реализацией**

Добавить к импортам: `import { formatDate } from "./dates"`.

```typescript
function checkOrderContract(input: VerdictInput): VerdictCheck {
  const { order, contract, orderContractAvailable, request, rates } = input

  if (order) {
    const amountRub = toRub(request.amountMinor, request.currency, rates ?? {})
    const orderRub = toRub(order.amountMinor, order.currency, rates ?? {})
    const paidRub = toRub(order.paidMinor, order.currency, rates ?? {})
    if (amountRub === null || orderRub === null || paidRub === null)
      return noData("order_contract", "нет курса валюты")
    if (orderRub <= 0) return noData("order_contract", "сумма заказа не задана")
    const percent = ((paidRub + amountRub) / orderRub) * 100
    if (percent <= 100)
      return {
        id: "order_contract",
        label: `Заказ поставщику №${order.number}`,
        status: "ok",
        sublabel: `с этим платежом оплачено ${percent.toFixed(0)}% заказа`,
      }
    return {
      id: "order_contract",
      label: "Переплата по заказу",
      status: "warn",
      sublabel: `с этим платежом ${percent.toFixed(0)}% суммы заказа №${order.number}`,
    }
  }

  if (contract) {
    if (!contract.isActive)
      return {
        id: "order_contract",
        label: "Договор закрыт",
        status: "bad",
        sublabel: `№${contract.number} от ${formatDate(contract.date)}`,
      }
    const remaining = contract.amountMinor - contract.paidMinor
    const remainingRub = toRub(remaining, contract.currency, rates ?? {})
    const amountRub = toRub(request.amountMinor, request.currency, rates ?? {})
    if (
      remainingRub !== null &&
      amountRub !== null &&
      contract.amountMinor > 0n &&
      remainingRub < amountRub
    )
      return {
        id: "order_contract",
        label: "Платёж превысит сумму договора",
        status: "warn",
        sublabel: `остаток по договору ${formatMoneyBig(remaining, contract.currency)}`,
      }
    return {
      id: "order_contract",
      label: "Договор активен",
      status: "ok",
      sublabel: `№${contract.number} от ${formatDate(contract.date)}`,
    }
  }

  if (orderContractAvailable)
    return {
      id: "order_contract",
      label: "Нет ни заказа, ни договора",
      status: "bad",
      sublabel: "укажите основание в 1С",
    }
  return noData("order_contract")
}

function checkPartnerHistory(
  input: VerdictInput,
  thresholds: VerdictThresholds
): VerdictCheck {
  const { partner, now } = input
  if (!partner) return noData("partner")

  if (partner.paymentCount >= thresholds.minOperationsForConstant) {
    const staleMs = thresholds.oldPartnerMonths * 30 * 24 * 60 * 60 * 1000
    if (
      partner.lastPaymentAt &&
      now.getTime() - partner.lastPaymentAt.getTime() > staleMs
    )
      return {
        id: "partner",
        label: "Давно не работали",
        status: "warn",
        sublabel: `последний платёж ${formatDate(partner.lastPaymentAt)}`,
      }
    return {
      id: "partner",
      label: "Постоянный контрагент",
      status: "ok",
      sublabel: `${partner.paymentCount} платежей`,
    }
  }
  if (partner.paymentCount >= 1)
    return {
      id: "partner",
      label: "Эпизодический контрагент",
      status: "warn",
      sublabel: `${partner.paymentCount} платеж(а)`,
    }
  return {
    id: "partner",
    label: "Новый поставщик",
    status: "bad",
    sublabel: "первый платёж",
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/verdict.test.ts`
Expected: PASS (36 тестов).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/verdict.ts lib/domain/verdict.test.ts
git commit -m "feat: проверки светофора — заказ/договор и история контрагента"
```

---

### Task 5: Слайс-гейтвеи и fixture-данные срезов

Fixture-данные срезов согласованы с заявками `dwh-fixture.ts` и дают три
вердикта: REQ-0004 → 🟢, REQ-0006 → 🟡 (нужен перевод + эпизодический
контрагент), новая REQ-0007 → 🔴 (новый поставщик, без основания и договора).

**Files:**
- Create: `lib/integrations/slices.ts`
- Create: `lib/integrations/slices-fixture.ts`
- Modify: `lib/integrations/dwh.ts`, `lib/integrations/dwh-fixture.ts`
- Modify: `tests/e2e/requests.spec.ts`

- [ ] **Step 1: Расширить `DwhRequestRow` в `lib/integrations/dwh.ts`** (после поля `comment`):

```typescript
  // Светофор (план 6)
  debitAccountUid: string | null
  contractUid: string | null
  orderUid: string | null
  initiatorHead: string | null
```

- [ ] **Step 2: Обновить `lib/integrations/dwh-fixture.ts`**

В объект `common` добавить:

```typescript
    debitAccountUid: null as string | null,
    contractUid: null as string | null,
    orderUid: null as string | null,
    initiatorHead: null as string | null,
```

В заявку `fx-req-4` добавить поля (после `approvalStatus`):

```typescript
      debitAccountUid: "fx-acc-tori-rub",
      partnerUid: "fx-prt-guangzhou",
      contractUid: "fx-ctr-14",
      orderUid: "fx-ord-78",
      initiatorHead: "Петров С.",
      comment: "Аванс 25% по заказу №78, отгрузка августа",
```

В заявку `fx-req-6` добавить:

```typescript
      debitAccountUid: "fx-acc-tori-cny",
      partnerUid: "fx-prt-shenzhen",
      orderUid: "fx-ord-91",
      initiatorHead: "Петров С.",
```

В конец массива `buildRequests()` добавить красную заявку:

```typescript
    {
      ...common,
      uid: "fx-req-7",
      number: "REQ-0007",
      date: daysFromNow(0),
      orgName: "ИП Бобровская",
      initiator: "Смирнов К.",
      amountMinor: 620_000_00n,
      currency: "RUB",
      cashFlowItem: "Упаковка",
      fund: "Операционные расходы",
      partnerName: "ООО «НовоПак»",
      partnerUid: "fx-prt-novopak",
      debitAccountUid: "fx-acc-bobr-rub",
      payDate: daysFromNow(4),
      approvalStatus: "on_approval", // новый поставщик без основания → 🔴
    },
```

- [ ] **Step 3: Интерфейсы и фабрика срезов**

```typescript
// lib/integrations/slices.ts
// Срезы данных светофора. Интерфейс на срез: источник каждого выбирается
// env SLICE_<ИМЯ>_SOURCE (fixture | 1c | dwh). В этом плане реализован только
// fixture; боевые адаптеры (методы API 1С, вьюхи DWH) — план DWH.
import { fixtureSlices } from "./slices-fixture"

export type BalanceRow = {
  accountUid: string
  orgUid: string | null
  orgName: string
  accountName: string
  bankName: string | null
  currency: string
  balanceMinor: bigint
}

export type RateRow = {
  currencyCode: string
  rate: number // ₽ за единицу
  rateDate: Date
}

export type FundRow = {
  fundUid: string
  name: string
  planWeekMinor: bigint
  factWeekMinor: bigint
  balanceMinor: bigint
}

export type PartnerRow = {
  partnerUid: string
  firstOperationAt: Date | null
  lastPaymentAt: Date | null
  paymentCount: number
  totalPaidMinor: bigint
  receivableMinor: bigint
  payableMinor: bigint
  recentPayments: Array<{ date: string; basis: string; amountMinor: string }>
  chatUrl: string | null
}

export type ContractRow = {
  contractUid: string
  partnerUid: string
  number: string
  date: Date
  isActive: boolean
  amountMinor: bigint
  paidMinor: bigint
  debtMinor: bigint
  currency: string
}

export type OrderRow = {
  orderUid: string
  partnerUid: string
  contractUid: string | null
  number: string
  date: Date
  amountMinor: bigint
  paidMinor: bigint
  currency: string
}

export type AttachmentRow = {
  requestUid: string
  fileName: string
  fileType: string | null
  createdAt: Date
}

export interface SliceFetcher<Row> {
  fetch(): Promise<Row[]>
}

export type SliceFetchers = {
  balances: SliceFetcher<BalanceRow>
  rates: SliceFetcher<RateRow>
  funds: SliceFetcher<FundRow>
  partners: SliceFetcher<PartnerRow>
  contracts: SliceFetcher<ContractRow>
  orders: SliceFetcher<OrderRow>
  attachments: SliceFetcher<AttachmentRow>
}

export type SliceName = keyof SliceFetchers

function pick<Row>(
  slice: SliceName,
  fixture: SliceFetcher<Row>
): SliceFetcher<Row> {
  const source =
    process.env[`SLICE_${slice.toUpperCase()}_SOURCE`] ?? "fixture"
  if (source === "fixture") return fixture
  throw new Error(
    `Срез ${slice}: источник "${source}" не поддерживается — боевые адаптеры появятся в плане DWH`
  )
}

export function getSliceFetchers(): SliceFetchers {
  return {
    balances: pick("balances", fixtureSlices.balances),
    rates: pick("rates", fixtureSlices.rates),
    funds: pick("funds", fixtureSlices.funds),
    partners: pick("partners", fixtureSlices.partners),
    contracts: pick("contracts", fixtureSlices.contracts),
    orders: pick("orders", fixtureSlices.orders),
    attachments: pick("attachments", fixtureSlices.attachments),
  }
}
```

- [ ] **Step 4: Fixture-данные срезов**

```typescript
// lib/integrations/slices-fixture.ts
// Демо-срезы светофора, согласованы с dwh-fixture.ts:
// REQ-0004 → 🟢 (всё в порядке), REQ-0006 → 🟡 (перевод + эпизодический),
// REQ-0007 → 🔴 (новый поставщик, без основания и договора).
import type { SliceFetchers } from "./slices"

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export const fixtureSlices: SliceFetchers = {
  balances: {
    async fetch() {
      return [
        {
          accountUid: "fx-acc-tori-rub",
          orgUid: null,
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "Сбербанк ₽",
          bankName: "Сбербанк",
          currency: "RUB",
          balanceMinor: 40_000_000_00n, // хватает на REQ-0004 (25,7 млн)
        },
        {
          accountUid: "fx-acc-tori-cny",
          orgUid: null,
          orgName: "ТОРИ БРЭНДС ООО",
          accountName: "ВТБ ¥",
          bankName: "ВТБ",
          currency: "CNY",
          balanceMinor: 500_000_00n, // меньше 780 000 ¥ REQ-0006 → «нужен перевод»
        },
        {
          accountUid: "fx-acc-bobr-rub",
          orgUid: null,
          orgName: "ИП Бобровская",
          accountName: "Сбербанк ₽",
          bankName: "Сбербанк",
          currency: "RUB",
          balanceMinor: 8_400_000_00n,
        },
        {
          accountUid: "fx-acc-rusb-rub",
          orgUid: null,
          orgName: "РУСБУБОН",
          accountName: "Альфа-Банк ₽",
          bankName: "Альфа-Банк",
          currency: "RUB",
          balanceMinor: 5_100_000_00n,
        },
      ]
    },
  },
  rates: {
    async fetch() {
      return [
        { currencyCode: "CNY", rate: 11.5, rateDate: daysFromNow(0) },
        { currencyCode: "USD", rate: 76, rateDate: daysFromNow(0) },
      ]
    },
  },
  funds: {
    async fetch() {
      return [
        {
          fundUid: "fx-fund-goods",
          name: "Закупки товара",
          planWeekMinor: 40_000_000_00n,
          factWeekMinor: 5_000_000_00n,
          balanceMinor: 35_000_000_00n, // REQ-0004 (25,7 млн) остаётся в плюсе
        },
        {
          fundUid: "fx-fund-opex",
          name: "Операционные расходы",
          planWeekMinor: 3_000_000_00n,
          factWeekMinor: 1_100_000_00n,
          balanceMinor: 1_900_000_00n,
        },
        {
          fundUid: "fx-fund-marketing",
          name: "Маркетинг",
          planWeekMinor: 2_000_000_00n,
          factWeekMinor: 2_300_000_00n,
          balanceMinor: -300_000_00n, // фонд в минусе — виден на панели фондов
        },
      ]
    },
  },
  partners: {
    async fetch() {
      return [
        {
          partnerUid: "fx-prt-guangzhou",
          firstOperationAt: daysFromNow(-700),
          lastPaymentAt: daysFromNow(-10),
          paymentCount: 12, // постоянный → ok
          totalPaidMinor: 480_000_000_00n,
          receivableMinor: 1_400_000_00n,
          payableMinor: 0n,
          recentPayments: [
            { date: daysFromNow(-10).toISOString(), basis: "Заказ №71", amountMinor: "200000000" },
            { date: daysFromNow(-40).toISOString(), basis: "Заказ №65", amountMinor: "180000000" },
            { date: daysFromNow(-70).toISOString(), basis: "Заказ №58", amountMinor: "150000000" },
          ],
          chatUrl: "https://messenger.example/guangzhou",
        },
        {
          partnerUid: "fx-prt-shenzhen",
          firstOperationAt: daysFromNow(-200),
          lastPaymentAt: daysFromNow(-40),
          paymentCount: 2, // эпизодический → warn
          totalPaidMinor: 9_000_000_00n,
          receivableMinor: 0n,
          payableMinor: 350_000_00n,
          recentPayments: [
            { date: daysFromNow(-40).toISOString(), basis: "Заказ №84", amountMinor: "45000000" },
          ],
          chatUrl: null,
        },
        // fx-prt-novopak сознательно отсутствует: срез непуст, записи нет →
        // paymentCount 0 → «новый поставщик» (🔴 у REQ-0007).
      ]
    },
  },
  contracts: {
    async fetch() {
      return [
        {
          contractUid: "fx-ctr-14",
          partnerUid: "fx-prt-guangzhou",
          number: "14",
          date: new Date("2025-03-02"),
          isActive: true,
          amountMinor: 2_000_000_000_00n,
          paidMinor: 480_000_000_00n,
          debtMinor: 0n,
          currency: "RUB",
        },
      ]
    },
  },
  orders: {
    async fetch() {
      return [
        {
          orderUid: "fx-ord-78",
          partnerUid: "fx-prt-guangzhou",
          contractUid: "fx-ctr-14",
          number: "78",
          date: daysFromNow(-14),
          amountMinor: 102_800_000_00n, // REQ-0004 = ровно 25% заказа
          paidMinor: 0n,
          currency: "RUB",
        },
        {
          orderUid: "fx-ord-91",
          partnerUid: "fx-prt-shenzhen",
          contractUid: null,
          number: "91",
          date: daysFromNow(-7),
          amountMinor: 780_000_00n, // REQ-0006 = 100% заказа
          paidMinor: 0n,
          currency: "CNY",
        },
      ]
    },
  },
  attachments: {
    async fetch() {
      return [
        {
          requestUid: "fx-req-4",
          fileName: "invoice_78.pdf",
          fileType: "инвойс",
          createdAt: daysFromNow(-1),
        },
        {
          requestUid: "fx-req-4",
          fileName: "spec_78.pdf",
          fileType: "спецификация",
          createdAt: daysFromNow(-1),
        },
        {
          requestUid: "fx-req-6",
          fileName: "invoice_91.pdf",
          fileType: "инвойс",
          createdAt: daysFromNow(0),
        },
        // у fx-req-7 вложений нет → «нет основания» (🔴)
      ]
    },
  },
}
```

- [ ] **Step 5: Актуализировать e2e массового согласования**

Появилась третья заявка `on_approval` (REQ-0007) — тест из плана 03 должен
выбирать все три (ограничение «только 🟢» появится в Task 10 и снова изменит
этот тест). В `tests/e2e/requests.spec.ts` заменить тело теста
`"массовое согласование выбранных заявок (mock 1С)"`:

```typescript
test("массовое согласование выбранных заявок (mock 1С)", async ({ page }) => {
  await syncFixtureData(page)
  await page.getByLabel("Выбрать REQ-0004").check()
  await page.getByLabel("Выбрать REQ-0006").check()
  await page.getByLabel("Выбрать REQ-0007").check()
  await page.getByRole("button", { name: "Согласовать выбранные" }).click()
  await expect(
    page.getByRole("button", { name: "Согласовать выбранные" })
  ).toHaveCount(0) // заявок on_approval не осталось
})
```

- [ ] **Step 6: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/requests.spec.ts`
Expected: PASS (8 тестов).

- [ ] **Step 7: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/ tests/e2e/requests.spec.ts
git commit -m "feat: слайс-гейтвеи светофора с fixture-данными семи срезов"
```

---

### Task 6: Синк срезов

**Files:**
- Create: `lib/sync/sync-slices.ts`
- Modify: `lib/sync/run-sync.ts`
- Modify: `.env.example`, локальный `.env`

- [ ] **Step 1: Реализация `syncSlices`**

Оркестрация I/O без бизнес-логики — без unit-тестов (политика CLAUDE.md),
сценарий покроет e2e (Task 9–11 работают на этих данных).

```typescript
// lib/sync/sync-slices.ts
// Синк срезов светофора. Каждый срез — независимый шаг: ошибка одного
// не мешает остальным (проверки по нему деградируют в «нет данных»).
import { prisma } from "@/lib/db"
import type { SliceFetchers } from "@/lib/integrations/slices"
import type { Prisma } from "@prisma/client"

export type SliceReport = Record<
  string,
  { upserted: number } | { error: string }
>

async function step(
  fn: () => Promise<number>
): Promise<{ upserted: number } | { error: string }> {
  try {
    return { upserted: await fn() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function syncSlices(
  fetchers: SliceFetchers
): Promise<SliceReport> {
  const syncedAt = new Date()
  const report: SliceReport = {}

  report.balances = await step(async () => {
    const rows = await fetchers.balances.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.accountBalance.upsert({
        where: { accountUid: r.accountUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.rates = await step(async () => {
    const rows = await fetchers.rates.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.currencyRate.upsert({
        where: { currencyCode: r.currencyCode },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.funds = await step(async () => {
    const rows = await fetchers.funds.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.fundSnapshot.upsert({
        where: { fundUid: r.fundUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.partners = await step(async () => {
    const rows = await fetchers.partners.fetch()
    for (const r of rows) {
      const data = {
        ...r,
        recentPayments: r.recentPayments as Prisma.InputJsonValue,
        syncedAt,
      }
      await prisma.partnerStats.upsert({
        where: { partnerUid: r.partnerUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.contracts = await step(async () => {
    const rows = await fetchers.contracts.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.partnerContract.upsert({
        where: { contractUid: r.contractUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.orders = await step(async () => {
    const rows = await fetchers.orders.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.supplierOrder.upsert({
        where: { orderUid: r.orderUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.attachments = await step(async () => {
    const rows = await fetchers.attachments.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.attachmentMeta.upsert({
        where: {
          requestUid_fileName: {
            requestUid: r.requestUid,
            fileName: r.fileName,
          },
        },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  return report
}
```

- [ ] **Step 2: Подключить к `runSync`**

В `lib/sync/run-sync.ts`:

1. Добавить импорты:

```typescript
import { getSliceFetchers } from "@/lib/integrations/slices"
import { syncSlices } from "./sync-slices"
import type { Prisma } from "@prisma/client"
```

2. В маппинге upsert заявок (объект `data` внутри цикла `for (const r of requests)`)
   добавить после `comment: r.comment,`:

```typescript
        debitAccountUid: r.debitAccountUid,
        contractUid: r.contractUid,
        orderUid: r.orderUid,
        initiatorHead: r.initiatorHead,
```

3. После цикла списаний (после `debitsUpserted++`-блока), перед пересчётом
   статусов, добавить:

```typescript
    // Срезы светофора: независимые шаги, ошибки — в отчёт, не в исключение.
    const slices = await syncSlices(getSliceFetchers())
```

4. В финальный `prisma.syncRun.update` (ветка успеха) добавить в `data`:

```typescript
        slices: slices as Prisma.InputJsonValue,
```

- [ ] **Step 3: Дополнить `.env.example` (в конец) и локальный `.env`**

```bash
# --- Светофор: источник каждого среза (fixture | 1c | dwh — боевые в плане DWH) ---
SLICE_BALANCES_SOURCE="fixture"
SLICE_RATES_SOURCE="fixture"
SLICE_FUNDS_SOURCE="fixture"
SLICE_PARTNERS_SOURCE="fixture"
SLICE_CONTRACTS_SOURCE="fixture"
SLICE_ORDERS_SOURCE="fixture"
SLICE_ATTACHMENTS_SOURCE="fixture"
```

- [ ] **Step 4: Проверить синк вручную**

Run: `npx prisma db seed` (seed из плана 03 вызывает `runSync` — срезы приедут вместе с заявками)
Expected: `Seed: синк заявок — {"skipped":false,...,"status":"ok"}`.

Run: `npx prisma studio` (или `psql`) — таблицы `account_balances` (4 строки),
`currency_rates` (2), `fund_snapshots` (3), `partner_stats` (2),
`partner_contracts` (1), `supplier_orders` (2), `attachment_meta` (3) заполнены;
у последнего `sync_runs.slices` — JSON с `{"upserted":…}` по каждому срезу.

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/sync/ .env.example
git commit -m "feat: синк срезов светофора с независимыми шагами и отчётом в SyncRun"
```

---

### Task 7: Read-path — `lib/verdicts.ts`

Мост между БД и чистым доменом: загружает настройки и срезы, строит
`VerdictInput`. Правило доступности: пустая таблица среза = срез недоступен
(`null` в домен → проверка `info`); непустая, но записи для заявки нет —
осмысленное отсутствие (для контрагента — «новый», для заказа — fallback
на договор). I/O-модуль — без unit-тестов.

**Files:**
- Create: `lib/verdicts.ts`

- [ ] **Step 1: Реализация**

```typescript
// lib/verdicts.ts
// Read-path светофора: настройки и срезы из PostgreSQL → вердикты.
// Вердикт не хранится — вычисляется при каждом рендере (server components).
import { prisma } from "@/lib/db"
import {
  computeVerdict,
  DEFAULT_INCLUDE,
  DEFAULT_THRESHOLDS,
  type CheckId,
  type RatesSlice,
  type Verdict,
  type VerdictInput,
  type VerdictSettings,
} from "@/lib/domain/verdict"
import type {
  AccountBalance,
  AttachmentMeta,
  FundSnapshot,
  PartnerContract,
  PartnerStats,
  PaymentRequest,
  SupplierOrder,
} from "@prisma/client"

export async function loadVerdictSettings(): Promise<VerdictSettings> {
  const [thresholdRows, checkRows] = await Promise.all([
    prisma.verdictThreshold.findMany(),
    prisma.verdictCheckSetting.findMany(),
  ])
  const thresholds = { ...DEFAULT_THRESHOLDS }
  for (const row of thresholdRows) {
    if (row.key in thresholds)
      thresholds[row.key as keyof typeof thresholds] = Number(row.value)
  }
  const include = { ...DEFAULT_INCLUDE }
  for (const row of checkRows) {
    if (row.checkId in include)
      include[row.checkId as CheckId] = row.includeInVerdict
  }
  return { thresholds, include }
}

type SliceData = {
  balances: AccountBalance[]
  rates: RatesSlice
  ratesAvailable: boolean
  funds: Map<string, FundSnapshot>
  fundsAvailable: boolean
  partners: Map<string, PartnerStats>
  partnersAvailable: boolean
  contracts: Map<string, PartnerContract>
  orders: Map<string, SupplierOrder>
  orderContractAvailable: boolean
  attachmentCounts: Map<string, number>
  attachmentsAvailable: boolean
  oldestSyncedAt: Date | null
}

async function loadSlices(requests: PaymentRequest[]): Promise<SliceData> {
  const partnerUids = requests
    .map((r) => r.partnerUid)
    .filter((v): v is string => v !== null)
  const contractUids = requests
    .map((r) => r.contractUid)
    .filter((v): v is string => v !== null)
  const orderUids = requests
    .map((r) => r.orderUid)
    .filter((v): v is string => v !== null)
  const requestUids = requests.map((r) => r.uid)

  const [
    balances,
    rateRows,
    fundRows,
    partnerRows,
    contractRows,
    orderRows,
    attachmentGroups,
    partnersTotal,
    contractsTotal,
    ordersTotal,
    attachmentsTotal,
  ] = await Promise.all([
    prisma.accountBalance.findMany(),
    prisma.currencyRate.findMany(),
    prisma.fundSnapshot.findMany(),
    prisma.partnerStats.findMany({ where: { partnerUid: { in: partnerUids } } }),
    prisma.partnerContract.findMany({
      where: { contractUid: { in: contractUids } },
    }),
    prisma.supplierOrder.findMany({ where: { orderUid: { in: orderUids } } }),
    prisma.attachmentMeta.groupBy({
      by: ["requestUid"],
      where: { requestUid: { in: requestUids } },
      _count: { _all: true },
    }),
    prisma.partnerStats.count(),
    prisma.partnerContract.count(),
    prisma.supplierOrder.count(),
    prisma.attachmentMeta.count(),
  ])

  const rates: RatesSlice = {}
  for (const r of rateRows) rates[r.currencyCode] = Number(r.rate)

  // Свежесть — худший (старейший) из максимумов syncedAt непустых срезов.
  const syncedMaxes: Array<Date | null> = [
    balances.length ? balances.reduce((m, b) => (b.syncedAt > m ? b.syncedAt : m), balances[0].syncedAt) : null,
    rateRows.length ? rateRows.reduce((m, b) => (b.syncedAt > m ? b.syncedAt : m), rateRows[0].syncedAt) : null,
    fundRows.length ? fundRows.reduce((m, b) => (b.syncedAt > m ? b.syncedAt : m), fundRows[0].syncedAt) : null,
  ]
  const present = syncedMaxes.filter((d): d is Date => d !== null)
  const oldestSyncedAt = present.length
    ? present.reduce((m, d) => (d < m ? d : m))
    : null

  return {
    balances,
    rates,
    ratesAvailable: rateRows.length > 0,
    funds: new Map(fundRows.map((f) => [f.name, f])),
    fundsAvailable: fundRows.length > 0,
    partners: new Map(partnerRows.map((p) => [p.partnerUid, p])),
    partnersAvailable: partnersTotal > 0,
    contracts: new Map(contractRows.map((c) => [c.contractUid, c])),
    orders: new Map(orderRows.map((o) => [o.orderUid, o])),
    orderContractAvailable: contractsTotal + ordersTotal > 0,
    attachmentCounts: new Map(
      attachmentGroups.map((g) => [g.requestUid, g._count._all])
    ),
    attachmentsAvailable: attachmentsTotal > 0,
    oldestSyncedAt,
  }
}

function toVerdictInput(
  request: PaymentRequest,
  s: SliceData,
  now: Date
): VerdictInput {
  const fund = request.fund ? (s.funds.get(request.fund) ?? null) : null
  const partnerRow = request.partnerUid
    ? (s.partners.get(request.partnerUid) ?? null)
    : null
  const order = request.orderUid
    ? (s.orders.get(request.orderUid) ?? null)
    : null
  const contract = request.contractUid
    ? (s.contracts.get(request.contractUid) ?? null)
    : null
  return {
    request: {
      amountMinor: request.amountMinor,
      currency: request.currency,
      debitAccountUid: request.debitAccountUid,
      orgName: request.orgName,
      comment: request.comment,
    },
    now,
    balances: s.balances.length > 0 ? s.balances : null,
    rates: s.ratesAvailable ? s.rates : null,
    fund: s.fundsAvailable && fund
      ? {
          name: fund.name,
          planWeekMinor: fund.planWeekMinor,
          factWeekMinor: fund.factWeekMinor,
          balanceMinor: fund.balanceMinor,
        }
      : null,
    attachmentsCount: s.attachmentsAvailable
      ? (s.attachmentCounts.get(request.uid) ?? 0)
      : null,
    // Срез непуст, записи нет → контрагент без истории = «новый» (0 платежей).
    partner: !s.partnersAvailable
      ? null
      : partnerRow
        ? {
            paymentCount: partnerRow.paymentCount,
            firstOperationAt: partnerRow.firstOperationAt,
            lastPaymentAt: partnerRow.lastPaymentAt,
          }
        : request.partnerUid
          ? { paymentCount: 0, firstOperationAt: null, lastPaymentAt: null }
          : null,
    order: order
      ? {
          number: order.number,
          amountMinor: order.amountMinor,
          paidMinor: order.paidMinor,
          currency: order.currency,
        }
      : null,
    contract: contract
      ? {
          number: contract.number,
          date: contract.date,
          isActive: contract.isActive,
          amountMinor: contract.amountMinor,
          paidMinor: contract.paidMinor,
          currency: contract.currency,
        }
      : null,
    orderContractAvailable: s.orderContractAvailable,
  }
}

export type VerdictsBundle = {
  verdicts: Map<string, Verdict> // uid → вердикт
  rates: RatesSlice
  oldestSyncedAt: Date | null
}

// Вердикты пачкой — для реестра (заявки на согласовании: десятки, дёшево).
export async function computeVerdicts(
  requests: PaymentRequest[]
): Promise<VerdictsBundle> {
  const [settings, slices] = await Promise.all([
    loadVerdictSettings(),
    loadSlices(requests),
  ])
  const now = new Date()
  const verdicts = new Map(
    requests.map((r) => [
      r.uid,
      computeVerdict(toVerdictInput(r, slices, now), settings),
    ])
  )
  return { verdicts, rates: slices.rates, oldestSyncedAt: slices.oldestSyncedAt }
}

export type RequestContext = {
  verdict: Verdict
  balances: AccountBalance[]
  rates: RatesSlice
  fund: FundSnapshot | null
  partner: PartnerStats | null
  contract: PartnerContract | null
  order: SupplierOrder | null
  attachments: AttachmentMeta[]
  related: PaymentRequest[]
  oldestSyncedAt: Date | null
}

// Полный контекст одной заявки — для карточки (секции + панель).
export async function loadRequestContext(
  request: PaymentRequest
): Promise<RequestContext> {
  const [settings, slices, attachments, related] = await Promise.all([
    loadVerdictSettings(),
    loadSlices([request]),
    prisma.attachmentMeta.findMany({
      where: { requestUid: request.uid },
      orderBy: { fileName: "asc" },
    }),
    // Связанные: тот же контрагент или заказ, ±30 дней от даты оплаты.
    prisma.paymentRequest.findMany({
      where: {
        uid: { not: request.uid },
        isDeletedIn1c: false,
        payDate: {
          gte: new Date(request.payDate.getTime() - 30 * 24 * 60 * 60 * 1000),
          lte: new Date(request.payDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        OR: [
          ...(request.partnerUid ? [{ partnerUid: request.partnerUid }] : []),
          ...(request.orderUid ? [{ orderUid: request.orderUid }] : []),
          ...(request.partnerName ? [{ partnerName: request.partnerName }] : []),
        ],
      },
      orderBy: { payDate: "asc" },
    }),
  ])
  const verdict = computeVerdict(
    toVerdictInput(request, slices, new Date()),
    settings
  )
  return {
    verdict,
    balances: slices.balances,
    rates: slices.rates,
    fund: request.fund ? (slices.funds.get(request.fund) ?? null) : null,
    partner: request.partnerUid
      ? (slices.partners.get(request.partnerUid) ?? null)
      : null,
    contract: request.contractUid
      ? (slices.contracts.get(request.contractUid) ?? null)
      : null,
    order: request.orderUid
      ? (slices.orders.get(request.orderUid) ?? null)
      : null,
    attachments,
    related,
    oldestSyncedAt: slices.oldestSyncedAt,
  }
}
```

- [ ] **Step 2: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/verdicts.ts
git commit -m "feat: read-path светофора — настройки и срезы из БД в вердикты"
```

---

### Task 8: Страница настроек `/settings/verdict` и сид настроек

**Files:**
- Create: `app/settings/verdict/actions.ts`
- Create: `app/settings/verdict/settings-form.tsx`
- Create: `app/settings/verdict/page.tsx`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Server action**

```typescript
// app/settings/verdict/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import {
  DEFAULT_INCLUDE,
  DEFAULT_THRESHOLDS,
  type CheckId,
} from "@/lib/domain/verdict"

export type FormState = { error: string | null }

const THRESHOLD_KEYS = Object.keys(DEFAULT_THRESHOLDS) as Array<
  keyof typeof DEFAULT_THRESHOLDS
>
const CHECK_IDS = Object.keys(DEFAULT_INCLUDE) as CheckId[]

export async function saveVerdictSettings(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const thresholds: Array<{ key: string; value: number }> = []
  for (const key of THRESHOLD_KEYS) {
    const raw = String(formData.get(key) ?? "").replace(",", ".")
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0)
      return { error: `Порог «${key}» должен быть неотрицательным числом` }
    thresholds.push({ key, value })
  }

  for (const t of thresholds) {
    await prisma.verdictThreshold.upsert({
      where: { key: t.key },
      update: { value: t.value },
      create: { key: t.key, value: t.value },
    })
  }
  for (const checkId of CHECK_IDS) {
    // Чекбокс присутствует в форме только если включён.
    const includeInVerdict = formData.get(`include_${checkId}`) === "on"
    await prisma.verdictCheckSetting.upsert({
      where: { checkId },
      update: { includeInVerdict },
      create: { checkId, includeInVerdict },
    })
  }

  revalidatePath("/settings/verdict")
  revalidatePath("/requests")
  return { error: null }
}
```

- [ ] **Step 2: Страница**

Форма — server component c нативным сабмитом недоступна для `useActionState`,
поэтому клиентский компонент прямо в разделе (по образцу
`app/transactions/transaction-form.tsx`). Создать `app/settings/verdict/settings-form.tsx`:

```tsx
// app/settings/verdict/settings-form.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveVerdictSettings, type FormState } from "./actions"

const initialState: FormState = { error: null }

export type ThresholdField = { key: string; label: string; value: number }
export type CheckField = { checkId: string; label: string; include: boolean }

export function SettingsForm({
  thresholds,
  checks,
}: {
  thresholds: ThresholdField[]
  checks: CheckField[]
}) {
  const [state, formAction, isPending] = useActionState(
    saveVerdictSettings,
    initialState
  )

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Пороги</h2>
        {thresholds.map((t) => (
          <div key={t.key} className="grid max-w-md gap-1.5">
            <Label htmlFor={t.key}>{t.label}</Label>
            <Input
              id={t.key}
              name={t.key}
              type="number"
              step="1"
              min="0"
              defaultValue={t.value}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Учитывать в вердикте</h2>
        {checks.map((c) => (
          <label key={c.checkId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={`include_${c.checkId}`}
              defaultChecked={c.include}
              className="accent-primary size-4"
            />
            {c.label}
          </label>
        ))}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняю…" : "Сохранить"}
      </Button>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}
```

И `app/settings/verdict/page.tsx`:

```tsx
// app/settings/verdict/page.tsx
import Link from "next/link"
import { CHECK_LABELS, type CheckId } from "@/lib/domain/verdict"
import { loadVerdictSettings } from "@/lib/verdicts"
import {
  SettingsForm,
  type CheckField,
  type ThresholdField,
} from "./settings-form"

export const dynamic = "force-dynamic"

const THRESHOLD_LABELS: Record<string, string> = {
  fundDeficitPercent: "Минус фонда: жёлтая зона до, % от плана недели",
  oldPartnerMonths: "«Давно не работали» после, месяцев",
  minOperationsForConstant: "«Постоянный контрагент» от, платежей",
}

export default async function VerdictSettingsPage() {
  const settings = await loadVerdictSettings()
  const thresholds: ThresholdField[] = Object.entries(settings.thresholds).map(
    ([key, value]) => ({ key, label: THRESHOLD_LABELS[key] ?? key, value })
  )
  const checks: CheckField[] = (
    Object.keys(settings.include) as CheckId[]
  ).map((checkId) => ({
    checkId,
    label: CHECK_LABELS[checkId],
    include: settings.include[checkId],
  }))

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link
          href="/requests"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← К реестру
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Настройки светофора</h1>
      <p className="text-muted-foreground text-sm">
        Пороги проверок и участие каждой проверки в общем вердикте. Изменения
        действуют сразу — вердикт вычисляется при открытии страниц.
      </p>
      <SettingsForm thresholds={thresholds} checks={checks} />
    </main>
  )
}
```

- [ ] **Step 3: Сид настроек (в `prisma/seed.ts`, перед вызовом `runSync`)**

```typescript
  // Настройки светофора: дефолты из домена.
  const thresholds: Array<{ key: string; value: number }> = [
    { key: "fundDeficitPercent", value: 20 },
    { key: "oldPartnerMonths", value: 12 },
    { key: "minOperationsForConstant", value: 3 },
  ]
  for (const t of thresholds) {
    await prisma.verdictThreshold.upsert({
      where: { key: t.key },
      update: {},
      create: t,
    })
  }
  const checkDefaults: Array<{ checkId: string; includeInVerdict: boolean }> = [
    { checkId: "funds", includeInVerdict: true },
    { checkId: "fund_balance", includeInVerdict: true },
    { checkId: "finplan", includeInVerdict: false },
    { checkId: "document", includeInVerdict: true },
    { checkId: "order_contract", includeInVerdict: true },
    { checkId: "partner", includeInVerdict: true },
    { checkId: "preapproved", includeInVerdict: false },
  ]
  for (const c of checkDefaults) {
    await prisma.verdictCheckSetting.upsert({
      where: { checkId: c.checkId },
      update: {},
      create: c,
    })
  }
  console.log("Seed: настройки светофора")
```

- [ ] **Step 4: Проверить вручную**

Run: `npx prisma db seed` → строка `Seed: настройки светофора`.
Открыть `http://localhost:3000/settings/verdict` (dev-сервер) — три порога,
семь чекбоксов, сохранение работает.

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/settings/ prisma/seed.ts
git commit -m "feat: страница настроек светофора — пороги и флаги вердикта"
```

---

### Task 9: Карточка — секции контекста и панель авто-проверки

Карточка становится двухколоночной: слева реквизиты (из плана 03) + секции
контекста, справа — панель вердикта и согласование. Каждая секция несёт
индикатор «своей» проверки.

**Files:**
- Modify: `app/requests/status.ts`
- Create: `app/requests/[uid]/verdict-panel.tsx`
- Create: `app/requests/[uid]/context-sections.tsx`
- Modify: `app/requests/[uid]/page.tsx`
- Test: `tests/e2e/verdict.spec.ts` (create)

- [ ] **Step 1: Ярлыки вердикта (добавить в конец `app/requests/status.ts`)**

```typescript
import type { CheckStatus, VerdictLevel } from "@/lib/domain/verdict"

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
```

- [ ] **Step 2: Панель вердикта**

```tsx
// app/requests/[uid]/verdict-panel.tsx
// Server component: вердикт + чек-лист проверок. Данные готовит lib/verdicts.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Verdict, VerdictLevel } from "@/lib/domain/verdict"
import { CHECK_DOT_CLASSES, VERDICT_PANEL_CLASSES } from "../status"

export function VerdictPanel({
  verdict,
  syncedAtText,
}: {
  verdict: Verdict
  syncedAtText: string | null
}) {
  const level = verdict.level as Exclude<VerdictLevel, "block">
  return (
    <Card className={`border-2 ${VERDICT_PANEL_CLASSES[level]}`}>
      <CardHeader>
        <CardTitle className="text-base">Авто-проверка: {verdict.title}</CardTitle>
        <p className="text-muted-foreground text-sm">{verdict.description}</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {verdict.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${CHECK_DOT_CLASSES[c.status]}`}
                aria-hidden
              />
              <span className={c.status === "info" ? "text-muted-foreground" : ""}>
                <span className="font-medium">{c.label}</span>
                {c.sublabel && (
                  <span className="text-muted-foreground"> — {c.sublabel}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {syncedAtText && (
          <p className="text-muted-foreground mt-4 text-xs">
            Срезы данных на {syncedAtText}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Секции контекста**

BigInt в клиентские props не передаётся, но эти компоненты — server components
(без `"use client"`), поэтому работаем с Prisma-типами напрямую.

```tsx
// app/requests/[uid]/context-sections.tsx
// Server components: секции контекста карточки. Каждая секция показывает
// индикатор «своей» проверки из вердикта; пустой срез — серое «нет данных».
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { toRub, type Verdict, type CheckId } from "@/lib/domain/verdict"
import type { RequestContext } from "@/lib/verdicts"
import type { PaymentRequest } from "@prisma/client"
import { CHECK_DOT_CLASSES, STATUS_CLASSES, STATUS_LABELS } from "../status"

function Dot({ verdict, id }: { verdict: Verdict; id: CheckId }) {
  const c = verdict.checks.find((x) => x.id === id)
  return (
    <span
      className={`size-2.5 shrink-0 rounded-full ${CHECK_DOT_CLASSES[c?.status ?? "info"]}`}
      aria-hidden
    />
  )
}

function Section({
  title,
  verdict,
  checkId,
  children,
}: {
  title: string
  verdict: Verdict
  checkId: CheckId | null
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {checkId && <Dot verdict={verdict} id={checkId} />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  )
}

const fmtRub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`

export function LiquiditySection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  if (ctx.balances.length === 0)
    return (
      <Section title="Ликвидность" verdict={ctx.verdict} checkId="funds">
        <p className="text-muted-foreground">Нет данных — срез остатков пуст.</p>
      </Section>
    )
  const amountRub = toRub(request.amountMinor, request.currency, ctx.rates)
  let groupRub = 0
  const rows = ctx.balances.map((b) => {
    const rub = toRub(b.balanceMinor, b.currency, ctx.rates) ?? 0
    groupRub += rub
    return { ...b, rub }
  })
  return (
    <Section title="Ликвидность" verdict={ctx.verdict} checkId="funds">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((b) => {
            const isDebit = b.accountUid === request.debitAccountUid
            const after =
              isDebit && b.currency === request.currency
                ? b.balanceMinor - request.amountMinor
                : null
            return (
              <tr key={b.accountUid} className={isDebit ? "font-medium" : ""}>
                <td className="py-1">
                  {b.orgName} · {b.accountName}
                  {isDebit && (
                    <Badge variant="outline" className="ml-2">
                      счёт списания
                    </Badge>
                  )}
                </td>
                <td className="py-1 text-right">
                  {formatMoneyBig(b.balanceMinor, b.currency)}
                  {after !== null && (
                    <span className="text-muted-foreground">
                      {" "}
                      → {formatMoneyBig(after, b.currency)}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
          <tr className="border-t font-medium">
            <td className="py-1">Группа, ₽ экв.</td>
            <td className="py-1 text-right">
              {fmtRub(groupRub)}
              {amountRub !== null && (
                <span className="text-muted-foreground">
                  {" "}
                  → {fmtRub(groupRub - amountRub)}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

export function FundSection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  const fund = ctx.fund
  return (
    <Section
      title={`Фонд${request.fund ? ` «${request.fund}»` : ""}`}
      verdict={ctx.verdict}
      checkId="fund_balance"
    >
      {!fund ? (
        <p className="text-muted-foreground">Нет данных по фонду.</p>
      ) : (
        <div className="space-y-1">
          <p>
            План недели: {formatMoneyBig(fund.planWeekMinor)} · Факт:{" "}
            {formatMoneyBig(fund.factWeekMinor)} · Остаток:{" "}
            {formatMoneyBig(fund.balanceMinor)}
          </p>
          <p className="text-muted-foreground">
            Эта заявка изменит остаток на −
            {formatMoneyBig(request.amountMinor, request.currency)}.
          </p>
        </div>
      )}
    </Section>
  )
}

export function PartnerSection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  const p = ctx.partner
  const payments = p
    ? (p.recentPayments as Array<{
        date: string
        basis: string
        amountMinor: string
      }>)
    : []
  return (
    <Section title="Контрагент" verdict={ctx.verdict} checkId="partner">
      <div className="space-y-2">
        <p className="flex items-center gap-2">
          <span className="font-medium">{request.partnerName}</span>
          {p?.chatUrl && (
            <a
              href={p.chatUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4"
            >
              💬 чат
            </a>
          )}
        </p>
        {!p ? (
          <p className="text-muted-foreground">
            Истории нет — контрагент отсутствует в срезе взаиморасчётов.
          </p>
        ) : (
          <>
            <p>
              Платежей: {p.paymentCount}
              {p.firstOperationAt &&
                ` · работаем с ${formatDate(p.firstOperationAt)}`}{" "}
              · всего {formatMoneyBig(p.totalPaidMinor)}
            </p>
            <p className="text-muted-foreground">
              Дебиторка: {formatMoneyBig(p.receivableMinor)} · Кредиторка:{" "}
              {formatMoneyBig(p.payableMinor)}
            </p>
            {payments.length > 0 && (
              <ul className="text-muted-foreground space-y-0.5">
                {payments.map((pay, i) => (
                  <li key={i}>
                    {formatDate(new Date(pay.date))} · {pay.basis} ·{" "}
                    {formatMoneyBig(BigInt(pay.amountMinor))}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

export function OrderSection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  const { order, contract } = ctx
  // Процент — в валюте заказа (в данных 1С валюта заявки совпадает с валютой
  // заказа); точный мультивалютный расчёт делает checkOrderContract в домене.
  const percent =
    order && order.amountMinor > 0n
      ? Number(((order.paidMinor + request.amountMinor) * 100n) / order.amountMinor)
      : null
  return (
    <Section title="Заказ / Основание" verdict={ctx.verdict} checkId="order_contract">
      <div className="space-y-2">
        {contract && (
          <p className="text-muted-foreground">
            Договор №{contract.number} от {formatDate(contract.date)} ·{" "}
            {contract.isActive ? "действует" : "закрыт"} · задолженность{" "}
            {formatMoneyBig(contract.debtMinor, contract.currency)}
          </p>
        )}
        {order ? (
          <>
            <p className="font-medium">
              Заказ №{order.number}: {formatMoneyBig(order.amountMinor, order.currency)}
            </p>
            <p>
              Оплачено ранее: {formatMoneyBig(order.paidMinor, order.currency)} · с
              этим платежом: {percent !== null ? `${percent}%` : "—"}
            </p>
            {percent !== null && (
              <div className="bg-muted h-2 w-full overflow-hidden rounded">
                <div
                  className={percent > 100 ? "h-2 bg-red-500" : "h-2 bg-green-500"}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Заказ поставщику не привязан{contract ? " (основание — договор)" : ""}.
          </p>
        )}
      </div>
    </Section>
  )
}

export function AttachmentsSection({ ctx }: { ctx: RequestContext }) {
  return (
    <Section title="Вложения" verdict={ctx.verdict} checkId="document">
      {ctx.attachments.length === 0 ? (
        <p className="text-muted-foreground">Вложений нет.</p>
      ) : (
        <ul className="space-y-1">
          {ctx.attachments.map((a) => (
            <li key={a.id}>
              {a.fileName}
              {a.fileType && (
                <span className="text-muted-foreground"> · {a.fileType}</span>
              )}
              <span className="text-muted-foreground">
                {" "}
                · {formatDate(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground mt-2 text-xs">
        Метаданные из 1С; скачивание файлов появится с методом API 1С.
      </p>
    </Section>
  )
}

export function RelatedSection({ ctx }: { ctx: RequestContext }) {
  return (
    <Section title="Связанные заявки ±30 дней" verdict={ctx.verdict} checkId={null}>
      {ctx.related.length === 0 ? (
        <p className="text-muted-foreground">Связанных заявок нет.</p>
      ) : (
        <ul className="space-y-1">
          {ctx.related.map((r) => (
            <li key={r.uid} className="flex items-center gap-2">
              <Link
                href={`/requests/${r.uid}`}
                className="text-primary underline underline-offset-4"
              >
                {r.number}
              </Link>
              <span>{formatDate(r.payDate)}</span>
              <span>{formatMoneyBig(r.amountMinor, r.currency)}</span>
              <Badge className={STATUS_CLASSES[r.executionStatus]}>
                {STATUS_LABELS[r.executionStatus]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
```

- [ ] **Step 4: Пересобрать `app/requests/[uid]/page.tsx`**

Изменения относительно версии плана 03 (существующие карточки «Реквизиты»,
«Согласование», «Исполнение», «Комментарии бухгалтера» сохраняются как есть):

1. Добавить импорты:

```tsx
import { loadRequestContext } from "@/lib/verdicts"
import {
  AttachmentsSection,
  FundSection,
  LiquiditySection,
  OrderSection,
  PartnerSection,
  RelatedSection,
} from "./context-sections"
import { VerdictPanel } from "./verdict-panel"
```

2. После загрузки `request` (и `notFound()`) добавить:

```tsx
  const ctx = await loadRequestContext(request)
  const syncedAtText = ctx.oldestSyncedAt
    ? ctx.oldestSyncedAt.toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        dateStyle: "short",
        timeStyle: "short",
      })
    : null
```

3. В шапке (рядом с существующими Badge статуса и «Срочная») добавить чипы
   проблемных проверок и руководителя отдела:

```tsx
        {ctx.verdict.checks
          .filter((c) => c.status === "warn" || c.status === "bad")
          .map((c) => (
            <Badge key={c.id} variant="outline">
              {c.label}
            </Badge>
          ))}
```

В карточку «Реквизиты» (в `<dl>`) добавить пару после «Инициатор»:

```tsx
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Руководитель отдела</dt>
              <dd>{request.initiatorHead ?? "—"}</dd>
            </div>
```

4. Обернуть содержимое в две колонки. Итоговая структура `return`:

```tsx
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      {/* ← К реестру и шапка — без изменений */}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {/* Карточка «Реквизиты» (из плана 03) */}
          <LiquiditySection request={request} ctx={ctx} />
          <FundSection request={request} ctx={ctx} />
          <PartnerSection request={request} ctx={ctx} />
          <OrderSection request={request} ctx={ctx} />
          <AttachmentsSection ctx={ctx} />
          {/* Карточка «Исполнение» (из плана 03) */}
          {/* Карточка «Комментарии бухгалтера» (из плана 03) */}
          <RelatedSection ctx={ctx} />
        </div>
        <div className="space-y-6">
          <VerdictPanel verdict={ctx.verdict} syncedAtText={syncedAtText} />
          {/* Карточка «Согласование» (из плана 03) — переносится сюда */}
        </div>
      </div>
    </main>
  )
```

`max-w-4xl` в `<main>` заменить на `max-w-6xl` (двухколоночная сетка).

- [ ] **Step 5: E2e**

```typescript
// tests/e2e/verdict.spec.ts
// Светофор: карточка, реестр, настройки. Serial: тест настроек меняет
// глобальное состояние и восстанавливает его в конце.
import { expect, test } from "@playwright/test"
import { syncFixtureData } from "./helpers"

test.describe.configure({ mode: "serial" })

test("карточка REQ-0004: вердикт «Можно согласовать» и секции контекста", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await expect(
    page.getByText("Авто-проверка: Можно согласовать")
  ).toBeVisible()
  await expect(page.getByText("Денег на счёте достаточно")).toBeVisible()
  await expect(page.getByText("Постоянный контрагент")).toBeVisible()
  await expect(page.getByText("Заказ №78", { exact: false })).toBeVisible()
  await expect(page.getByText("invoice_78.pdf")).toBeVisible()
  await expect(
    page.getByText("нет данных — финмодель вне DWH").first()
  ).toBeVisible() // деградация: серые проверки финплана
  await expect(page.getByText("счёт списания")).toBeVisible()
})

test("карточка REQ-0007: «Требует внимания» — новый поставщик без основания", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0007" }).click()
  await expect(page.getByText("Авто-проверка: Требует внимания")).toBeVisible()
  await expect(page.getByText("Новый поставщик")).toBeVisible()
  await expect(page.getByText("Нет основания")).toBeVisible()
  await expect(page.getByText("Нет ни заказа, ни договора")).toBeVisible()
})
```

- [ ] **Step 6: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/verdict.spec.ts`
Expected: PASS (2 теста).

- [ ] **Step 7: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/ tests/e2e/verdict.spec.ts
git commit -m "feat: карточка заявки — секции контекста и панель авто-проверки"
```

---

### Task 10: Реестр — колонка вердикта, «только 🟢» массово, новые фильтры

**Files:**
- Modify: `app/requests/page.tsx`
- Modify: `app/requests/requests-table.tsx`
- Modify: `app/requests/actions.ts`
- Test: `tests/e2e/verdict.spec.ts`, `tests/e2e/requests.spec.ts` (актуализация)

- [ ] **Step 1: Вердикты в `app/requests/page.tsx`**

1. Импорты:

```tsx
import { computeVerdicts } from "@/lib/verdicts"
import { VERDICT_DOT_CLASSES } from "./status"
import type { VerdictLevel } from "@/lib/domain/verdict"
```

2. После загрузки `requests` (перед маппингом в `rows`):

```tsx
  // Вердикт нужен только заявкам на согласовании (решение ещё не принято).
  const onApproval = requests.filter(
    (r) => r.approvalStatus === "on_approval" && !r.isDeletedIn1c
  )
  const { verdicts, rates } = await computeVerdicts(onApproval)
```

3. В `buildQuery` в список ключей добавить `"partner"` и `"problems"`:

```tsx
  for (const key of ["status", "org", "fund", "from", "to", "partner", "problems"]) {
```

4. Чтение новых параметров рядом с остальными:

```tsx
  const partner = param(sp, "partner")
  const problems = param(sp, "problems")
```

5. Фильтр по контрагенту — в `where` (после `...(fund ? ... )`):

```tsx
    ...(partner ? { partnerName: partner } : {}),
```

6. Список контрагентов для фильтра — в общий `Promise.all` рядом с `orgs`/`funds`:

```tsx
    prisma.paymentRequest.findMany({
      where: { isDeletedIn1c: false, partnerName: { not: null } },
      distinct: ["partnerName"],
      select: { partnerName: true },
      orderBy: { partnerName: "asc" },
    }),
```

(результат — в переменную `partners`.)

7. Маппинг `rows`: verdикт и признаки (заменить прежнее `canSelect`):

```tsx
  const visible = problems
    ? requests.filter((r) => verdicts.get(r.uid)?.level === "bad")
    : requests

  const rows: RequestRow[] = visible.map((r) => {
    const verdict = verdicts.get(r.uid) ?? null
    return {
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
      verdictLevel: (verdict?.level ?? null) as Exclude<VerdictLevel, "block"> | null,
      verdictTitle: verdict?.title ?? "",
      verdictDotClass: verdict
        ? VERDICT_DOT_CLASSES[verdict.level as Exclude<VerdictLevel, "block">]
        : "",
      // Массово — только 🟢 (ТЗ §6.4): чекбокс есть только у зелёных.
      canSelect: r.approvalStatus === "on_approval" && verdict?.level === "ok",
    }
  })
```

8. В форму фильтров добавить (после селекта «Фонд»):

```tsx
        <div className="grid gap-1.5">
          <label htmlFor="partner" className="text-sm font-medium">
            Контрагент
          </label>
          <select
            id="partner"
            name="partner"
            defaultValue={partner}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="">Все</option>
            {partners.map((p) => (
              <option key={p.partnerName} value={p.partnerName ?? ""}>
                {p.partnerName}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="problems"
            value="1"
            defaultChecked={problems === "1"}
            className="accent-primary size-4"
          />
          Только красные флаги
        </label>
```

и в скрытые поля формы добавить сохранение текущего статуса — уже есть;
`problems` передаётся самим чекбоксом.

- [ ] **Step 2: Колонка вердикта в `app/requests/requests-table.tsx`**

1. В тип `RequestRow` добавить:

```tsx
  verdictLevel: "ok" | "warn" | "bad" | null
  verdictTitle: string
  verdictDotClass: string
```

2. В `<TableHeader>` добавить первой колонкой после чекбокса:

```tsx
            <TableHead className="w-10">Светофор</TableHead>
```

3. В теле таблицы после ячейки с чекбоксом:

```tsx
              <TableCell>
                {r.verdictLevel && (
                  <span
                    className={`inline-block size-3 rounded-full ${r.verdictDotClass}`}
                    title={r.verdictTitle}
                    aria-label={`Вердикт: ${r.verdictTitle}`}
                  />
                )}
              </TableCell>
```

4. `colSpan` пустой строки увеличить с 8 до 9.

5. Ячейку чекбокса дополнить подсказкой для незелёных на согласовании:
   заменить содержимое первой `<TableCell>`:

```tsx
              <TableCell>
                {r.canSelect ? (
                  <input
                    type="checkbox"
                    name="uids"
                    value={r.uid}
                    aria-label={`Выбрать ${r.number}`}
                    className="accent-primary size-4"
                  />
                ) : r.verdictLevel && r.verdictLevel !== "ok" ? (
                  <span
                    className="text-muted-foreground cursor-not-allowed text-xs"
                    title="Только через карточку: вердикт не зелёный"
                  >
                    —
                  </span>
                ) : null}
              </TableCell>
```

6. Подпись кнопки уточнить:

```tsx
            {isPending ? "Отправляю в 1С…" : "Согласовать выбранные (только 🟢)"}
```

- [ ] **Step 3: Guard в `app/requests/actions.ts`**

В `bulkApproveRequests` после загрузки `requests` (и проверки на пустоту)
добавить серверную проверку вердикта (клиент мог подделать форму):

```typescript
import { computeVerdicts } from "@/lib/verdicts"
```

```typescript
  const { verdicts } = await computeVerdicts(requests)
  const notGreen = requests.filter(
    (r) => verdicts.get(r.uid)?.level !== "ok"
  )
  if (notGreen.length > 0)
    return {
      error: `Массово можно согласовать только зелёные заявки. Через карточку: ${notGreen
        .map((r) => r.number)
        .join(", ")}`,
    }
```

- [ ] **Step 4: Актуализировать e2e массового согласования в `tests/e2e/requests.spec.ts`**

REQ-0006 теперь 🟡, REQ-0007 — 🔴: чекбокс есть только у REQ-0004.
Заменить тело теста `"массовое согласование выбранных заявок (mock 1С)"`:

```typescript
test("массовое согласование выбранных заявок (mock 1С)", async ({ page }) => {
  await syncFixtureData(page)
  // Чекбоксы только у зелёных: REQ-0006 (🟡) и REQ-0007 (🔴) недоступны.
  await expect(page.getByLabel("Выбрать REQ-0006")).toHaveCount(0)
  await expect(page.getByLabel("Выбрать REQ-0007")).toHaveCount(0)
  await page.getByLabel("Выбрать REQ-0004").check()
  await page
    .getByRole("button", { name: "Согласовать выбранные (только 🟢)" })
    .click()
  await expect(page.getByLabel("Выбрать REQ-0004")).toHaveCount(0)
})
```

- [ ] **Step 5: E2e вердиктов в реестре (добавить в `tests/e2e/verdict.spec.ts`)**

```typescript
test("реестр: точки вердикта и фильтр «красные флаги»", async ({ page }) => {
  await syncFixtureData(page)
  await expect(
    page.getByLabel("Вердикт: Можно согласовать").first()
  ).toBeVisible()
  await expect(
    page.getByLabel("Вердикт: Требует внимания").first()
  ).toBeVisible()
  await page.getByText("Только красные флаги").click()
  await page.getByRole("button", { name: "Применить" }).click()
  await expect(page.getByRole("link", { name: "REQ-0007" })).toBeVisible()
  await expect(page.getByRole("link", { name: "REQ-0004" })).toHaveCount(0)
})

test("настройки: порог «постоянного» меняет вердикт (и восстанавливается)", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.goto("/settings/verdict")
  const minOps = page.getByLabel("«Постоянный контрагент» от, платежей")
  await minOps.fill("20")
  await page.getByRole("button", { name: "Сохранить" }).click()
  await page.waitForLoadState("networkidle")

  // Guangzhou (12 платежей) перестал быть «постоянным» → REQ-0004 теперь 🟡.
  await page.goto("/requests")
  await expect(page.getByLabel("Выбрать REQ-0004")).toHaveCount(0)
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await expect(
    page.getByText("Авто-проверка: Можно согласовать с оговоркой")
  ).toBeVisible()

  // Восстановить дефолт, чтобы не влиять на другие тесты.
  await page.goto("/settings/verdict")
  await minOps.fill("3")
  await page.getByRole("button", { name: "Сохранить" }).click()
  await page.waitForLoadState("networkidle")
})
```

Примечание: тест настроек предполагает, что REQ-0004 ещё `on_approval`.
Если гонять весь файл после теста массового согласования из
`requests.spec.ts` — данные вернёт `syncFixtureData` (fixture-синк
восстанавливает `approvalStatus` из выгрузки при каждом запуске).

- [ ] **Step 6: Запустить e2e**

Run: `npm run test:e2e`
Expected: PASS (все тесты обоих spec-файлов).

- [ ] **Step 7: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/ tests/e2e/
git commit -m "feat: вердикты в реестре — колонка светофора, массово только зелёные, фильтры"
```

---

### Task 11: Реестр — метрики и панель «Остатки и фонды» с проекцией

Сводка внутри реестра (решение спеки §3): полоса метрик + сворачиваемая
панель. Проекция «после отмеченных» считается на клиенте от чекбоксов.

**Files:**
- Modify: `app/requests/page.tsx`
- Modify: `app/requests/requests-table.tsx`
- Test: `tests/e2e/verdict.spec.ts`

- [ ] **Step 1: Метрики и данные панели в `app/requests/page.tsx`**

1. К импортам добавить:

```tsx
import { toRub } from "@/lib/domain/verdict"
import { Card, CardContent } from "@/components/ui/card"
```

2. Строку из Task 10 `const { verdicts } = await computeVerdicts(onApproval)`
   заменить на:

```tsx
  const { verdicts, rates } = await computeVerdicts(onApproval)
```

3. В `Promise.all` добавить загрузку срезов панели:

```tsx
    prisma.accountBalance.findMany({ orderBy: [{ orgName: "asc" }, { accountName: "asc" }] }),
    prisma.fundSnapshot.findMany({ orderBy: { name: "asc" } }),
```

(результаты — в переменные `accountBalances` и `fundSnapshots`.)

4. Расчёт метрик (после `computeVerdicts`):

```tsx
  const fmtRub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const urgentCount = onApproval.filter((r) => r.importance === 1).length
  const sum7DaysRub = onApproval
    .filter((r) => r.payDate <= in7Days)
    .reduce((sum, r) => sum + (toRub(r.amountMinor, r.currency, rates) ?? 0), 0)
  const redFlags = onApproval.filter(
    (r) => verdicts.get(r.uid)?.level === "bad"
  )
  const redFlagsSumRub = redFlags.reduce(
    (sum, r) => sum + (toRub(r.amountMinor, r.currency, rates) ?? 0),
    0
  )
  const groupBalanceRub = accountBalances.reduce(
    (sum, b) => sum + (toRub(b.balanceMinor, b.currency, rates) ?? 0),
    0
  )

  const metrics = [
    {
      label: "На согласовании",
      value: `${onApproval.length}${urgentCount ? ` · ${urgentCount} срочных` : ""}`,
    },
    { label: "К оплате за 7 дней", value: fmtRub(sum7DaysRub) },
    {
      label: "Красные флаги",
      value: redFlags.length
        ? `${redFlags.length} · ${fmtRub(redFlagsSumRub)}`
        : "нет",
      href: "/requests?problems=1",
    },
    {
      label: "Остаток группы",
      value: accountBalances.length ? fmtRub(groupBalanceRub) : "нет данных",
    },
  ]
```

5. Данные панели для клиента (BigInt → number; суммы копеек до ~90 трлн ₽
   в number точны до рубля):

```tsx
  const accounts = accountBalances.map((b) => ({
    accountUid: b.accountUid,
    label: `${b.orgName} · ${b.accountName}`,
    currency: b.currency,
    balanceMinorNum: Number(b.balanceMinor),
    balanceRubNum: toRub(b.balanceMinor, b.currency, rates) ?? 0,
  }))
  const fundCards = fundSnapshots.map((f) => ({
    name: f.name,
    planText: formatMoneyBig(f.planWeekMinor),
    factText: formatMoneyBig(f.factWeekMinor),
    balanceText: formatMoneyBig(f.balanceMinor),
    negative: f.balanceMinor < 0n,
    href: buildQuery(sp, { fund: f.name }),
  }))
```

6. В `rows` (маппинг из Task 10) добавить поля для проекции:

```tsx
      debitAccountUid: r.debitAccountUid,
      currency: r.currency,
      amountMinorNum: Number(r.amountMinor),
      amountRubNum: toRub(r.amountMinor, r.currency, rates) ?? 0,
```

7. Полоса метрик в JSX (после заголовка, перед фильтрами-статусами):

```tsx
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs">{m.label}</p>
              {m.href ? (
                <Link href={m.href} className="text-lg font-semibold underline-offset-4 hover:underline">
                  {m.value}
                </Link>
              ) : (
                <p className="text-lg font-semibold">{m.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
```

8. Передать панель в таблицу:

```tsx
      <RequestsTable rows={rows} accounts={accounts} funds={fundCards} />
```

- [ ] **Step 2: Панель с проекцией в `app/requests/requests-table.tsx`**

1. Дополнить типы и props:

```tsx
export type AccountRow = {
  accountUid: string
  label: string
  currency: string
  balanceMinorNum: number
  balanceRubNum: number
}

export type FundCardRow = {
  name: string
  planText: string
  factText: string
  balanceText: string
  negative: boolean
  href: string
}
```

В `RequestRow` добавить:

```tsx
  debitAccountUid: string | null
  currency: string
  amountMinorNum: number
  amountRubNum: number
```

2. Компонент получает состояние выбора (замена сигнатуры и начало функции):

```tsx
import { useActionState, useState } from "react"

export function RequestsTable({
  rows,
  accounts,
  funds,
}: {
  rows: RequestRow[]
  accounts: AccountRow[]
  funds: FundCardRow[]
}) {
  const [state, formAction, isPending] = useActionState(
    bulkApproveRequests,
    initialState
  )
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const selectable = rows.filter((r) => r.canSelect)

  const fmtMoney = (minor: number, currency: string) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
      minor / 100
    )
  const fmtRub = (n: number) =>
    `${Math.round(n).toLocaleString("ru-RU")} ₽`

  const selectedRows = rows.filter((r) => selected.has(r.uid))
  const afterByAccount = new Map(
    accounts.map((a) => {
      const debit = selectedRows
        .filter(
          (r) => r.debitAccountUid === a.accountUid && r.currency === a.currency
        )
        .reduce((sum, r) => sum + r.amountMinorNum, 0)
      return [a.accountUid, a.balanceMinorNum - debit] as const
    })
  )
  const groupRub = accounts.reduce((sum, a) => sum + a.balanceRubNum, 0)
  const groupAfterRub =
    groupRub - selectedRows.reduce((sum, r) => sum + r.amountRubNum, 0)
```

3. Обработчик изменения чекбоксов — на `<form>`:

```tsx
    <form
      action={formAction}
      className="space-y-3"
      onChange={(e) => {
        const t = e.target as HTMLInputElement
        if (t.name !== "uids") return
        setSelected((prev) => {
          const next = new Set(prev)
          if (t.checked) next.add(t.value)
          else next.delete(t.value)
          return next
        })
      }}
    >
```

4. Панель — первым элементом внутри формы (перед `<Table>`):

```tsx
      {(accounts.length > 0 || funds.length > 0) && (
        <details className="rounded-md border">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Остатки и фонды
          </summary>
          <div className="grid gap-4 p-4 lg:grid-cols-[3fr_2fr]">
            <div>
              <p className="text-muted-foreground mb-2 text-xs">
                Остатки по счетам — до / после отмеченных
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {accounts.map((a) => {
                    const after = afterByAccount.get(a.accountUid) ?? a.balanceMinorNum
                    return (
                      <tr key={a.accountUid}>
                        <td className="py-0.5">{a.label}</td>
                        <td className="py-0.5 text-right tabular-nums">
                          {fmtMoney(a.balanceMinorNum, a.currency)}
                          <span
                            className={
                              after < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }
                          >
                            {" "}
                            → {fmtMoney(after, a.currency)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t font-medium">
                    <td className="py-0.5">Группа, ₽ экв.</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {fmtRub(groupRub)}
                      <span
                        className={
                          groupAfterRub < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }
                      >
                        {" "}
                        → {fmtRub(groupAfterRub)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-xs">
                Фонды: план недели · факт · остаток (клик — фильтр)
              </p>
              <ul className="space-y-1 text-sm">
                {funds.map((f) => (
                  <li key={f.name}>
                    <Link
                      href={f.href}
                      className="underline-offset-4 hover:underline"
                    >
                      {f.name}
                    </Link>
                    : {f.planText} · {f.factText} ·{" "}
                    <span className={f.negative ? "font-medium text-red-600" : ""}>
                      {f.balanceText}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}
```

- [ ] **Step 3: E2e (добавить в `tests/e2e/verdict.spec.ts`)**

```typescript
test("реестр: метрики и панель остатков с проекцией", async ({ page }) => {
  await syncFixtureData(page)
  await expect(page.getByText("На согласовании")).toBeVisible()
  await expect(page.getByText("К оплате за 7 дней")).toBeVisible()
  await expect(page.getByText("Остаток группы")).toBeVisible()

  await page.getByText("Остатки и фонды").click()
  // До выбора: Сбербанк ₽ ТОРИ БРЭНДС — 40 000 000 → 40 000 000
  // Intl ru-RU разделяет разряды неразрывными пробелами → матчим через \s.
  const toriRow = page.getByRole("row", {
    name: /ТОРИ БРЭНДС ООО · Сбербанк ₽/,
  })
  await expect(toriRow).toContainText(/40\s000\s000,00\s₽\s→\s40\s000\s000,00\s₽/)
  // Отметили REQ-0004 (25,7 млн со Сбер ₽) → проекция уменьшилась
  await page.getByLabel("Выбрать REQ-0004").check()
  await expect(toriRow).toContainText(/→\s14\s300\s000,00\s₽/)

  // Фонд в минусе виден, клик по фонду фильтрует
  await expect(page.getByText("Маркетинг", { exact: false })).toBeVisible()
  await page.getByRole("link", { name: "Закупки товара" }).click()
  await expect(page.getByRole("link", { name: "REQ-0004" })).toBeVisible()
  await expect(page.getByRole("link", { name: "REQ-0007" })).toHaveCount(0)
})
```

- [ ] **Step 4: Запустить e2e**

Run: `npm run test:e2e`
Expected: PASS (все тесты).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/requests/
git commit -m "feat: сводка в реестре — метрики, остатки с проекцией, карточки фондов"
```

---

### Task 12: Навигация и финальный прогон

**Files:**
- Modify: `app/requests/page.tsx`

- [ ] **Step 1: Ссылка на настройки светофора**

В шапке реестра (`app/requests/page.tsx`), в `div` со строкой свежести данных
и кнопкой «Обновить», добавить перед формой «Обновить»:

```tsx
          <Link
            href="/settings/verdict"
            className="underline underline-offset-4"
          >
            Настройки светофора
          </Link>
```

- [ ] **Step 2: Полный прогон**

Run: `npm run format && npm run lint && npm run typecheck && npm run test && npm run test:e2e`
Expected: всё зелёное (unit домена ~36 в verdict.test.ts + прежние; e2e оба spec-файла).

- [ ] **Step 3: Commit**

```bash
git add app/requests/page.tsx
git commit -m "feat: ссылка на настройки светофора из реестра"
```

---

## Что считается готовым (Definition of Done)

- На fixture-данных: REQ-0004 — 🟢 (все проверки зелёные, финплан серый
  «нет данных»), REQ-0006 — 🟡 (нужен перевод, эпизодический контрагент),
  REQ-0007 — 🔴 (новый поставщик, нет основания, нет договора).
- Карточка: секции «Ликвидность», «Фонд», «Контрагент», «Заказ/Основание»,
  «Вложения», «Связанные заявки» + панель авто-проверки с чек-листом
  и свежестью срезов.
- Реестр: колонка светофора, метрики, панель «Остатки и фонды» с проекцией
  «после отмеченных», фильтры «контрагент» и «только красные флаги»;
  массовое согласование доступно только 🟢 (и клиент, и сервер).
- Настройки порогов и флагов «учитывать в вердикте» работают и действуют
  сразу; сид создаёт дефолты.
- Синк срезов независим по шагам, отчёт в `SyncRun.slices`; источники
  переключаются env `SLICE_*_SOURCE` (боевые адаптеры — план DWH).
- Все unit-тесты домена и e2e зелёные; полный прогон проверок проходит.






