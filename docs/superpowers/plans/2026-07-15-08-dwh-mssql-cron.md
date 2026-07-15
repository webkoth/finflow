# План 8: Боевой DWH (mssql) и cron-синк — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить fixture-источники боевыми: mssql-адаптер `DwhGateway` (заявки, списания) и DWH-адаптеры срезов светофора через SSH-туннель к DEEONE, 1С-адаптеры срезов (остатки/фонды/курсы) через REST API, плюс cron-расписание синка на сервере.

**Architecture:** Контракт вьюх задаём мы (документ для заказа владельцу DWH) — вьюхи отдают уже нормализованные колонки (bigint-копейки, enum-статусы), поэтому адаптеры тривиальны: параметризованный SELECT + чистые мапперы строк (unit-тесты). Подключение — npm `mssql` (одобрен в спеке заявок §4) к локальному порту SSH-туннеля (systemd-unit, цепочка VPS → host02 → ai01 → DEEONE). Срезы balances/rates/funds читаются готовыми методами REST API 1С (Bearer). Переключение источников — существующие env (`DWH_MODE`, `SLICE_*_SOURCE`), код фабрик уже готов (планы 03 и 06).

**Tech Stack:** Next.js, TypeScript, Prisma, **mssql** (новая зависимость, одобрена), systemd + cron на VPS, Vitest.

**Спеки:** `2026-07-14-payment-requests-design.md` (§4, §7), `2026-07-14-verdict-traffic-light-design.md` (§4, §11).

**Зависимости:** планы 03 и 06 реализованы (фабрики `getDwhGateway`, `getSliceFetchers`, синк и срезы существуют).

**Блокирующие предпосылки (закрываются с людьми, код пишется до них):**
1. **Вьюхи DEEONE по нашему контракту** (Task 1 — документ заказа владельцу DWH).
2. **SQL-логин/пароль** для finflow (сейчас доступ через Kerberos на ai01 — SQL-аутентификацию нужно запросить у BD-команды).
3. **TCP-маршрут**: адрес сервера DEEONE, достижимость его порта 1433 с ai01, SSH-доступ с VPS к host02 (ключ).
4. **Фактические схемы ответов** `get/balance`, `get/fund`, `get/currencyRate` (Task 6 — снять curl'ом, поправить мапперы при расхождении).

До закрытия предпосылок всё работает в fixture-режиме; включение боевого — env на сервере, без правок кода.

**Правила репозитория, которые действуют в каждой задаче** (из `CLAUDE.md`):
- Перед каждым коммитом: `npm run format && npm run lint && npm run typecheck && npm run test`.
- `lib/domain/` и чистые мапперы — unit-тесты рядом; I/O-обёртки без unit-тестов.
- Новая npm-зависимость `mssql` — одобрена Минасом в спеке заявок §4; других не добавлять.
- Интерфейс на русском, код на английском, conventional commits с русским описанием.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `docs/contracts/dwh-views.md` (create) | Контракт шести вьюх DEEONE — документ для заказа владельцу DWH |
| `docs/contracts/one-c-slices.md` (create) | Что снять с методов API 1С и куда положить примеры ответов |
| `lib/integrations/dwh-mssql-map.ts` (create) | Чистые мапперы строк вьюх → типы `DwhGateway`/срезов (unit-тесты рядом) |
| `lib/integrations/dwh-mssql.ts` (create) | Пул mssql, `mssqlDwhGateway` (fetchRequests/fetchDebits) |
| `lib/integrations/dwh.ts` (modify) | Режим `mssql` в фабрике |
| `lib/integrations/slices-dwh.ts` (create) | DWH-фетчеры срезов partners/contracts/orders/attachments |
| `lib/integrations/one-c-slices-map.ts` (create) | Чистые нормализаторы ответов API 1С (unit-тесты рядом) |
| `lib/integrations/slices-one-c.ts` (create) | 1С-фетчеры срезов balances/rates/funds (Bearer, timeout) |
| `lib/integrations/slices.ts` (modify) | Источники `dwh` и `1c` в фабрике `pick` |
| `scripts/dwh-probe.ts` (create) | Ручная проверка подключения: счётчики строк по вьюхам |
| `ops/finflow-dwh-tunnel.service` (create) | systemd-unit SSH-туннеля |
| `ops/crontab.finflow` (create) | Расписание синка (МСК, будни) |
| `ops/README.md` (create) | Памятка установки туннеля, крона и env на сервере |
| `.env.example` (modify) | Переменные mssql/вьюх |
| `package.json` (modify) | Зависимость `mssql`, скрипт `dwh:probe` |

---

### Task 1: Контракт вьюх DEEONE (документ заказа)

Ключевое решение: **нормализация — внутри вьюх** (BD-команда владеет схемой 1С,
мы — контрактом). Адаптерам остаётся типобезопасный маппинг.

**Files:**
- Create: `docs/contracts/dwh-views.md`

- [ ] **Step 1: Написать документ**

```markdown
# Контракт вьюх DEEONE для finflow

Заказ владельцу DWH. Все вьюхи — в базе DEEONE, схема `dbo`, префикс
`v_finflow_`. Общие правила:

- Деньги — **BIGINT, копейки** (рубли × 100), без NULL (0, если нет данных).
- Даты — тип **date** (день) или **datetime2(0) в UTC** (момент).
- Строковые идентификаторы 1С (UID) — nvarchar(36).
- Кодировки статусов нормализуются в самой вьюхе до перечислений ниже.
- NULL допустим только в колонках, помеченных «nullable».

## 1. v_finflow_requests — заявки на расход ДС

| Колонка | Тип | Описание |
|---|---|---|
| uid | nvarchar(36) | UID документа, ключ |
| number | nvarchar(20) | Номер |
| date | datetime2(0) | Дата документа (UTC) |
| org_name | nvarchar(200) | Юрлицо |
| org_inn | nvarchar(12), nullable | |
| org_uid | nvarchar(36), nullable | |
| initiator | nvarchar(200), nullable | Инициатор |
| initiator_head | nvarchar(200), nullable | Руководитель отдела инициатора |
| department | nvarchar(200), nullable | |
| amount_minor | bigint | Сумма в копейках |
| currency | nvarchar(3) | ISO: RUB, USD, CNY |
| cash_flow_item | nvarchar(200), nullable | Статья ДДС |
| fund | nvarchar(200), nullable | Фонд |
| partner_name | nvarchar(200), nullable | |
| partner_inn | nvarchar(12), nullable | |
| partner_uid | nvarchar(36), nullable | |
| pay_date | date | Плановая дата оплаты |
| approval_status | nvarchar(20) | **Только**: on_approval / approved / declined |
| importance | int | 1 = срочная, иначе 0 |
| comment | nvarchar(max), nullable | |
| debit_account_uid | nvarchar(36), nullable | Счёт списания |
| contract_uid | nvarchar(36), nullable | Договор |
| order_uid | nvarchar(36), nullable | Заказ поставщику |

Фильтр потребителя: `WHERE date >= @since` (параметр, скользящее окно 90 дней).

## 2. v_finflow_debits — списания («Расход ДС»)

| Колонка | Тип | Описание |
|---|---|---|
| doc_uid | nvarchar(36) | UID документа, ключ |
| date | datetime2(0) | Дата списания (UTC) |
| amount_minor | bigint | |
| bank_account | nvarchar(40), nullable | Номер счёта |
| bank_name | nvarchar(200), nullable | |
| request_uid | nvarchar(36) | UID заявки-основания |

## 3. v_finflow_partner_stats — история контрагентов

| Колонка | Тип | Описание |
|---|---|---|
| partner_uid | nvarchar(36) | Ключ |
| first_operation_at | date, nullable | Первая операция |
| last_payment_at | date, nullable | Последний платёж |
| payment_count | int | Кол-во платежей за всю историю |
| total_paid_minor | bigint | Сумма всех платежей |
| receivable_minor | bigint | Дебиторка (наш аванс) |
| payable_minor | bigint | Кредиторка (наш долг) |
| chat_url | nvarchar(500), nullable | Ссылка на чат (из карточки контрагента) |

Последние 3–5 платежей: отдельная вьюха **v_finflow_partner_payments**:
partner_uid, date (date), basis (nvarchar(300)), amount_minor (bigint) —
до 5 строк на контрагента, свежие сверху.

## 4. v_finflow_contracts — договоры

| Колонка | Тип |
|---|---|
| contract_uid | nvarchar(36), ключ |
| partner_uid | nvarchar(36) |
| number | nvarchar(50) |
| date | date |
| is_active | bit |
| amount_minor | bigint |
| paid_minor | bigint |
| debt_minor | bigint |
| currency | nvarchar(3) |

## 5. v_finflow_orders — заказы поставщику

| Колонка | Тип |
|---|---|
| order_uid | nvarchar(36), ключ |
| partner_uid | nvarchar(36) |
| contract_uid | nvarchar(36), nullable |
| number | nvarchar(50) |
| date | date |
| amount_minor | bigint |
| paid_minor | bigint — оплачено ранее (все проведённые оплаты по заказу) |
| currency | nvarchar(3) |

## 6. v_finflow_attachments — метаданные вложений заявок

| Колонка | Тип |
|---|---|
| request_uid | nvarchar(36) |
| file_name | nvarchar(300) |
| file_type | nvarchar(100), nullable — «инвойс»/«спецификация»/«счёт»/… |
| created_at | datetime2(0) |

Ключ — пара (request_uid, file_name).

## Доступ

Нужен **SQL-логин** (read-only на эти вьюхи) и TCP-доступ к серверу DEEONE
с хоста ai01 (порт 1433): приложение подключится через SSH-туннель
VPS → host02 → ai01. Просьба сообщить: имя сервера/инстанса, порт, логин.
```

- [ ] **Step 2: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add docs/contracts/dwh-views.md
git commit -m "docs: контракт вьюх DEEONE для заказа владельцу DWH"
```

---

### Task 2: Зависимость mssql и env

**Files:**
- Modify: `package.json`, `package-lock.json`, `.env.example`, локальный `.env`

- [ ] **Step 1: Установить mssql**

Run: `npm install mssql && npm install -D @types/mssql`
Expected: обе зависимости в `package.json`. Одобрение на `mssql` дано в спеке
заявок §4; `@types/mssql` — сопутствующие типы (dev).

- [ ] **Step 2: Дополнить `.env.example` (в конец) и локальный `.env`**

```bash
# --- Боевой DWH (DWH_MODE=mssql; локально оставляем fixture) ---
# Подключение к локальному порту SSH-туннеля (ops/README.md)
DWH_MSSQL_HOST="127.0.0.1"
DWH_MSSQL_PORT="14330"
DWH_MSSQL_DATABASE="DEEONE"
DWH_MSSQL_USER="<sql-логин от BD-команды>"
DWH_MSSQL_PASSWORD="<пароль>"
```

- [ ] **Step 3: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add package.json package-lock.json .env.example
git commit -m "chore: зависимость mssql и env боевого DWH (одобрена спекой §4)"
```

---

### Task 3: Чистые мапперы строк вьюх (TDD)

Строки из mssql приходят как `Record<string, unknown>` (bigint может быть
number или string — tedious отдаёт большие как string). Мапперы нормализуют
и валидируют; неизвестный `approval_status` — ошибка с текстом (упадёт шаг
синка, будет виден в `SyncRun`).

**Files:**
- Create: `lib/integrations/dwh-mssql-map.ts`
- Test: `lib/integrations/dwh-mssql-map.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```typescript
// lib/integrations/dwh-mssql-map.test.ts
import { describe, expect, it } from "vitest"
import { asBigInt, asDate, asString, mapDebitRow, mapRequestRow } from "./dwh-mssql-map"

const requestRow = {
  uid: "req-1",
  number: "0001",
  date: new Date("2026-07-01T10:00:00Z"),
  org_name: "ТОРИ БРЭНДС ООО",
  org_inn: null,
  org_uid: null,
  initiator: "Иванова",
  initiator_head: "Петров",
  department: null,
  amount_minor: "2570000000", // bigint как строка — так отдаёт tedious
  currency: "RUB",
  cash_flow_item: "Оплата поставщикам",
  fund: "Закупки товара",
  partner_name: "Guangzhou",
  partner_inn: null,
  partner_uid: "prt-1",
  pay_date: new Date("2026-07-16T00:00:00Z"),
  approval_status: "on_approval",
  importance: 1,
  comment: null,
  debit_account_uid: "acc-1",
  contract_uid: null,
  order_uid: "ord-1",
}

describe("mapRequestRow", () => {
  it("маппит строку вьюхи в DwhRequestRow", () => {
    const r = mapRequestRow(requestRow)
    expect(r.uid).toBe("req-1")
    expect(r.amountMinor).toBe(2_570_000_000n)
    expect(r.approvalStatus).toBe("on_approval")
    expect(r.importance).toBe(1)
    expect(r.debitAccountUid).toBe("acc-1")
    expect(r.orderUid).toBe("ord-1")
    expect(r.contractUid).toBeNull()
  })

  it("bigint числом тоже принимается", () => {
    const r = mapRequestRow({ ...requestRow, amount_minor: 12345 })
    expect(r.amountMinor).toBe(12345n)
  })

  it("неизвестный approval_status — понятная ошибка", () => {
    expect(() =>
      mapRequestRow({ ...requestRow, approval_status: "Согласована" })
    ).toThrow(/approval_status/)
  })

  it("отсутствие обязательной колонки — понятная ошибка", () => {
    const { uid: _uid, ...withoutUid } = requestRow
    expect(() => mapRequestRow(withoutUid)).toThrow(/uid/)
  })
})

describe("mapDebitRow", () => {
  it("маппит строку списания", () => {
    const d = mapDebitRow({
      doc_uid: "deb-1",
      date: new Date("2026-07-02T00:00:00Z"),
      amount_minor: "100000",
      bank_account: null,
      bank_name: "Сбербанк",
      request_uid: "req-1",
    })
    expect(d.docUid).toBe("deb-1")
    expect(d.amountMinor).toBe(100_000n)
    expect(d.bankAccount).toBeNull()
    expect(d.requestUid).toBe("req-1")
  })
})

describe("примитивы", () => {
  it("asBigInt: строка, число, null → ошибка", () => {
    expect(asBigInt("a", "42")).toBe(42n)
    expect(asBigInt("a", 42)).toBe(42n)
    expect(() => asBigInt("a", null)).toThrow(/a/)
    expect(() => asBigInt("a", "12.5")).toThrow(/a/)
  })

  it("asString/asDate валидируют тип", () => {
    expect(asString("s", "x")).toBe("x")
    expect(() => asString("s", 5)).toThrow(/s/)
    const d = new Date("2026-01-01")
    expect(asDate("d", d)).toBe(d)
    expect(() => asDate("d", "2026-01-01")).toThrow(/d/)
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/integrations/dwh-mssql-map.test.ts`
Expected: FAIL — файл не существует.

- [ ] **Step 3: Реализация**

```typescript
// lib/integrations/dwh-mssql-map.ts
// Чистые мапперы строк вьюх DEEONE (docs/contracts/dwh-views.md) в типы
// приложения. Без I/O — unit-тесты рядом. Ошибка маппинга валит шаг синка
// с понятным текстом (виден в SyncRun.error / SyncRun.slices).
import type {
  DwhApprovalStatus,
  DwhDebitRow,
  DwhRequestRow,
} from "./dwh"
import type {
  AttachmentRow,
  ContractRow,
  OrderRow,
  PartnerRow,
} from "./slices"

type Raw = Record<string, unknown>

export function asString(col: string, v: unknown): string {
  if (typeof v !== "string") throw new Error(`DWH: колонка ${col} не строка: ${String(v)}`)
  return v
}

export function asStringOrNull(col: string, v: unknown): string | null {
  if (v === null || v === undefined) return null
  return asString(col, v)
}

export function asBigInt(col: string, v: unknown): bigint {
  if (typeof v === "bigint") return v
  if (typeof v === "number" && Number.isInteger(v)) return BigInt(v)
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v)
  throw new Error(`DWH: колонка ${col} не целое: ${String(v)}`)
}

export function asNumber(col: string, v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v !== "" && Number.isFinite(Number(v)))
    return Number(v)
  throw new Error(`DWH: колонка ${col} не число: ${String(v)}`)
}

export function asDate(col: string, v: unknown): Date {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  throw new Error(`DWH: колонка ${col} не дата: ${String(v)}`)
}

export function asDateOrNull(col: string, v: unknown): Date | null {
  if (v === null || v === undefined) return null
  return asDate(col, v)
}

const APPROVAL_STATUSES: readonly DwhApprovalStatus[] = [
  "on_approval",
  "approved",
  "declined",
]

function asApprovalStatus(v: unknown): DwhApprovalStatus {
  if (
    typeof v === "string" &&
    (APPROVAL_STATUSES as readonly string[]).includes(v)
  )
    return v as DwhApprovalStatus
  throw new Error(
    `DWH: неизвестный approval_status "${String(v)}" — сверить контракт вьюхи (§11.8 спеки заявок)`
  )
}

export function mapRequestRow(row: Raw): DwhRequestRow {
  return {
    uid: asString("uid", row.uid),
    number: asString("number", row.number),
    date: asDate("date", row.date),
    orgName: asString("org_name", row.org_name),
    orgInn: asStringOrNull("org_inn", row.org_inn),
    orgUid: asStringOrNull("org_uid", row.org_uid),
    initiator: asStringOrNull("initiator", row.initiator),
    department: asStringOrNull("department", row.department),
    amountMinor: asBigInt("amount_minor", row.amount_minor),
    currency: asString("currency", row.currency),
    cashFlowItem: asStringOrNull("cash_flow_item", row.cash_flow_item),
    fund: asStringOrNull("fund", row.fund),
    partnerName: asStringOrNull("partner_name", row.partner_name),
    partnerInn: asStringOrNull("partner_inn", row.partner_inn),
    partnerUid: asStringOrNull("partner_uid", row.partner_uid),
    payDate: asDate("pay_date", row.pay_date),
    approvalStatus: asApprovalStatus(row.approval_status),
    importance: asNumber("importance", row.importance),
    comment: asStringOrNull("comment", row.comment),
    debitAccountUid: asStringOrNull("debit_account_uid", row.debit_account_uid),
    contractUid: asStringOrNull("contract_uid", row.contract_uid),
    orderUid: asStringOrNull("order_uid", row.order_uid),
    initiatorHead: asStringOrNull("initiator_head", row.initiator_head),
  }
}

export function mapDebitRow(row: Raw): DwhDebitRow {
  return {
    docUid: asString("doc_uid", row.doc_uid),
    date: asDate("date", row.date),
    amountMinor: asBigInt("amount_minor", row.amount_minor),
    bankAccount: asStringOrNull("bank_account", row.bank_account),
    bankName: asStringOrNull("bank_name", row.bank_name),
    requestUid: asString("request_uid", row.request_uid),
  }
}

export function mapPartnerRow(
  row: Raw,
  recentPayments: Array<{ date: string; basis: string; amountMinor: string }>
): PartnerRow {
  return {
    partnerUid: asString("partner_uid", row.partner_uid),
    firstOperationAt: asDateOrNull("first_operation_at", row.first_operation_at),
    lastPaymentAt: asDateOrNull("last_payment_at", row.last_payment_at),
    paymentCount: asNumber("payment_count", row.payment_count),
    totalPaidMinor: asBigInt("total_paid_minor", row.total_paid_minor),
    receivableMinor: asBigInt("receivable_minor", row.receivable_minor),
    payableMinor: asBigInt("payable_minor", row.payable_minor),
    recentPayments,
    chatUrl: asStringOrNull("chat_url", row.chat_url),
  }
}

export function mapPartnerPaymentRow(row: Raw): {
  partnerUid: string
  date: string
  basis: string
  amountMinor: string
} {
  return {
    partnerUid: asString("partner_uid", row.partner_uid),
    date: asDate("date", row.date).toISOString(),
    basis: asString("basis", row.basis),
    amountMinor: asBigInt("amount_minor", row.amount_minor).toString(),
  }
}

export function mapContractRow(row: Raw): ContractRow {
  return {
    contractUid: asString("contract_uid", row.contract_uid),
    partnerUid: asString("partner_uid", row.partner_uid),
    number: asString("number", row.number),
    date: asDate("date", row.date),
    isActive: Boolean(row.is_active),
    amountMinor: asBigInt("amount_minor", row.amount_minor),
    paidMinor: asBigInt("paid_minor", row.paid_minor),
    debtMinor: asBigInt("debt_minor", row.debt_minor),
    currency: asString("currency", row.currency),
  }
}

export function mapOrderRow(row: Raw): OrderRow {
  return {
    orderUid: asString("order_uid", row.order_uid),
    partnerUid: asString("partner_uid", row.partner_uid),
    contractUid: asStringOrNull("contract_uid", row.contract_uid),
    number: asString("number", row.number),
    date: asDate("date", row.date),
    amountMinor: asBigInt("amount_minor", row.amount_minor),
    paidMinor: asBigInt("paid_minor", row.paid_minor),
    currency: asString("currency", row.currency),
  }
}

export function mapAttachmentRow(row: Raw): AttachmentRow {
  return {
    requestUid: asString("request_uid", row.request_uid),
    fileName: asString("file_name", row.file_name),
    fileType: asStringOrNull("file_type", row.file_type),
    createdAt: asDate("created_at", row.created_at),
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/integrations/dwh-mssql-map.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/dwh-mssql-map.ts lib/integrations/dwh-mssql-map.test.ts
git commit -m "feat: мапперы строк вьюх DEEONE с валидацией контракта"
```

---

### Task 4: mssql-клиент и адаптер DwhGateway

I/O-обёртка — без unit-тестов (мапперы уже покрыты); живое подключение
проверит `dwh:probe` (Task 7).

**Files:**
- Create: `lib/integrations/dwh-mssql.ts`
- Modify: `lib/integrations/dwh.ts`

- [ ] **Step 1: Клиент и адаптер**

```typescript
// lib/integrations/dwh-mssql.ts
// Боевой DwhGateway: SQL Server DEEONE через локальный порт SSH-туннеля
// (ops/README.md). Пул ленивый и переживает hot-reload (как prisma в lib/db).
import sql from "mssql"
import type { DwhDebitRow, DwhGateway, DwhRequestRow } from "./dwh"
import { mapDebitRow, mapRequestRow } from "./dwh-mssql-map"

const globalForMssql = globalThis as unknown as {
  mssqlPool?: Promise<sql.ConnectionPool>
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`DWH mssql: не задана переменная ${name}`)
  return value
}

export function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (!globalForMssql.mssqlPool) {
    globalForMssql.mssqlPool = new sql.ConnectionPool({
      server: process.env.DWH_MSSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.DWH_MSSQL_PORT ?? 14330),
      database: requiredEnv("DWH_MSSQL_DATABASE"),
      user: requiredEnv("DWH_MSSQL_USER"),
      password: requiredEnv("DWH_MSSQL_PASSWORD"),
      options: {
        encrypt: false, // трафик уже в SSH-туннеле
        trustServerCertificate: true,
      },
      pool: { max: 4, min: 0 },
      requestTimeout: 60_000,
      connectionTimeout: 15_000,
    }).connect()
  }
  return globalForMssql.mssqlPool
}

export async function queryView(
  view: string,
  since?: Date
): Promise<Record<string, unknown>[]> {
  const pool = await getMssqlPool()
  const request = pool.request()
  // Имена вьюх — константы кода, не пользовательский ввод; параметризуем
  // только значения (заодно обходим DATEFORMAT-ловушку строковых дат).
  if (since) {
    request.input("since", sql.DateTime2, since)
    const result = await request.query(
      `SELECT * FROM ${view} WHERE date >= @since`
    )
    return result.recordset
  }
  const result = await request.query(`SELECT * FROM ${view}`)
  return result.recordset
}

export const mssqlDwhGateway: DwhGateway = {
  async fetchRequests(since: Date): Promise<DwhRequestRow[]> {
    const rows = await queryView("dbo.v_finflow_requests", since)
    return rows.map(mapRequestRow)
  },
  async fetchDebits(since: Date): Promise<DwhDebitRow[]> {
    const rows = await queryView("dbo.v_finflow_debits", since)
    return rows.map(mapDebitRow)
  },
}
```

- [ ] **Step 2: Режим `mssql` в фабрике**

В `lib/integrations/dwh.ts` заменить `getDwhGateway`:

```typescript
import { mssqlDwhGateway } from "./dwh-mssql"
```

```typescript
// DWH_MODE: "fixture" (по умолчанию — демо-данные) | "mssql" (боевой DEEONE).
export function getDwhGateway(): DwhGateway {
  const mode = process.env.DWH_MODE ?? "fixture"
  if (mode === "fixture") return fixtureDwhGateway
  if (mode === "mssql") return mssqlDwhGateway
  throw new Error(`DWH_MODE="${mode}" не поддерживается`)
}
```

- [ ] **Step 3: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/dwh-mssql.ts lib/integrations/dwh.ts
git commit -m "feat: mssql-адаптер DwhGateway — боевой источник заявок и списаний"
```

---

### Task 5: DWH-фетчеры срезов светофора

**Files:**
- Create: `lib/integrations/slices-dwh.ts`
- Modify: `lib/integrations/slices.ts`

- [ ] **Step 1: Фетчеры**

```typescript
// lib/integrations/slices-dwh.ts
// Срезы partners/contracts/orders/attachments из вьюх DEEONE
// (docs/contracts/dwh-views.md) через общий mssql-пул.
import { queryView } from "./dwh-mssql"
import {
  mapAttachmentRow,
  mapContractRow,
  mapOrderRow,
  mapPartnerPaymentRow,
  mapPartnerRow,
} from "./dwh-mssql-map"
import type {
  AttachmentRow,
  ContractRow,
  OrderRow,
  PartnerRow,
  SliceFetcher,
} from "./slices"

export const dwhPartnersFetcher: SliceFetcher<PartnerRow> = {
  async fetch() {
    const [stats, payments] = await Promise.all([
      queryView("dbo.v_finflow_partner_stats"),
      queryView("dbo.v_finflow_partner_payments"),
    ])
    const byPartner = new Map<
      string,
      Array<{ date: string; basis: string; amountMinor: string }>
    >()
    for (const raw of payments) {
      const p = mapPartnerPaymentRow(raw)
      const list = byPartner.get(p.partnerUid) ?? []
      list.push({ date: p.date, basis: p.basis, amountMinor: p.amountMinor })
      byPartner.set(p.partnerUid, list)
    }
    return stats.map((raw) => {
      const uid = String(raw.partner_uid)
      return mapPartnerRow(raw, byPartner.get(uid) ?? [])
    })
  },
}

export const dwhContractsFetcher: SliceFetcher<ContractRow> = {
  async fetch() {
    return (await queryView("dbo.v_finflow_contracts")).map(mapContractRow)
  },
}

export const dwhOrdersFetcher: SliceFetcher<OrderRow> = {
  async fetch() {
    return (await queryView("dbo.v_finflow_orders")).map(mapOrderRow)
  },
}

export const dwhAttachmentsFetcher: SliceFetcher<AttachmentRow> = {
  async fetch() {
    return (await queryView("dbo.v_finflow_attachments")).map(mapAttachmentRow)
  },
}
```

- [ ] **Step 2: Источник `dwh` в фабрике (`lib/integrations/slices.ts`)**

Добавить импорт:

```typescript
import {
  dwhAttachmentsFetcher,
  dwhContractsFetcher,
  dwhOrdersFetcher,
  dwhPartnersFetcher,
} from "./slices-dwh"
```

Функцию `pick` и фабрику заменить на:

```typescript
function pick<Row>(
  slice: SliceName,
  fixture: SliceFetcher<Row>,
  real?: Partial<Record<"1c" | "dwh", SliceFetcher<Row>>>
): SliceFetcher<Row> {
  const source = process.env[`SLICE_${slice.toUpperCase()}_SOURCE`] ?? "fixture"
  if (source === "fixture") return fixture
  const impl = real?.[source as "1c" | "dwh"]
  if (impl) return impl
  throw new Error(
    `Срез ${slice}: источник "${source}" не поддерживается для этого среза`
  )
}

export function getSliceFetchers(): SliceFetchers {
  return {
    balances: pick("balances", fixtureSlices.balances),
    rates: pick("rates", fixtureSlices.rates),
    funds: pick("funds", fixtureSlices.funds),
    partners: pick("partners", fixtureSlices.partners, {
      dwh: dwhPartnersFetcher,
    }),
    contracts: pick("contracts", fixtureSlices.contracts, {
      dwh: dwhContractsFetcher,
    }),
    orders: pick("orders", fixtureSlices.orders, { dwh: dwhOrdersFetcher }),
    attachments: pick("attachments", fixtureSlices.attachments, {
      dwh: dwhAttachmentsFetcher,
    }),
  }
}
```

(1c-варианты для balances/rates/funds добавит Task 6 — тем же третьим
аргументом.)

- [ ] **Step 3: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/slices-dwh.ts lib/integrations/slices.ts
git commit -m "feat: DWH-фетчеры срезов светофора — контрагенты, договоры, заказы, вложения"
```

---

### Task 6: 1С-фетчеры срезов (balances, rates, funds)

Фактический формат ответов не подтверждён (§11.3 спеки светофора):
нормализаторы валидируют ожидаемую структуру и падают с понятной ошибкой —
шаг синка запишет её в `SyncRun.slices`, поправка — в одном мапп-файле.

**Files:**
- Create: `lib/integrations/one-c-slices-map.ts`
- Test: `lib/integrations/one-c-slices-map.test.ts`
- Create: `lib/integrations/slices-one-c.ts`
- Create: `docs/contracts/one-c-slices.md`
- Modify: `lib/integrations/slices.ts`

- [ ] **Step 1: Написать падающие тесты нормализаторов**

Ожидаемая структура (проверяется по факту, Step 5): массивы объектов
с полями как в примерах ниже; суммы — рубли числом (в копейки переводим
через строку, без float-умножения).

```typescript
// lib/integrations/one-c-slices-map.test.ts
import { describe, expect, it } from "vitest"
import {
  normalizeBalances,
  normalizeFunds,
  normalizeRates,
  rubToMinor,
} from "./one-c-slices-map"

describe("rubToMinor", () => {
  it("переводит рубли в копейки без float-ошибок", () => {
    expect(rubToMinor(1234.56)).toBe(123_456n)
    expect(rubToMinor(0.1)).toBe(10n)
    expect(rubToMinor(25_700_000)).toBe(2_570_000_000n)
    expect(rubToMinor(-300.07)).toBe(-30_007n)
  })
})

describe("normalizeBalances", () => {
  it("маппит массив счетов", () => {
    const rows = normalizeBalances([
      {
        accountUid: "acc-1",
        orgUid: "org-1",
        orgName: "ТОРИ БРЭНДС ООО",
        accountName: "Сбербанк ₽",
        bankName: "Сбербанк",
        currency: "RUB",
        balance: 400000.5,
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].accountUid).toBe("acc-1")
    expect(rows[0].balanceMinor).toBe(40_000_050n)
  })

  it("не-массив — понятная ошибка", () => {
    expect(() => normalizeBalances({ error: "x" })).toThrow(/get\/balance/)
  })

  it("отсутствие поля — понятная ошибка", () => {
    expect(() => normalizeBalances([{ orgName: "x" }])).toThrow(/accountUid/)
  })
})

describe("normalizeFunds", () => {
  it("маппит массив фондов", () => {
    const rows = normalizeFunds([
      {
        fundUid: "f-1",
        name: "Закупки товара",
        planWeek: 40_000_000,
        factWeek: 5_000_000,
        balance: 35_000_000,
      },
    ])
    expect(rows[0].planWeekMinor).toBe(4_000_000_000n) // 40 млн ₽ в копейках
    expect(rows[0].balanceMinor).toBe(3_500_000_000n)
  })
})

describe("normalizeRates", () => {
  it("маппит массив курсов", () => {
    const rows = normalizeRates([
      { currencyCode: "CNY", rate: 11.5, date: "2026-07-15" },
    ])
    expect(rows[0].currencyCode).toBe("CNY")
    expect(rows[0].rate).toBe(11.5)
    expect(rows[0].rateDate.toISOString()).toContain("2026-07-15")
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/integrations/one-c-slices-map.test.ts`
Expected: FAIL — файл не существует.

- [ ] **Step 3: Нормализаторы**

```typescript
// lib/integrations/one-c-slices-map.ts
// Нормализация ответов REST API 1С (get/balance, get/fund, get/currencyRate)
// в строки срезов. Ожидаемая структура зафиксирована в
// docs/contracts/one-c-slices.md; расхождение с фактом правится здесь.
import type { BalanceRow, FundRow, RateRow } from "./slices"

// Суммы 1С приходят в рублях числом. В копейки — через строку с
// фиксированной точностью (без float-умножения).
export function rubToMinor(rub: number): bigint {
  const [int, frac = ""] = rub.toFixed(2).split(".")
  return BigInt(int) * 100n + BigInt(int.startsWith("-") ? -1 : 1) * BigInt(frac)
}

function fail(method: string, detail: string): never {
  throw new Error(`1С ${method}: неожиданный формат ответа — ${detail}`)
}

function str(method: string, obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  if (typeof v !== "string" || v === "") fail(method, `поле ${key}`)
  return v
}

function strOrNull(
  obj: Record<string, unknown>,
  key: string
): string | null {
  const v = obj[key]
  return typeof v === "string" && v !== "" ? v : null
}

function num(method: string, obj: Record<string, unknown>, key: string): number {
  const v = obj[key]
  if (typeof v !== "number" || !Number.isFinite(v)) fail(method, `поле ${key}`)
  return v
}

function asArray(method: string, data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) fail(method, "ожидался массив")
  return data as Record<string, unknown>[]
}

export function normalizeBalances(data: unknown): BalanceRow[] {
  return asArray("get/balance", data).map((row) => ({
    accountUid: str("get/balance", row, "accountUid"),
    orgUid: strOrNull(row, "orgUid"),
    orgName: str("get/balance", row, "orgName"),
    accountName: str("get/balance", row, "accountName"),
    bankName: strOrNull(row, "bankName"),
    currency: str("get/balance", row, "currency"),
    balanceMinor: rubToMinor(num("get/balance", row, "balance")),
  }))
}

export function normalizeFunds(data: unknown): FundRow[] {
  return asArray("get/fund", data).map((row) => ({
    fundUid: str("get/fund", row, "fundUid"),
    name: str("get/fund", row, "name"),
    planWeekMinor: rubToMinor(num("get/fund", row, "planWeek")),
    factWeekMinor: rubToMinor(num("get/fund", row, "factWeek")),
    balanceMinor: rubToMinor(num("get/fund", row, "balance")),
  }))
}

export function normalizeRates(data: unknown): RateRow[] {
  return asArray("get/currencyRate", data).map((row) => {
    const rateDate = new Date(str("get/currencyRate", row, "date"))
    if (Number.isNaN(rateDate.getTime()))
      fail("get/currencyRate", "поле date")
    return {
      currencyCode: str("get/currencyRate", row, "currencyCode"),
      rate: num("get/currencyRate", row, "rate"),
      rateDate,
    }
  })
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/integrations/one-c-slices-map.test.ts`
Expected: PASS (7 тестов).

- [ ] **Step 5: Фетчеры и документ-инструкция**

```typescript
// lib/integrations/slices-one-c.ts
// Срезы balances/rates/funds из готовых методов REST API 1С (Bearer).
// Использует те же env, что клиент согласования (ONEC_API_*).
import {
  normalizeBalances,
  normalizeFunds,
  normalizeRates,
} from "./one-c-slices-map"
import type { BalanceRow, FundRow, RateRow, SliceFetcher } from "./slices"

const TIMEOUT_MS = 20_000

async function getJson(path: string): Promise<unknown> {
  const base = process.env.ONEC_API_BASE_URL
  const token = process.env.ONEC_API_TOKEN
  if (!base || !token)
    throw new Error("1С: не заданы ONEC_API_BASE_URL / ONEC_API_TOKEN")
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`1С ${path}: HTTP ${res.status}`)
  return res.json()
}

export const oneCBalancesFetcher: SliceFetcher<BalanceRow> = {
  async fetch() {
    return normalizeBalances(await getJson("/api/1crm/get/balance"))
  },
}

export const oneCFundsFetcher: SliceFetcher<FundRow> = {
  async fetch() {
    return normalizeFunds(await getJson("/api/1crm/get/fund"))
  },
}

export const oneCRatesFetcher: SliceFetcher<RateRow> = {
  async fetch() {
    return normalizeRates(await getJson("/api/1crm/get/currencyRate"))
  },
}
```

В фабрике `getSliceFetchers()` (`lib/integrations/slices.ts`) добавить импорт
и третий аргумент трём срезам:

```typescript
import {
  oneCBalancesFetcher,
  oneCFundsFetcher,
  oneCRatesFetcher,
} from "./slices-one-c"
```

```typescript
    balances: pick("balances", fixtureSlices.balances, {
      "1c": oneCBalancesFetcher,
    }),
    rates: pick("rates", fixtureSlices.rates, { "1c": oneCRatesFetcher }),
    funds: pick("funds", fixtureSlices.funds, { "1c": oneCFundsFetcher }),
```

Создать `docs/contracts/one-c-slices.md`:

```markdown
# API 1С: срезы светофора — фиксация фактических схем

Методы (Bearer, база `ONEC_API_BASE_URL`, нужен VPN/офисная сеть):

- `GET /api/1crm/get/balance` — остатки на счетах
- `GET /api/1crm/get/fund` — фонды
- `GET /api/1crm/get/currencyRate` — курсы валют

Ожидаемые структуры зафиксированы в `lib/integrations/one-c-slices-map.ts`
(поля accountUid/orgName/…/balance и т.д.). Схемы НЕ подтверждены (§11.3
спеки светофора). Перед включением `SLICE_*_SOURCE=1c`:

1. Снять фактические ответы:
   `curl -s -H "Authorization: Bearer $ONEC_API_TOKEN" $ONEC_API_BASE_URL/api/1crm/get/balance | head -c 2000`
   (аналогично get/fund, get/currencyRate).
2. Положить примеры (обезличенные суммы) в `docs/contracts/samples/`.
3. При расхождении — поправить нормализаторы в `one-c-slices-map.ts`
   и их unit-тесты. Ошибка формата в бою не роняет синк целиком:
   шаг среза упадёт с текстом в `SyncRun.slices`.
```

- [ ] **Step 6: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/ docs/contracts/one-c-slices.md
git commit -m "feat: 1С-фетчеры срезов — остатки, фонды, курсы через REST API"
```

---

### Task 7: Скрипт проверки подключения `dwh:probe`

Ручная проверка живого канала до включения боевого режима.

**Files:**
- Create: `scripts/dwh-probe.ts`
- Modify: `package.json`

- [ ] **Step 1: Скрипт**

```typescript
// scripts/dwh-probe.ts
// Ручная проверка боевых источников: счётчики строк по вьюхам DEEONE
// и методам API 1С. Запуск: npm run dwh:probe (нужны env и туннель).
import { queryView } from "../lib/integrations/dwh-mssql"
import {
  oneCBalancesFetcher,
  oneCFundsFetcher,
  oneCRatesFetcher,
} from "../lib/integrations/slices-one-c"

const VIEWS = [
  "dbo.v_finflow_requests",
  "dbo.v_finflow_debits",
  "dbo.v_finflow_partner_stats",
  "dbo.v_finflow_partner_payments",
  "dbo.v_finflow_contracts",
  "dbo.v_finflow_orders",
  "dbo.v_finflow_attachments",
]

async function main() {
  console.log("— DWH (mssql через туннель) —")
  for (const view of VIEWS) {
    try {
      const rows = await queryView(view)
      console.log(`${view}: ${rows.length} строк`)
    } catch (e) {
      console.log(`${view}: ОШИБКА — ${e instanceof Error ? e.message : e}`)
    }
  }

  console.log("— API 1С (срезы) —")
  const fetchers = [
    ["get/balance", oneCBalancesFetcher],
    ["get/fund", oneCFundsFetcher],
    ["get/currencyRate", oneCRatesFetcher],
  ] as const
  for (const [name, fetcher] of fetchers) {
    try {
      const rows = await fetcher.fetch()
      console.log(`${name}: ${rows.length} строк`)
    } catch (e) {
      console.log(`${name}: ОШИБКА — ${e instanceof Error ? e.message : e}`)
    }
  }
  process.exit(0)
}

main()
```

- [ ] **Step 2: npm-скрипт (в `package.json` → `scripts`)**

```json
    "dwh:probe": "tsx --env-file=.env scripts/dwh-probe.ts",
```

(`tsx` уже в devDependencies.)

- [ ] **Step 3: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add scripts/dwh-probe.ts package.json
git commit -m "feat: dwh:probe — ручная проверка боевых источников"
```

---

### Task 8: Ops — туннель и cron

Файлы в репо + памятка; устанавливает разработчик (root на VPS).

**Files:**
- Create: `ops/finflow-dwh-tunnel.service`
- Create: `ops/crontab.finflow`
- Create: `ops/README.md`

- [ ] **Step 1: systemd-unit туннеля**

Параметры установки `<DEEONE_HOST>`, `<SSH_USER>` заполняются при установке
(ответ BD-команды на контракт, Task 1) — это параметры инфраструктуры,
не пропуски плана.

```ini
# ops/finflow-dwh-tunnel.service
# SSH-туннель к SQL Server DEEONE: VPS -> host02 (jump) -> ai01 -> DEEONE:1433.
# Локальный порт 14330 использует приложение (DWH_MSSQL_PORT).
# Установка: ops/README.md.
[Unit]
Description=finflow DWH tunnel (host02 -> ai01 -> DEEONE)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/ssh -N \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  -o IdentitiesOnly=yes \
  -i /etc/finflow/dwh_ssh_key \
  -o ProxyCommand="ssh -W %%h:%%p -i /etc/finflow/dwh_ssh_key -o IdentitiesOnly=yes -o BatchMode=yes -p 2201 <SSH_USER>@178.130.54.208" \
  -p 2202 \
  -L 127.0.0.1:14330:<DEEONE_HOST>:1433 \
  <SSH_USER>@10.10.10.100
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Расписание синка**

Спека заявок §7: 9:00–12:00 МСК каждые 15 минут (окно загрузки выписок),
далее раз в час до 19:00; ночью и в выходные не запускается.

```bash
# ops/crontab.finflow
# Расписание синка finflow (prod). Установка: ops/README.md.
# PROD_PORT и SYNC_CRON_SECRET подставить из env prod-контура.
CRON_TZ=Europe/Moscow

# окно выписок: каждые 15 минут с 9:00 до 11:45 + 12:00, будни
*/15 9-11 * * 1-5  curl -s -m 60 -X POST -H "x-sync-secret: <SYNC_CRON_SECRET>" http://127.0.0.1:<PROD_PORT>/api/jobs/sync > /dev/null
0 12 * * 1-5       curl -s -m 60 -X POST -H "x-sync-secret: <SYNC_CRON_SECRET>" http://127.0.0.1:<PROD_PORT>/api/jobs/sync > /dev/null

# далее раз в час до 19:00, будни
0 13-19 * * 1-5    curl -s -m 60 -X POST -H "x-sync-secret: <SYNC_CRON_SECRET>" http://127.0.0.1:<PROD_PORT>/api/jobs/sync > /dev/null
```

- [ ] **Step 3: Памятка установки**

```markdown
# ops/README.md — включение боевого DWH на сервере

Предпосылки (см. план 8): вьюхи по контракту `docs/contracts/dwh-views.md`
созданы; BD-команда сообщила адрес сервера DEEONE и SQL-логин; есть
SSH-ключ с доступом к host02 (178.130.54.208:2201) и ai01 (10.10.10.100:2202).

## 1. Туннель

1. Ключ: `install -m 600 <ключ> /etc/finflow/dwh_ssh_key`.
2. Скопировать `ops/finflow-dwh-tunnel.service` в `/etc/systemd/system/`,
   заменив `<SSH_USER>` и `<DEEONE_HOST>`.
3. `systemctl daemon-reload && systemctl enable --now finflow-dwh-tunnel`.
4. Проверка: `nc -z 127.0.0.1 14330 && echo OK`.

## 2. env prod-контура (файл env prod-приложения)

    DWH_MODE="mssql"
    DWH_MSSQL_HOST="127.0.0.1"
    DWH_MSSQL_PORT="14330"
    DWH_MSSQL_DATABASE="DEEONE"
    DWH_MSSQL_USER="<логин>"
    DWH_MSSQL_PASSWORD="<пароль>"
    SLICE_BALANCES_SOURCE="1c"
    SLICE_RATES_SOURCE="1c"
    SLICE_FUNDS_SOURCE="1c"
    SLICE_PARTNERS_SOURCE="dwh"
    SLICE_CONTRACTS_SOURCE="dwh"
    SLICE_ORDERS_SOURCE="dwh"
    SLICE_ATTACHMENTS_SOURCE="dwh"
    ONEC_API_MODE="real"
    ONEC_API_BASE_URL="http://192.168.79.250:4480"
    ONEC_API_TOKEN="<токен>"

Внимание: API 1С (192.168.79.250) — офисная сеть. Если VPS не имеет
маршрута — добавить проброс в туннель (вторая строка -L) или оставить
срезы balances/rates/funds на fixture до решения.

3. Перед включением: `npm run dwh:probe` из каталога приложения
   (счётчики строк по всем вьюхам и методам, без ОШИБКА).
4. `pm2 reload finflow-prod`, затем в UI «Обновить» → строка свежести
   без ошибок, `SyncRun.slices` заполнен.

## 3. Cron

1. Подставить `<PROD_PORT>` и `<SYNC_CRON_SECRET>` в `ops/crontab.finflow`.
2. Установить: `crontab -u deploy ops/crontab.finflow` (или merge в
   существующий crontab).
3. Проверка на следующий рабочий день: `SyncRun` содержит запуски
   trigger=cron по расписанию.

## Откат

`DWH_MODE=fixture` + `SLICE_*_SOURCE=fixture` в env, `pm2 reload` —
приложение мгновенно возвращается на демо-данные; туннель и cron можно
не трогать.
```

- [ ] **Step 4: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add ops/
git commit -m "feat: ops — systemd-туннель к DEEONE и cron-расписание синка"
```

---

### Task 9: Финальный прогон

- [ ] **Step 1: Полный прогон в fixture-режиме**

Run: `npm run format && npm run lint && npm run typecheck && npm run test && npm run test:e2e`
Expected: всё зелёное — боевые адаптеры не активны без env, существующее
поведение не изменилось.

- [ ] **Step 2: Commit (если были правки)**

```bash
git status --short   # пусто — план завершён
```

---

## Что считается готовым (Definition of Done)

- `DWH_MODE=mssql` включает боевой `DwhGateway` (заявки, списания из вьюх
  DEEONE через туннель); `SLICE_*_SOURCE=dwh|1c` включает боевые срезы;
  fixture-режим не тронут, e2e зелёные.
- Мапперы строк вьюх и нормализаторы 1С покрыты unit-тестами; неизвестный
  статус/формат даёт понятную ошибку в `SyncRun`, не молчаливые нули.
- `npm run dwh:probe` печатает счётчики по всем семи вьюхам и трём методам 1С.
- В репо: контракт вьюх для заказа (docs/contracts), systemd-unit туннеля,
  crontab по расписанию спеки §7, памятка установки с параметрами
  и планом отката.
- Блокирующие предпосылки зафиксированы: вьюхи, SQL-логин, адрес DEEONE,
  SSH-ключ на VPS, маршрут до API 1С с VPS.

