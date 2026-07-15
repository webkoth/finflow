# План 9: Отправка платёжек поставщикам (Яндекс Мессенджер) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Очередь отправки платёжек по оплатам «за товар»: синк создаёт черновики по новым списаниям, бухгалтер прикрепляет файл и подтверждает, приложение шлёт файл в чат поставщика (Яндекс Мессенджер, mock-режим до появления бота), журнал отправок — по спеке заявок §8 в ручном режиме v1.

**Architecture:** Синк после upsert списаний создаёт `PaymentOrderDispatch` для заявок со статьёй «за товар» (`CashFlowItemSetting.isGoods`); чат подбирается из `PartnerStats.chatUrl` (срез плана 6), файл в v1 прикрепляется вручную (процесс выкладки файлов не настроен — предпосылка §11.2). Готовность черновика — чистая функция `lib/domain/dispatch.ts`. Отправка — `lib/integrations/yandex-messenger.ts` (mock/real за одним интерфейсом), подтверждение — server action с правом `confirm_dispatch` и авторством из сессии (план 7). Дубли исключены уникальным индексом `[requestId, debitId]`.

**Tech Stack:** Next.js App Router, TypeScript, Prisma + PostgreSQL, `node:fs` (файлы платёжек), Vitest, Playwright. Без новых npm-зависимостей.

**Спека:** `2026-07-14-payment-requests-design.md` (§5, §8, §9.3, §11.2–4) + требование авторства из `2026-07-15-auth-roles-design.md` §8.

**Зависимости:** планы 03 (заявки/списания/синк), 06 (срез `PartnerStats.chatUrl`), 07 (`requireAction`, пользователи) реализованы. Выполнять после них; план 08 (боевой DWH) не требуется — очередь работает на fixture-списаниях.

**Предпосылки вне кода (спека §11.2–4), до закрытия работает ручной режим:**
1. Процесс выкладки файлов платёжек (кто, куда, формат имён) → авто-подбор файла появится отдельной итерацией; в v1 файл прикрепляет бухгалтер.
2. Бот Яндекс Мессенджера (Яндекс 360): создать, получить токен, добавить в чаты → до этого `YM_BOT_MODE=mock`.
3. `chat_id` чатов поставщиков: `chatUrl` из карточки 1С — ссылка для человека; идентификатор чата для Bot API бухгалтер вводит в черновике вручную, пока не подтверждён формат (см. `docs/contracts/yandex-messenger.md`, Task 5).

**Правила репозитория, которые действуют в каждой задаче** (из `CLAUDE.md`):
- Перед каждым коммитом: `npm run format && npm run lint && npm run typecheck && npm run test`.
- Мутации — server actions `(prevState: FormState, formData: FormData) => Promise<FormState>`; ошибки — `{ error }`; после успеха `revalidatePath`.
- `lib/domain/` — чистая логика с unit-тестами; unit компонентов запрещены.
- Деньги — BigInt-копейки, `formatMoneyBig`.
- Интерфейс на русском, код на английском, conventional commits.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma` (modify) | `PaymentOrderDispatch`, `CashFlowItemSetting`, enum `DispatchStatus`, счётчик в `SyncRun` |
| `lib/domain/dispatch.ts` (create) | Готовность черновика: статус + список недостающего (unit-тесты рядом) |
| `lib/sync/sync-dispatch.ts` (create) | Пополнение статей ДДС + создание черновиков отправок по новым списаниям |
| `lib/sync/run-sync.ts` (modify) | Вызов `syncDispatch` после списаний |
| `lib/integrations/yandex-messenger.ts` (create) | `sendPaymentOrder` (mock/real за одним интерфейсом) |
| `docs/contracts/yandex-messenger.md` (create) | Контракт Bot API и задачи предпосылок (бот, токен, chat_id) |
| `app/settings/cash-flow-items/page.tsx`, `items-table.tsx`, `actions.ts` (create) | Статьи ДДС с флагом «оплата за товар» |
| `app/dispatch/page.tsx`, `dispatch-row.tsx`, `actions.ts` (create) | Очередь и журнал отправок, все действия |
| `prisma/seed.ts` (modify) | Флаг isGoods демо-статьи |
| `.env.example` (modify) | `YM_BOT_MODE`, `YM_BOT_TOKEN`, `PAYMENT_ORDERS_DIR` |
| `tests/e2e/dispatch.spec.ts` (create) | Сквозной сценарий очереди |

---

### Task 1: Prisma — отправки и статьи ДДС

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Добавить в конец `prisma/schema.prisma`**

```prisma
// --- Отправка платёжек поставщикам (спека заявок §5, §8) ---

enum DispatchStatus {
  not_ready // не хватает файла и/или чата
  awaiting_confirmation // всё готово, ждёт подтверждения бухгалтера
  sent
  failed
  skipped
}

model PaymentOrderDispatch {
  id            String         @id @default(cuid())
  requestId     String
  debitId       String
  status        DispatchStatus
  fileName      String? // имя файла платёжки
  filePath      String? // путь в PAYMENT_ORDERS_DIR
  chatId        String? // идентификатор чата для Bot API (вводится вручную, §11.4)
  chatUrl       String? // ссылка на чат из карточки контрагента (справочно)
  confirmedById String? // кто подтвердил отправку
  confirmedBy   String? // снапшот имени на момент подтверждения
  sentAt        DateTime?      @db.Timestamptz(3)
  error         String? // текст ошибки последней попытки (status=failed)
  skipReason    String? // причина пропуска (status=skipped)
  createdAt     DateTime       @default(now()) @db.Timestamptz(3)

  request       PaymentRequest @relation(fields: [requestId], references: [id])
  debit         Debit          @relation(fields: [debitId], references: [id])
  confirmedUser User?          @relation(fields: [confirmedById], references: [id])

  @@unique([requestId, debitId]) // защита от двойной отправки
  @@index([status])
  @@map("payment_order_dispatches")
}

// Статьи ДДС: список пополняется синком, флаг ставится в настройках.
model CashFlowItemSetting {
  id      String  @id @default(cuid())
  name    String  @unique
  isGoods Boolean @default(false) // «оплата за товар» → триггер отправки платёжки

  @@map("cash_flow_item_settings")
}
```

- [ ] **Step 2: Обратные связи**

В модель `PaymentRequest` (к существующим relations) добавить:

```prisma
  dispatches PaymentOrderDispatch[]
```

В модель `Debit`:

```prisma
  dispatches PaymentOrderDispatch[]
```

В модель `User`:

```prisma
  confirmedDispatches PaymentOrderDispatch[]
```

В модель `SyncRun` (после `slices`):

```prisma
  dispatchesCreated Int @default(0)
```

- [ ] **Step 3: Миграция**

Run: `npx prisma migrate dev --name payment_order_dispatch`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add prisma/
git commit -m "feat: схема отправки платёжек — PaymentOrderDispatch, CashFlowItemSetting"
```

---

### Task 2: Домен — готовность черновика (TDD)

**Files:**
- Create: `lib/domain/dispatch.ts`
- Test: `lib/domain/dispatch.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```typescript
// lib/domain/dispatch.test.ts
import { describe, expect, it } from "vitest"
import { computeDispatchReadiness } from "./dispatch"

describe("computeDispatchReadiness", () => {
  it("есть файл и чат → awaiting_confirmation", () => {
    const r = computeDispatchReadiness({ hasFile: true, hasChatId: true })
    expect(r.status).toBe("awaiting_confirmation")
    expect(r.missing).toEqual([])
  })

  it("нет файла → not_ready с перечнем", () => {
    const r = computeDispatchReadiness({ hasFile: false, hasChatId: true })
    expect(r.status).toBe("not_ready")
    expect(r.missing).toEqual(["файл платёжки"])
  })

  it("нет чата → not_ready", () => {
    const r = computeDispatchReadiness({ hasFile: true, hasChatId: false })
    expect(r.missing).toEqual(["чат поставщика"])
  })

  it("нет ничего → оба пункта в перечне", () => {
    const r = computeDispatchReadiness({ hasFile: false, hasChatId: false })
    expect(r.status).toBe("not_ready")
    expect(r.missing).toEqual(["файл платёжки", "чат поставщика"])
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/dispatch.test.ts`
Expected: FAIL — файл не существует.

- [ ] **Step 3: Реализация**

```typescript
// lib/domain/dispatch.ts
// Готовность черновика отправки платёжки (спека §8): отправлять можно,
// когда есть и файл, и идентификатор чата. Чистая логика без I/O.
export type DispatchReadiness = {
  status: "awaiting_confirmation" | "not_ready"
  missing: string[]
}

export function computeDispatchReadiness(input: {
  hasFile: boolean
  hasChatId: boolean
}): DispatchReadiness {
  const missing: string[] = []
  if (!input.hasFile) missing.push("файл платёжки")
  if (!input.hasChatId) missing.push("чат поставщика")
  return {
    status: missing.length === 0 ? "awaiting_confirmation" : "not_ready",
    missing,
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/dispatch.test.ts`
Expected: PASS (4 теста).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/dispatch.ts lib/domain/dispatch.test.ts
git commit -m "feat: готовность черновика отправки платёжки"
```

---

### Task 3: Синк — статьи ДДС и черновики отправок

**Files:**
- Create: `lib/sync/sync-dispatch.ts`
- Modify: `lib/sync/run-sync.ts`, `prisma/seed.ts`

- [ ] **Step 1: Реализация `syncDispatch`**

```typescript
// lib/sync/sync-dispatch.ts
// После синка списаний: пополняет справочник статей ДДС и создаёт черновики
// отправок платёжек для оплат «за товар» (спека §8, шаг 1 пайплайна).
// Авто-подбор файла в v1 отключён (процесс выкладки не настроен, §11.2) —
// файл прикрепляет бухгалтер на /dispatch.
import { prisma } from "@/lib/db"
import { computeDispatchReadiness } from "@/lib/domain/dispatch"

export async function syncDispatch(): Promise<number> {
  // 1. Справочник статей: новые имена из заявок появляются в настройках.
  const items = await prisma.paymentRequest.findMany({
    where: { cashFlowItem: { not: null } },
    distinct: ["cashFlowItem"],
    select: { cashFlowItem: true },
  })
  for (const item of items) {
    const name = item.cashFlowItem
    if (!name) continue
    await prisma.cashFlowItemSetting.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  // 2. Черновики: списания по заявкам со статьёй «за товар» без отправки.
  const goods = await prisma.cashFlowItemSetting.findMany({
    where: { isGoods: true },
    select: { name: true },
  })
  const goodsNames = goods.map((g) => g.name)
  if (goodsNames.length === 0) return 0

  const debits = await prisma.debit.findMany({
    where: {
      request: { cashFlowItem: { in: goodsNames }, isDeletedIn1c: false },
      dispatches: { none: {} },
    },
    include: { request: true },
  })

  let created = 0
  for (const debit of debits) {
    // Чат поставщика — из среза контрагентов (план 6); chat_id для Bot API
    // бухгалтер вводит вручную (§11.4), поэтому черновик всегда not_ready.
    const partnerStats = debit.request.partnerUid
      ? await prisma.partnerStats.findUnique({
          where: { partnerUid: debit.request.partnerUid },
        })
      : null
    const readiness = computeDispatchReadiness({
      hasFile: false,
      hasChatId: false,
    })
    await prisma.paymentOrderDispatch.create({
      data: {
        requestId: debit.request.id,
        debitId: debit.id,
        status: readiness.status,
        chatUrl: partnerStats?.chatUrl ?? null,
      },
    })
    created++
  }
  return created
}
```

- [ ] **Step 2: Вызов из `runSync`**

В `lib/sync/run-sync.ts` добавить импорт:

```typescript
import { syncDispatch } from "./sync-dispatch"
```

После блока синка срезов (`const slices = await syncSlices(...)`) добавить:

```typescript
    const dispatchesCreated = await syncDispatch()
```

и в финальный `prisma.syncRun.update` (ветка успеха) — в `data`:

```typescript
        dispatchesCreated,
```

- [ ] **Step 3: Демо-статья в seed**

В `prisma/seed.ts` (после блока настроек светофора, до `runSync`):

```typescript
  // Статья «за товар» для демо и e2e: черновики отправок создаст синк.
  await prisma.cashFlowItemSetting.upsert({
    where: { name: "Оплата поставщикам за товар" },
    update: { isGoods: true },
    create: { name: "Оплата поставщикам за товар", isGoods: true },
  })
  console.log("Seed: статья «Оплата поставщикам за товар» помечена isGoods")
```

- [ ] **Step 4: Проверить сид**

Run: `npx prisma db seed`
Expected: строки про статью и синк; в БД — `payment_order_dispatches`
содержит черновик not_ready по `fx-deb-1` (заявка REQ-0001 «Оплата
поставщикам за товар»), `cash_flow_item_settings` пополнен всеми статьями
из fixture-заявок.

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/sync/ prisma/seed.ts
git commit -m "feat: синк — справочник статей ДДС и черновики отправок платёжек"
```

---

### Task 4: Настройки статей ДДС `/settings/cash-flow-items`

**Files:**
- Create: `app/settings/cash-flow-items/actions.ts`, `items-table.tsx`, `page.tsx`
- Test: `tests/e2e/dispatch.spec.ts` (create, первый тест)

- [ ] **Step 1: Server action**

```typescript
// app/settings/cash-flow-items/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAction } from "@/lib/auth/session"

export type FormState = { error: string | null }

export async function toggleIsGoods(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_cash_flow_items")
  if (auth.error) return { error: auth.error }

  const id = String(formData.get("id") ?? "")
  const item = await prisma.cashFlowItemSetting.findUnique({ where: { id } })
  if (!item) return { error: "Статья не найдена" }

  await prisma.cashFlowItemSetting.update({
    where: { id },
    data: { isGoods: !item.isGoods },
  })
  revalidatePath("/settings/cash-flow-items")
  return { error: null }
}
```

- [ ] **Step 2: Таблица и страница**

```tsx
// app/settings/cash-flow-items/items-table.tsx
"use client"

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
import { toggleIsGoods, type FormState } from "./actions"

export type ItemRow = { id: string; name: string; isGoods: boolean }

const initialState: FormState = { error: null }

function Row({ item }: { item: ItemRow }) {
  const [state, formAction, isPending] = useActionState(
    toggleIsGoods,
    initialState
  )
  return (
    <TableRow>
      <TableCell>{item.name}</TableCell>
      <TableCell>
        {item.isGoods ? (
          <Badge>оплата за товар</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <form action={formAction}>
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            {item.isGoods ? "Снять флаг" : "Пометить «за товар»"}
          </Button>
        </form>
        {state.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
      </TableCell>
    </TableRow>
  )
}

export function ItemsTable({ items }: { items: ItemRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Статья ДДС</TableHead>
          <TableHead>Признак</TableHead>
          <TableHead>Действие</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-muted-foreground">
              Статей нет — они появятся после первого синка заявок.
            </TableCell>
          </TableRow>
        )}
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </TableBody>
    </Table>
  )
}
```

```tsx
// app/settings/cash-flow-items/page.tsx
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
import { ItemsTable, type ItemRow } from "./items-table"

export const dynamic = "force-dynamic"

export default async function CashFlowItemsPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.role as Role, "manage_cash_flow_items")) notFound()

  const items = await prisma.cashFlowItemSetting.findMany({
    orderBy: { name: "asc" },
  })
  const rows: ItemRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    isGoods: i.isGoods,
  }))

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Статьи ДДС</h1>
      <p className="text-muted-foreground text-sm">
        По статьям с признаком «оплата за товар» синк создаёт черновики
        отправки платёжек поставщикам (экран «Отправка платёжек»).
      </p>
      <ItemsTable items={rows} />
    </main>
  )
}
```

- [ ] **Step 3: E2e (создать `tests/e2e/dispatch.spec.ts`)**

```typescript
// tests/e2e/dispatch.spec.ts
// Отправка платёжек: настройки статей, очередь, ручной режим, mock-ЯМ.
// Serial: сценарии зависят от общего состояния черновика.
import { expect, test } from "@playwright/test"
import { loginAs, syncFixtureData } from "./helpers"

test.describe.configure({ mode: "serial" })

test("настройки статей: флаг переключается", async ({ page }) => {
  await loginAs(page, "accountant")
  await syncFixtureData(page) // наполняет справочник статей
  await page.goto("/settings/cash-flow-items")
  const row = page.getByRole("row", { name: /Реклама и продвижение/ })
  await row.getByRole("button", { name: "Пометить «за товар»" }).click()
  await expect(row.getByText("оплата за товар")).toBeVisible()
  await row.getByRole("button", { name: "Снять флаг" }).click()
  await expect(row.getByText("оплата за товар")).toHaveCount(0)
})
```

- [ ] **Step 4: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/dispatch.spec.ts`
Expected: PASS (1 тест).

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/settings/cash-flow-items/ tests/e2e/dispatch.spec.ts
git commit -m "feat: настройки статей ДДС — флаг «оплата за товар»"
```

---

### Task 5: Адаптер Яндекс Мессенджера

**Files:**
- Create: `lib/integrations/yandex-messenger.ts`
- Create: `docs/contracts/yandex-messenger.md`
- Modify: `.env.example`, локальный `.env`

- [ ] **Step 1: Адаптер (mock/real)**

```typescript
// lib/integrations/yandex-messenger.ts
// Отправка файла платёжки в чат поставщика (Bot API Яндекс Мессенджера).
// YM_BOT_MODE: "mock" — без сети (dev/e2e; chatId "mock-fail" → ошибка,
// для e2e сценария повтора); "real" — HTTP; иначе — явная ошибка.
// Формат real-вызова зафиксирован в docs/contracts/yandex-messenger.md
// и проверяется при появлении бота (предпосылка §11.3 спеки).
import { readFile } from "node:fs/promises"

export type SendResult = { ok: true } | { ok: false; error: string }

const TIMEOUT_MS = 30_000
const API_URL = "https://botapi.messenger.yandex.net/bot/v1/messages/sendFile/"

export async function sendPaymentOrder(input: {
  chatId: string
  filePath: string
  fileName: string
  caption: string
}): Promise<SendResult> {
  const mode = process.env.YM_BOT_MODE
  if (mode === "mock") {
    if (input.chatId === "mock-fail")
      return { ok: false, error: "mock: чат недоступен" }
    return { ok: true }
  }
  if (mode !== "real")
    return { ok: false, error: "Интеграция с Яндекс Мессенджером не настроена (YM_BOT_MODE)" }

  const token = process.env.YM_BOT_TOKEN
  if (!token) return { ok: false, error: "Не задан YM_BOT_TOKEN" }

  try {
    const bytes = await readFile(input.filePath)
    const form = new FormData()
    form.set("chat_id", input.chatId)
    form.set("text", input.caption)
    form.set(
      "document",
      new Blob([new Uint8Array(bytes)]),
      input.fileName
    )
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok)
      return { ok: false, error: `Мессенджер ответил HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Мессенджер недоступен: ${message}` }
  }
}
```

- [ ] **Step 2: Контракт-документ**

```markdown
# docs/contracts/yandex-messenger.md — бот для отправки платёжек

Статус: бот НЕ создан (предпосылка §11.3 спеки заявок). До закрытия —
`YM_BOT_MODE=mock`.

## Что нужно сделать (вне кода)

1. Создать бота в админке Яндекс 360 (messenger → боты), получить OAuth-токен.
2. Добавить бота в чаты поставщиков.
3. Для каждого чата получить `chat_id` (GUID чата; ссылка из карточки 1С —
   для человека, Bot API требует идентификатор). Пока формат соответствия
   «ссылка → chat_id» не подтверждён, бухгалтер вводит chat_id в черновике
   вручную.

## Зафиксированный формат вызова (проверить при появлении бота)

    POST https://botapi.messenger.yandex.net/bot/v1/messages/sendFile/
    Authorization: OAuth <YM_BOT_TOKEN>
    multipart/form-data: chat_id, text, document (файл)

При расхождении с фактическим API правится только
`lib/integrations/yandex-messenger.ts` (одна функция).
```

- [ ] **Step 3: env (`.env.example` в конец + локальный `.env`)**

```bash
# --- Отправка платёжек ---
# mock — без сети (dev/e2e) | real — боевой бот (нужен YM_BOT_TOKEN)
YM_BOT_MODE="mock"
# YM_BOT_TOKEN="<oauth-токен бота>"
# Каталог файлов платёжек (ручные прикрепления бухгалтера)
PAYMENT_ORDERS_DIR="var/payment-orders"
```

- [ ] **Step 4: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/yandex-messenger.ts docs/contracts/yandex-messenger.md .env.example
git commit -m "feat: адаптер Яндекс Мессенджера — sendPaymentOrder (mock/real)"
```

---

### Task 6: Экран `/dispatch` — очередь и журнал

**Files:**
- Create: `app/dispatch/actions.ts`, `app/dispatch/dispatch-row.tsx`, `app/dispatch/page.tsx`
- Test: `tests/e2e/dispatch.spec.ts` (дополнить)

- [ ] **Step 1: Server actions**

```typescript
// app/dispatch/actions.ts
"use server"

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAction } from "@/lib/auth/session"
import { computeDispatchReadiness } from "@/lib/domain/dispatch"
import { formatMoneyBig } from "@/lib/domain/money"
import { sendPaymentOrder } from "@/lib/integrations/yandex-messenger"

export type FormState = { error: string | null }

const MAX_FILE_BYTES = 15 * 1024 * 1024

function ordersDir(): string {
  return process.env.PAYMENT_ORDERS_DIR ?? "var/payment-orders"
}

// Пересчёт not_ready ↔ awaiting_confirmation после изменения файла/чата.
async function refreshReadiness(dispatchId: string): Promise<void> {
  const d = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!d || (d.status !== "not_ready" && d.status !== "awaiting_confirmation"))
    return
  const readiness = computeDispatchReadiness({
    hasFile: Boolean(d.filePath),
    hasChatId: Boolean(d.chatId),
  })
  if (readiness.status !== d.status) {
    await prisma.paymentOrderDispatch.update({
      where: { id: dispatchId },
      data: { status: readiness.status },
    })
  }
}

export async function attachDispatchFile(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (auth.error) return { error: auth.error }

  const dispatchId = String(formData.get("dispatchId") ?? "")
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0)
    return { error: "Выберите файл платёжки" }
  if (file.size > MAX_FILE_BYTES)
    return { error: "Файл больше 15 МБ" }

  const dispatch = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!dispatch) return { error: "Черновик не найден" }

  const safeName = path.basename(file.name).replace(/[^\wа-яА-ЯёЁ.\-]+/g, "_")
  const dir = ordersDir()
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${dispatchId}-${safeName}`)
  await writeFile(filePath, new Uint8Array(await file.arrayBuffer()))

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: { fileName: safeName, filePath },
  })
  await refreshReadiness(dispatchId)
  revalidatePath("/dispatch")
  return { error: null }
}

export async function setDispatchChat(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (auth.error) return { error: auth.error }

  const dispatchId = String(formData.get("dispatchId") ?? "")
  const chatId = String(formData.get("chatId") ?? "").trim()
  if (!chatId) return { error: "Укажите идентификатор чата" }

  const dispatch = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!dispatch) return { error: "Черновик не найден" }

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: { chatId },
  })
  await refreshReadiness(dispatchId)
  revalidatePath("/dispatch")
  return { error: null }
}

async function send(dispatchId: string, user: { id: string; name: string }) {
  const d = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
    include: { request: true, debit: true },
  })
  if (!d) return { error: "Черновик не найден" }
  // Повтор после ошибки — тот же путь, что и первая отправка.
  if (d.status !== "awaiting_confirmation" && d.status !== "failed")
    return { error: "Черновик не готов к отправке" }
  if (!d.filePath || !d.fileName || !d.chatId)
    return { error: "Не хватает файла или чата" }

  const caption = `Платёжное поручение по заявке №${d.request.number} · ${
    d.request.orgName
  } · ${formatMoneyBig(d.debit.amountMinor, d.request.currency)}`
  const result = await sendPaymentOrder({
    chatId: d.chatId,
    filePath: d.filePath,
    fileName: d.fileName,
    caption,
  })

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: result.ok
      ? {
          status: "sent",
          sentAt: new Date(),
          confirmedById: user.id,
          confirmedBy: user.name,
          error: null,
        }
      : { status: "failed", error: result.error },
  })
  return { error: result.ok ? null : result.error }
}

export async function confirmDispatch(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (auth.error) return { error: auth.error }
  const result = await send(String(formData.get("dispatchId") ?? ""), auth.user)
  revalidatePath("/dispatch")
  return result
}

export async function confirmAllReady(
  _prevState: FormState,
  _formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (auth.error) return { error: auth.error }

  const ready = await prisma.paymentOrderDispatch.findMany({
    where: { status: "awaiting_confirmation" },
    select: { id: true },
  })
  if (ready.length === 0) return { error: "Готовых к отправке нет" }

  const failures: string[] = []
  for (const d of ready) {
    const result = await send(d.id, auth.user)
    if (result.error) failures.push(result.error)
  }
  revalidatePath("/dispatch")
  return failures.length > 0
    ? { error: `Ошибок: ${failures.length} — ${failures[0]}` }
    : { error: null }
}

export async function skipDispatch(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("confirm_dispatch")
  if (auth.error) return { error: auth.error }

  const dispatchId = String(formData.get("dispatchId") ?? "")
  const reason = String(formData.get("reason") ?? "").trim()
  if (!reason) return { error: "Укажите причину пропуска" }

  const d = await prisma.paymentOrderDispatch.findUnique({
    where: { id: dispatchId },
  })
  if (!d) return { error: "Черновик не найден" }
  if (d.status === "sent") return { error: "Уже отправлено" }

  await prisma.paymentOrderDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "skipped",
      skipReason: reason,
      confirmedById: auth.user.id,
      confirmedBy: auth.user.name,
    },
  })
  revalidatePath("/dispatch")
  return { error: null }
}
```

- [ ] **Step 2: Клиентская строка очереди**

```tsx
// app/dispatch/dispatch-row.tsx
"use client"

import { useActionState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  attachDispatchFile,
  confirmAllReady,
  confirmDispatch,
  setDispatchChat,
  skipDispatch,
  type FormState,
} from "./actions"

export type QueueRow = {
  id: string
  requestUid: string
  requestNumber: string
  partnerName: string
  amountText: string
  debitDateText: string
  status: "not_ready" | "awaiting_confirmation" | "failed"
  missing: string[]
  fileName: string | null
  chatUrl: string | null
  chatId: string | null
  error: string | null
}

const initialState: FormState = { error: null }

export function DispatchQueueRow({ row }: { row: QueueRow }) {
  const [fileState, fileAction, filePending] = useActionState(
    attachDispatchFile,
    initialState
  )
  const [chatState, chatAction, chatPending] = useActionState(
    setDispatchChat,
    initialState
  )
  const [sendState, sendAction, sendPending] = useActionState(
    confirmDispatch,
    initialState
  )
  const [skipState, skipAction, skipPending] = useActionState(
    skipDispatch,
    initialState
  )
  const anyError =
    fileState.error ?? chatState.error ?? sendState.error ?? skipState.error

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/requests/${row.requestUid}`}
          className="text-primary font-medium underline underline-offset-4"
        >
          {row.requestNumber}
        </a>
        <span>{row.partnerName}</span>
        <span className="font-medium">{row.amountText}</span>
        <span className="text-muted-foreground">
          списание {row.debitDateText}
        </span>
        {row.status === "awaiting_confirmation" && (
          <Badge>готово к отправке</Badge>
        )}
        {row.status === "not_ready" && (
          <Badge variant="outline">не хватает: {row.missing.join(", ")}</Badge>
        )}
        {row.status === "failed" && (
          <Badge variant="destructive">ошибка: {row.error}</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={fileAction} className="flex items-center gap-2">
          <input type="hidden" name="dispatchId" value={row.id} />
          {row.fileName ? (
            <span className="text-sm">📄 {row.fileName}</span>
          ) : null}
          <input
            type="file"
            name="file"
            aria-label={`Файл платёжки для ${row.requestNumber}`}
            className="text-sm"
          />
          <Button type="submit" variant="outline" size="sm" disabled={filePending}>
            Прикрепить
          </Button>
        </form>

        <form action={chatAction} className="flex items-center gap-2">
          <input type="hidden" name="dispatchId" value={row.id} />
          {row.chatUrl && (
            <a
              href={row.chatUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              💬 чат (ссылка из 1С)
            </a>
          )}
          <Input
            name="chatId"
            defaultValue={row.chatId ?? ""}
            placeholder="chat_id для бота"
            aria-label={`Чат для ${row.requestNumber}`}
            className="h-9 w-48"
          />
          <Button type="submit" variant="outline" size="sm" disabled={chatPending}>
            Сохранить чат
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={sendAction}>
          <input type="hidden" name="dispatchId" value={row.id} />
          <Button
            type="submit"
            size="sm"
            disabled={
              sendPending ||
              (row.status !== "awaiting_confirmation" && row.status !== "failed")
            }
          >
            {sendPending
              ? "Отправляю…"
              : row.status === "failed"
                ? "Повторить"
                : "Отправить"}
          </Button>
        </form>
        <form action={skipAction} className="flex items-center gap-2">
          <input type="hidden" name="dispatchId" value={row.id} />
          <Input
            name="reason"
            placeholder="Причина пропуска"
            aria-label={`Причина пропуска ${row.requestNumber}`}
            className="h-9 w-56"
          />
          <Button type="submit" variant="ghost" size="sm" disabled={skipPending}>
            Пропустить
          </Button>
        </form>
      </div>

      {anyError && <p className="text-destructive text-sm">{anyError}</p>}
    </div>
  )
}

export function ConfirmAllButton() {
  const [state, formAction, isPending] = useActionState(
    confirmAllReady,
    initialState
  )
  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" disabled={isPending}>
        {isPending ? "Отправляю…" : "Отправить все готовые"}
      </Button>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Страница**

```tsx
// app/dispatch/page.tsx
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
import { computeDispatchReadiness } from "@/lib/domain/dispatch"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ConfirmAllButton,
  DispatchQueueRow,
  type QueueRow,
} from "./dispatch-row"

export const dynamic = "force-dynamic"

export default async function DispatchPage() {
  const user = await getCurrentUser()
  // Просмотр — всем; действия внутри требуют confirm_dispatch на сервере.
  if (!user) notFound()
  const canConfirm = can(user.role as Role, "confirm_dispatch")

  const [queue, journal] = await Promise.all([
    prisma.paymentOrderDispatch.findMany({
      where: { status: { in: ["not_ready", "awaiting_confirmation", "failed"] } },
      include: { request: true, debit: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentOrderDispatch.findMany({
      where: { status: { in: ["sent", "skipped"] } },
      include: { request: true, debit: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

  const rows: QueueRow[] = queue.map((d) => ({
    id: d.id,
    requestUid: d.request.uid,
    requestNumber: d.request.number,
    partnerName: d.request.partnerName ?? "",
    amountText: formatMoneyBig(d.debit.amountMinor, d.request.currency),
    debitDateText: formatDate(d.debit.date),
    status: d.status as QueueRow["status"],
    missing: computeDispatchReadiness({
      hasFile: Boolean(d.filePath),
      hasChatId: Boolean(d.chatId),
    }).missing,
    fileName: d.fileName,
    chatUrl: d.chatUrl,
    chatId: d.chatId,
    error: d.error,
  }))

  const hasReady = rows.some((r) => r.status === "awaiting_confirmation")

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Отправка платёжек</h1>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Очередь</h2>
          {canConfirm && hasReady && <ConfirmAllButton />}
        </div>
        {rows.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Очередь пуста. Черновики создаёт синк по списаниям заявок со
            статьёй «оплата за товар» (Настройки → Статьи ДДС).
          </p>
        )}
        {canConfirm ? (
          rows.map((row) => <DispatchQueueRow key={row.id} row={row} />)
        ) : (
          <p className="text-muted-foreground text-sm">
            {rows.length > 0 &&
              "Подтверждение отправок доступно бухгалтеру и собственнику."}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Журнал</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Заявка</TableHead>
              <TableHead>Поставщик</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Кто / когда</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Отправок ещё не было.
                </TableCell>
              </TableRow>
            )}
            {journal.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.request.number}</TableCell>
                <TableCell>{d.request.partnerName}</TableCell>
                <TableCell className="text-right">
                  {formatMoneyBig(d.debit.amountMinor, d.request.currency)}
                </TableCell>
                <TableCell>
                  {d.status === "sent" ? (
                    <Badge>отправлено</Badge>
                  ) : (
                    <Badge variant="outline">
                      пропущено{d.skipReason ? `: ${d.skipReason}` : ""}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {d.confirmedBy}
                  {d.sentAt ? ` · ${formatDate(d.sentAt)}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: E2e (добавить в `tests/e2e/dispatch.spec.ts`)**

Черновик по `fx-deb-1` одноразовый (после отправки — в журнале), поэтому
перед прогоном спека нужна чистая БД: `npm run db:reset` (скрипт — Task 7).

```typescript
test("ручной режим: файл + чат, ошибка mock, повтор, журнал", async ({
  page,
}) => {
  await loginAs(page, "accountant")
  await syncFixtureData(page)
  await page.goto("/dispatch")

  // Черновик REQ-0001 создан синком: не хватает файла и чата
  await expect(page.getByText("REQ-0001")).toBeVisible()
  await expect(
    page.getByText("не хватает: файл платёжки, чат поставщика")
  ).toBeVisible()

  // Прикрепляем файл
  await page
    .getByLabel("Файл платёжки для REQ-0001")
    .setInputFiles({
      name: "p-0001.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e"),
    })
  await page.getByRole("button", { name: "Прикрепить" }).click()
  await expect(page.getByText("📄 p-0001.pdf")).toBeVisible()

  // Чат с «падающим» mock-идентификатором → отправка даёт ошибку
  await page.getByLabel("Чат для REQ-0001").fill("mock-fail")
  await page.getByRole("button", { name: "Сохранить чат" }).click()
  await expect(page.getByText("готово к отправке")).toBeVisible()
  await page.getByRole("button", { name: "Отправить", exact: true }).click()
  await expect(page.getByText("ошибка: mock: чат недоступен")).toBeVisible()

  // Чиним чат и повторяем
  await page.getByLabel("Чат для REQ-0001").fill("mock-chat-1")
  await page.getByRole("button", { name: "Сохранить чат" }).click()
  await page.getByRole("button", { name: "Повторить" }).click()

  // Ушло в журнал с автором подтверждения
  await expect(page.getByText("отправлено")).toBeVisible()
  await expect(page.getByText("E2E Бухгалтер")).toBeVisible()
})

test("viewer видит журнал, но не действия", async ({ page }) => {
  await loginAs(page, "viewer")
  await page.goto("/dispatch")
  await expect(
    page.getByRole("heading", { name: "Отправка платёжек" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Отправить" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Прикрепить" })).toHaveCount(0)
})
```

- [ ] **Step 5: Запустить e2e**

Run: `npm run db:reset && npm run test:e2e -- tests/e2e/dispatch.spec.ts`
(скрипт `db:reset` появится в Task 7 — при выполнении задач по порядку
временно: `npx prisma migrate reset --force`)
Expected: PASS (3 теста).

- [ ] **Step 6: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/dispatch/ tests/e2e/dispatch.spec.ts
git commit -m "feat: экран отправки платёжек — очередь, ручной режим, журнал"
```

---

### Task 7: Навигация, db:reset, финальный прогон

**Files:**
- Modify: `app/page.tsx`, `package.json`, `.gitignore`

- [ ] **Step 1: Ссылки с главной (`app/page.tsx`, рядом с существующими)**

```tsx
        <div>
          <Link
            href="/dispatch"
            className="text-primary underline underline-offset-4"
          >
            Отправка платёжек
          </Link>
        </div>
        <div>
          <Link
            href="/settings/cash-flow-items"
            className="text-primary underline underline-offset-4"
          >
            Статьи ДДС
          </Link>
        </div>
```

- [ ] **Step 2: Скрипт сброса dev-БД (в `package.json` → `scripts`)**

```json
    "db:reset": "prisma migrate reset --force",
```

(`migrate reset` сам запускает seed — очередь отправок возвращается
в исходное состояние; нужно для повторных прогонов e2e dispatch.)

- [ ] **Step 3: Каталог файлов платёжек — в `.gitignore`**

```
var/
```

- [ ] **Step 4: Полный прогон**

Run: `npm run db:reset && npm run format && npm run lint && npm run typecheck && npm run test && npm run test:e2e`
Expected: всё зелёное.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx package.json .gitignore
git commit -m "feat: навигация к отправке платёжек и статьям ДДС, db:reset"
```

---

## Что считается готовым (Definition of Done)

- Синк пополняет справочник статей ДДС и создаёт черновики отправок по
  новым списаниям заявок «за товар»; дубли исключены `[requestId, debitId]`;
  счётчик — в `SyncRun.dispatchesCreated`.
- `/dispatch`: очередь (not_ready → прикрепить файл/указать чат →
  awaiting_confirmation), «Отправить», «Отправить все готовые», «Повторить»
  после ошибки, «Пропустить» с причиной; журнал с автором и временем.
- Отправка уходит через `sendPaymentOrder` (mock в dev/e2e; real —
  по контракту `docs/contracts/yandex-messenger.md` после появления бота).
- Права: действия — owner/accountant (`confirm_dispatch`), viewer видит
  только журнал; авторство — `confirmedById` + снапшот имени (спека
  авторизации §8).
- Ручных ретраев в коде нет — повтор только кнопкой (защита от спама
  в чат поставщика, спека §8).
- Unit (готовность черновика) и e2e (полный ручной цикл с ошибкой
  и повтором) зелёные.


