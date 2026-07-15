# План 11: Отчёт «БДР Маркетплейсы» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Недельный P&L по 6 кабинетам WB/OZON в finflow: статьи из БД (порт выверенных запросов), cogs по прайс-листу 1С, ориентир-fallback из загружаемого xlsx, нижние общефирменные блоки с пересчётом формул от живой валовой.

**Architecture:** Синк scope `reports` (создан планом 10) получает шаги `bdr_wb` / `bdr_ozon` / `bdr_cogs` — фетчеры с fixture (снапшоты реальных кэшей) и mssql-реализациями. Ориентир парсится exceljs по координатам старого `bdr.py` (строка 3 — коды недель ГГНН, блоки кабинетов по диапазонам строк с матчингом лейблов, нижние секции по фиксированным строкам) в `BdrOrientirLine`. Домен `lib/domain/bdr.ts` собирает датасет: БД-недели переопределяют ориентир, формулы нижних блоков (опер./чистая прибыль, распределение, коэффициенты) пересчитываются от живых входов.

**Tech Stack:** Next.js, TypeScript, Prisma, exceljs (план 10), shadcn charts, mssql-пул плана 8 (+OPENQUERY для cogs), Vitest, Playwright.

**Спека:** `2026-07-15-bdr-marketplaces-design.md`.

**Зависимости:** план 10 реализован (scope reports, exceljs, `lib/domain/weeks.ts`, право `manage_report_settings`, chart-компонент). Боевые фетчеры (Task 8) требуют план 08; cogs дополнительно — права SQL-логина на `OPENQUERY` (предпосылка §11.2 спеки).

**Числовая точность:** как в плане 10 — `Decimal(18,2)`/number-рубли (отчётные агрегаты).

**Правила репозитория** (из `CLAUDE.md`): проверки перед каждым коммитом; server actions с `FormState`; `lib/domain/` без I/O с unit-тестами; UI на русском, код на английском, conventional commits.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma` (modify) | `BdrWeekLine`, `BdrOrientirLine`, `BdrOrientirUpload`, `BdrSetting` |
| `lib/domain/bdr.ts` (create) | Константы блоков/статей, формулы WB, residual OZON, merge БД/ориентир, нижние формулы |
| `lib/integrations/bdr-facts.ts` (create) | Интерфейсы фетчеров, fixture-реализации (снапшоты кэшей), фабрика `BDR_FACT_SOURCE` |
| `lib/integrations/bdr-facts-mssql.ts` (create) | Боевые фетчеры: WB-статьи, OZON-статьи, cogs (OPENQUERY) |
| `lib/reports/bdr-orientir-parser.ts` (create) | Парсер листа «БДР» ориентира (exceljs) |
| `lib/sync/run-reports-sync.ts` (modify) | + шаги `bdr_wb`, `bdr_ozon`, `bdr_cogs` |
| `app/reports/bdr/page.tsx`, `bdr-view.tsx` (create) | Экран: фильтры, KPI, график, режимы, таблица, нижние секции |
| `app/reports/bdr/settings/page.tsx`, `settings-form.tsx`, `actions.ts` (create) | Загрузка ориентира, исключённые бренды |
| `prisma/fixtures/bdr-wb-cache.json`, `bdr-ozon-cache.json` (уже скопированы) | Снапшоты реальных недельных статей |
| `prisma/seed.ts` (modify) | Сид настройки брендов (факт приедет reports-синком) |
| `.env.example` (modify) | `BDR_FACT_SOURCE` |
| `tests/e2e/bdr-report.spec.ts` (create) | Смоук отчёта и настроек |

---

### Task 1: Prisma — таблицы БДР

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/seed.ts`

- [ ] **Step 1: Модели (в конец `prisma/schema.prisma`)**

```prisma
// --- Отчёт «БДР Маркетплейсы» (спека 2026-07-15-bdr-marketplaces-design) ---

enum BdrChannel {
  wb
  ozon
}

// Статьи кабинетов по неделям из БД (порт bdr_*_db_cache.json).
model BdrWeekLine {
  id       String     @id @default(cuid())
  channel  BdrChannel
  blockId  String // ip-bobrovskaya | tori-brands | rusbubon | laretto | shapki | lrtt
  weekCode Int // ГГНН
  line     String // revenue | commission | logistics | ... | cogs
  value    Decimal    @db.Decimal(18, 2)
  syncedAt DateTime   @db.Timestamptz(3)

  @@unique([channel, blockId, weekCode, line])
  @@index([weekCode])
  @@map("bdr_week_lines")
}

// Распарсенный ориентир: статьи кабинетов (rowKey "wb:ip-bobrovskaya:revenue")
// и строки нижних секций (rowKey "sections:opex:prod"). Активна последняя загрузка.
model BdrOrientirLine {
  id       String  @id @default(cuid())
  weekCode Int
  rowKey   String
  value    Decimal @db.Decimal(18, 2)
  uploadId String

  upload BdrOrientirUpload @relation(fields: [uploadId], references: [id])

  @@unique([weekCode, rowKey])
  @@map("bdr_orientir_lines")
}

model BdrOrientirUpload {
  id           String   @id @default(cuid())
  fileName     String
  rowsParsed   Int
  uploadedById String?
  uploadedBy   String
  createdAt    DateTime @default(now()) @db.Timestamptz(3)

  lines BdrOrientirLine[]

  @@map("bdr_orientir_uploads")
}

model BdrSetting {
  id    String @id @default(cuid())
  key   String @unique
  value String

  @@map("bdr_settings")
}
```

- [ ] **Step 2: Сид настройки (в `prisma/seed.ts`, рядом с настройками ИУ)**

```typescript
  await prisma.bdrSetting.upsert({
    where: { key: "excludedBrands" },
    update: {},
    create: { key: "excludedBrands", value: "Vontel,НШФ" },
  })
  console.log("Seed: настройки БДР (исключённые бренды)")
```

- [ ] **Step 3: Миграция**

Run: `npx prisma migrate dev --name bdr_report`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add prisma/
git commit -m "feat: схема отчёта БДР — недельные статьи, ориентир, настройки"
```

---

### Task 2: Домен — константы, формулы WB, residual OZON (TDD)

**Files:**
- Create: `lib/domain/bdr.ts`
- Test: `lib/domain/bdr.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```typescript
// lib/domain/bdr.test.ts
import { describe, expect, it } from "vitest"
import {
  BLOCKS,
  linesFromWbComponents,
  opLine,
  svcLine,
  WB_ACC2BLK,
} from "./bdr"

describe("константы", () => {
  it("маппинг аккаунтов и блоки", () => {
    expect(WB_ACC2BLK[1]).toBe("tori-brands")
    expect(WB_ACC2BLK[2]).toBe("ip-bobrovskaya")
    expect(BLOCKS.find((b) => b.id === "laretto")?.channel).toBe("ozon")
  })
})

describe("linesFromWbComponents — формулы статей WB (сверены до рубля)", () => {
  it("контрольные суммы Бобровская W24 из доки миграции", () => {
    // Компоненты подобраны так, чтобы дать эталонные статьи W24:
    const lines = linesFromWbComponents({
      revenue: 51_562_771,
      payNet: 43_924_560, // pay_net = revenue + commission
      deliv: 8_000_000,
      storage: 900_000,
      deduction: 400_000,
      acceptance: 60_000,
      penalty: 32_486,
    })
    expect(lines.revenue).toBe(51_562_771)
    expect(lines.commission).toBe(-7_638_211) // pay_net − revenue
    expect(lines.logistics).toBe(-8_000_000)
    expect(lines.storage).toBe(-900_000)
    expect(lines.ads).toBe(-400_000)
    expect(lines.acceptance).toBe(-60_000)
    expect(lines.fines).toBe(-32_486)
    // грязная = сумма всех статей
    expect(lines.gross_rev).toBe(
      51_562_771 - 7_638_211 - 8_000_000 - 900_000 - 400_000 - 60_000 - 32_486
    )
  })
})

describe("маппинг услуг/операций OZON на статьи", () => {
  it("услуги по английским кодам", () => {
    expect(svcLine("MarketplaceServiceItemAcquiring")).toBe("acquiring")
    expect(svcLine("MarketplaceServiceItemStarsMembership")).toBe("ads")
    expect(svcLine("MarketplaceServiceItemLogistic")).toBe("logistics")
    expect(svcLine("MarketplaceServiceItemReturnsPVZ")).toBe("logistics")
    expect(svcLine("что-то неизвестное")).toBe("other")
  })
  it("операции по русским названиям", () => {
    expect(opLine("Оплата эквайринга")).toBe("acquiring")
    expect(opLine("Звёздные товары")).toBe("ads")
    expect(opLine("Трафареты")).toBe("ads")
    expect(opLine("Услуга размещения товаров на складе")).toBe("storage")
    expect(opLine("Доставка покупателю")).toBe("logistics")
    expect(opLine("Обратная логистика")).toBe("logistics")
    expect(opLine("Неизвестная операция")).toBe("other")
  })
})
```

- [ ] **Step 2: FAIL — файла нет**

Run: `npx vitest run lib/domain/bdr.test.ts`

- [ ] **Step 3: Реализация (первая часть домена)**

```typescript
// lib/domain/bdr.ts
// БДР Маркетплейсы: константы структуры, формулы статей, merge БД/ориентир,
// нижние блоки. Чистая логика (рубли number — отчётные агрегаты).
// Порт fin/finflow-app/bdr.py и bdr_*_lines_from_db.py (сверено до рубля).

export type BdrChannel = "wb" | "ozon"

export const WB_ACC2BLK: Record<number, string> = {
  1: "tori-brands",
  2: "ip-bobrovskaya",
  3: "rusbubon",
}
export const OZ_ACC2BLK: Record<number, string> = {
  2: "laretto",
  1: "shapki",
  3: "lrtt",
}

export type BdrBlock = { id: string; name: string; channel: BdrChannel }
export const BLOCKS: BdrBlock[] = [
  { id: "ip-bobrovskaya", name: "ИП Бобровская", channel: "wb" },
  { id: "tori-brands", name: "ООО TORI BRANDS", channel: "wb" },
  { id: "rusbubon", name: "ООО Русбубон", channel: "wb" },
  { id: "laretto", name: "LARETTO", channel: "ozon" },
  { id: "shapki", name: "ШАПКИ", channel: "ozon" },
  { id: "lrtt", name: "LRTT новый", channel: "ozon" },
]

// Статьи в порядке отображения; label — для UI и для матчинга в ориентире.
export type LineDef = { key: string; label: string; kind: "in" | "out" | "subtotal" | "total" }
export const WB_LINE_DEFS: LineDef[] = [
  { key: "revenue", label: "Выручка с продаж", kind: "in" },
  { key: "commission", label: "Комиссия", kind: "out" },
  { key: "logistics", label: "Логистика итого", kind: "out" },
  { key: "storage", label: "Хранение", kind: "out" },
  { key: "ads", label: "Реклама", kind: "out" },
  { key: "acceptance", label: "Платная приёмка", kind: "out" },
  { key: "fines", label: "Штрафы", kind: "out" },
  { key: "gross_rev", label: "Грязная выручка (к перечислению)", kind: "subtotal" },
  { key: "cogs", label: "Себестоимость продаж", kind: "out" },
  { key: "delivery", label: "Доставка до складов МП", kind: "out" },
  { key: "gross_profit", label: "Валовая прибыль", kind: "total" },
]
export const OZ_LINE_DEFS: LineDef[] = [
  { key: "revenue", label: "Выручка с продаж", kind: "in" },
  { key: "commission", label: "Комиссия", kind: "out" },
  { key: "logistics", label: "Логистика", kind: "out" },
  { key: "acquiring", label: "Эквайринг", kind: "out" },
  { key: "ads", label: "Реклама", kind: "out" },
  { key: "storage", label: "Хранение", kind: "out" },
  { key: "other", label: "Прочее", kind: "out" },
  { key: "gross_rev", label: "Грязная выручка (к перечислению)", kind: "subtotal" },
  { key: "cogs", label: "Себестоимость продаж", kind: "out" },
  { key: "delivery", label: "Доставка до складов МП", kind: "out" },
  { key: "gross_profit", label: "Валовая прибыль", kind: "total" },
]

// ── WB: статьи из сырых компонентов реализации (bdr_wb_lines_from_db.py) ──
export type WbComponents = {
  revenue: number
  payNet: number
  deliv: number
  storage: number
  penalty: number
  deduction: number
  acceptance: number
}

export function linesFromWbComponents(c: WbComponents): Record<string, number> {
  const commission = c.payNet - c.revenue
  const logistics = -c.deliv
  const storage = -c.storage
  const ads = -c.deduction
  const acceptance = -c.acceptance
  const fines = -c.penalty
  const gross_rev =
    c.revenue + commission + logistics + storage + ads + acceptance + fines
  return {
    revenue: c.revenue,
    commission,
    logistics,
    storage,
    ads,
    acceptance,
    fines,
    gross_rev,
  }
}

// ── OZON: маппинг услуг (service_name, англ-коды) и операций (рус) на статьи;
// residual замыкает грязную (bdr_ozon_lines_from_db.py) ──
export function svcLine(name: string | null): string {
  const n = name ?? ""
  if (n.includes("Acquiring")) return "acquiring"
  if (
    n.includes("StarsMembership") ||
    n.includes("PremiumCashback") ||
    n.includes("GettingToTheTop") ||
    n.includes("Promotion") ||
    n.includes("Stars")
  )
    return "ads"
  if (
    n.includes("Logistic") ||
    n.includes("LastMile") ||
    n.includes("ReturnsPVZ") ||
    n.includes("DeliveryToHandover") ||
    n.includes("Dropoff")
  )
    return "logistics"
  return "other"
}

export function opLine(name: string | null): string {
  const t = (name ?? "").toLowerCase()
  if (t.startsWith("оплата эквайринга")) return "acquiring"
  if (
    t.startsWith("звёздные товары") ||
    t.startsWith("звездные товары") ||
    t.startsWith("бонусы продавца") ||
    t.startsWith("трафарет") ||
    t.startsWith("продвижение") ||
    t.startsWith("вывод в топ") ||
    t.startsWith("баллы за отзыв")
  )
    return "ads"
  if (t.startsWith("услуга размещения товаров на складе")) return "storage"
  if (
    t.startsWith("доставка покупателю") ||
    t.startsWith("доставка и обработка возврат") ||
    t.startsWith("получение возврат") ||
    t.startsWith("логистика") ||
    t.startsWith("обратная логистика")
  )
    return "logistics"
  return "other"
}
```

- [ ] **Step 4: PASS (4 теста), проверки и commit**

```bash
npx vitest run lib/domain/bdr.test.ts
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/bdr.ts lib/domain/bdr.test.ts
git commit -m "feat: домен БДР — структура, формулы WB, маппинг OZON"
```

---

### Task 3: Домен — merge БД/ориентир и нижние формулы (TDD)

**Files:**
- Modify: `lib/domain/bdr.ts`
- Test: `lib/domain/bdr.test.ts`

- [ ] **Step 1: Написать падающие тесты (добавить в конец)**

```typescript
import { buildDataset, computeLowerBlocks, type BdrDataset } from "./bdr"

describe("buildDataset — merge БД поверх ориентира", () => {
  const db = [
    { channel: "wb" as const, blockId: "tori-brands", weekCode: 2624, line: "revenue", value: 100 },
    { channel: "wb" as const, blockId: "tori-brands", weekCode: 2624, line: "gross_rev", value: 60 },
    { channel: "wb" as const, blockId: "tori-brands", weekCode: 2624, line: "cogs", value: -30 },
  ]
  const orientir = new Map([
    ["wb:tori-brands:revenue", new Map([[2624, 90], [2625, 95]])],
    ["wb:tori-brands:gross_rev", new Map([[2624, 55], [2625, 58]])],
  ])

  it("неделя с БД-данными берётся из БД и помечается db", () => {
    const ds = buildDataset(db, orientir)
    expect(ds.get("wb:tori-brands:revenue")?.get(2624)).toEqual({ value: 100, source: "db" })
  })
  it("неделя без БД — из ориентира с пометкой", () => {
    const ds = buildDataset(db, orientir)
    expect(ds.get("wb:tori-brands:revenue")?.get(2625)).toEqual({ value: 95, source: "orientir" })
  })
  it("gross_profit достраивается: gross_rev + cogs (+delivery)", () => {
    const ds = buildDataset(db, orientir)
    expect(ds.get("wb:tori-brands:gross_profit")?.get(2624)).toEqual({ value: 30, source: "db" })
  })
})

describe("computeLowerBlocks — формулы от живой валовой (bdr.py 489–521)", () => {
  const inputs = new Map([
    ["sections:opex:prod", new Map([[2624, -204_854]])],
    ["sections:opex:comm", new Map([[2624, 356_700]])],
    ["sections:opex:admin", new Map([[2624, -1_080_420]])],
    ["sections:opex:other_inc", new Map([[2624, 78_845]])],
    ["sections:opex:other_exp", new Map([[2624, -5_232_910]])],
  ])

  it("контроль W24: опер. 14 615 457 и ЧП от валовой 15 544 031", () => {
    const lower = computeLowerBlocks({
      weekCode: 2624,
      grossAll: 15_544_031,
      revenueAll: 55_000_000,
      cogsAll: -19_000_000,
      inputs,
    })
    expect(Math.round(lower.opProfit)).toBe(14_615_457)
    // Ориентир показывает 9 461 393 — расхождение 1 ₽ от округления
    // входов в самом Excel; точная сумма слагаемых — 9 461 392.
    expect(Math.round(lower.netProfit)).toBe(9_461_392)
  })

  it("распределение: 5% / 60%, страховка 6% выручки при рент.>6%", () => {
    const lower = computeLowerBlocks({
      weekCode: 2624,
      grossAll: 15_544_031,
      revenueAll: 55_000_000,
      cogsAll: -19_000_000,
      inputs,
    })
    const np = lower.netProfit
    expect(lower.dist.safety).toBeCloseTo(np * 0.05, 2)
    expect(lower.dist.reinvest60).toBeCloseTo(np * 0.6, 2)
    expect(lower.dist.insurance).toBeCloseTo(0.06 * 55_000_000, 2) // рент. > 6%
    // дивиденды = остаток страховки + 80% остатка сверхдохода
    const dolyaS = lower.dist.insurance / np
    const ostS = lower.dist.insurance - dolyaS * lower.dist.safety - dolyaS * lower.dist.reinvest60
    const surplus = (np / 55_000_000 - 0.06) * 55_000_000
    const dolyaSd = surplus / np
    const ostSd = surplus - dolyaSd * lower.dist.safety - dolyaSd * lower.dist.reinvest60
    expect(lower.dist.divs).toBeCloseTo(ostS + ostSd * 0.8, 2)
    expect(lower.dist.fundSu).toBeCloseTo(ostSd * 0.2, 2)
    expect(lower.dist.ccReinvest).toBeCloseTo(lower.dist.reinvest60 - -19_000_000, 2)
  })

  it("рентабельность ≤ 0 → страховка 0, сверхдоход 0", () => {
    const zero = new Map([["sections:opex:prod", new Map([[2624, -100]])]])
    const lower = computeLowerBlocks({
      weekCode: 2624,
      grossAll: 50,
      revenueAll: 1000,
      cogsAll: 0,
      inputs: zero,
    })
    expect(lower.netProfit).toBeLessThan(0)
    expect(lower.dist.insurance).toBe(0)
    expect(lower.dist.surplus).toBe(0)
  })
})
```

- [ ] **Step 2: FAIL**

Run: `npx vitest run lib/domain/bdr.test.ts`

- [ ] **Step 3: Реализация (добавить в `lib/domain/bdr.ts`)**

```typescript
// ── Сборка датасета: БД-строки переопределяют ориентир по неделям ──
export type CellSource = "db" | "orientir"
export type Cell = { value: number; source: CellSource }
// rowKey ("wb:tori-brands:revenue") → weekCode → Cell
export type BdrDataset = Map<string, Map<number, Cell>>

export type DbLineRow = {
  channel: BdrChannel
  blockId: string
  weekCode: number
  line: string
  value: number
}

export function rowKey(channel: BdrChannel, blockId: string, line: string): string {
  return `${channel}:${blockId}:${line}`
}

export function buildDataset(
  db: DbLineRow[],
  orientir: Map<string, Map<number, number>>
): BdrDataset {
  const ds: BdrDataset = new Map()
  const put = (key: string, week: number, cell: Cell, overwrite: boolean) => {
    const row = ds.get(key) ?? new Map<number, Cell>()
    if (overwrite || !row.has(week)) row.set(week, cell)
    ds.set(key, row)
  }
  for (const [key, weeks] of orientir) {
    for (const [week, value] of weeks) put(key, week, { value, source: "orientir" }, true)
  }
  for (const r of db) {
    put(rowKey(r.channel, r.blockId, r.line), r.weekCode, { value: r.value, source: "db" }, true)
  }
  // Валовая достраивается на БД-неделях: gross_rev + cogs + delivery.
  for (const block of BLOCKS) {
    const gr = ds.get(rowKey(block.channel, block.id, "gross_rev"))
    if (!gr) continue
    for (const [week, cell] of gr) {
      if (cell.source !== "db") continue
      const get = (line: string) =>
        ds.get(rowKey(block.channel, block.id, line))?.get(week)?.value ?? 0
      put(
        rowKey(block.channel, block.id, "gross_profit"),
        week,
        { value: cell.value + get("cogs") + get("delivery"), source: "db" },
        true
      )
    }
  }
  return ds
}

// ── Нижние блоки: входы из ориентира, формулы — от живой валовой
// (порт bdr.py: op/net profit + распределение R731–R752) ──
export type LowerBlocks = {
  opProfit: number
  netProfit: number
  dist: {
    safety: number
    reinvest60: number
    insurance: number
    surplus: number
    fundSu: number
    divs: number
    ccReinvest: number
  }
}

export function computeLowerBlocks(input: {
  weekCode: number
  grossAll: number // валовая по всем кабинетам (живая, из датасета)
  revenueAll: number // выручка по всем кабинетам
  cogsAll: number // cogs по всем кабинетам (отрицательная)
  inputs: Map<string, Map<number, number>> // строки ориентира sections:*
}): LowerBlocks {
  const g = (key: string) =>
    input.inputs.get(`sections:opex:${key}`)?.get(input.weekCode) ?? 0
  const opProfit = input.grossAll + g("prod") + g("comm") + g("admin")
  const netProfit = opProfit + g("other_inc") + g("other_exp")

  const rev = input.revenueAll
  const rent = rev !== 0 ? netProfit / rev : 0
  const safety = netProfit * 0.05
  const reinvest60 = netProfit * 0.6
  let insurance = 0
  if (rent > 0.06) insurance = 0.06 * rev
  else if (rent > 0) insurance = netProfit
  const dolyaS = netProfit !== 0 ? insurance / netProfit : 0
  const ostS = insurance - dolyaS * safety - dolyaS * reinvest60
  const surplus = Math.max(rent - 0.06, 0) * rev
  const dolyaSd = netProfit !== 0 ? surplus / netProfit : 0
  const ostSd = surplus - dolyaSd * safety - dolyaSd * reinvest60
  return {
    opProfit,
    netProfit,
    dist: {
      safety,
      reinvest60,
      insurance,
      surplus,
      fundSu: ostSd * 0.2,
      divs: ostS + ostSd * 0.8,
      ccReinvest: reinvest60 - input.cogsAll,
    },
  }
}
```

- [ ] **Step 4: PASS (10 тестов), проверки и commit**

```bash
npx vitest run lib/domain/bdr.test.ts
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/domain/bdr.ts lib/domain/bdr.test.ts
git commit -m "feat: домен БДР — merge БД/ориентир и формулы нижних блоков"
```

---

### Task 4: Фетчеры фактов (fixture) и шаги синка

Fixture — снапшоты реальных кэшей (`prisma/fixtures/bdr-wb-cache.json`,
`bdr-ozon-cache.json`, структура `{"weeks": {"2619": {"1": {line: value}}}}`,
ключ аккаунта — строка).

**Files:**
- Create: `lib/integrations/bdr-facts.ts`
- Modify: `lib/sync/run-reports-sync.ts`, `.env.example`, локальный `.env`

- [ ] **Step 1: Интерфейс и fixture-фетчеры**

```typescript
// lib/integrations/bdr-facts.ts
// Недельные статьи БДР. BDR_FACT_SOURCE: fixture (снапшоты реальных кэшей)
// | dwh (Task 8). Fixture отдаёт все недели снапшота независимо от диапазона.
import wbCache from "@/prisma/fixtures/bdr-wb-cache.json"
import ozonCache from "@/prisma/fixtures/bdr-ozon-cache.json"
import {
  OZ_ACC2BLK,
  WB_ACC2BLK,
  type BdrChannel,
  type DbLineRow,
} from "@/lib/domain/bdr"

export interface BdrLinesFetcher {
  // Статьи по неделям диапазона [weekFrom, weekTo] (коды ГГНН, включительно).
  fetch(weekFrom: number, weekTo: number): Promise<DbLineRow[]>
}

type Cache = { weeks: Record<string, Record<string, Record<string, number>>> }

function fromCache(
  cache: Cache,
  channel: BdrChannel,
  acc2blk: Record<number, string>
): BdrLinesFetcher {
  return {
    async fetch(weekFrom, weekTo) {
      const rows: DbLineRow[] = []
      for (const [codeStr, accounts] of Object.entries(cache.weeks)) {
        const weekCode = Number(codeStr)
        if (weekCode < weekFrom || weekCode > weekTo) continue
        for (const [accStr, lines] of Object.entries(accounts)) {
          const blockId = acc2blk[Number(accStr)]
          if (!blockId) continue
          for (const [line, value] of Object.entries(lines)) {
            rows.push({ channel, blockId, weekCode, line, value })
          }
        }
      }
      return rows
    },
  }
}

export const fixtureBdrWb = fromCache(wbCache as Cache, "wb", WB_ACC2BLK)
export const fixtureBdrOzon = fromCache(ozonCache as Cache, "ozon", OZ_ACC2BLK)

export type BdrFetchers = { wb: BdrLinesFetcher; ozon: BdrLinesFetcher }

export function getBdrFetchers(): BdrFetchers {
  const source = process.env.BDR_FACT_SOURCE ?? "fixture"
  if (source === "fixture") return { wb: fixtureBdrWb, ozon: fixtureBdrOzon }
  throw new Error(
    `BDR_FACT_SOURCE="${source}" не поддерживается: dwh-фетчеры — Task 8 этого плана`
  )
}
```

(Заметка: в fixture-снапшоте WB-кэша cogs уже включён в строки — отдельного
fixture-шага cogs не нужно; боевой режим считает cogs отдельным шагом, Task 8.)

- [ ] **Step 2: Шаги в синке отчётов**

В `lib/sync/run-reports-sync.ts`:

1. Импорты:

```typescript
import { getBdrFetchers } from "@/lib/integrations/bdr-facts"
import { weekCode } from "@/lib/domain/weeks"
import type { DbLineRow } from "@/lib/domain/bdr"
```

2. Функция шага (рядом с `syncIuFacts`):

```typescript
async function syncBdrLines(rows: DbLineRow[]): Promise<number> {
  const syncedAt = new Date()
  for (const r of rows) {
    const where = {
      channel_blockId_weekCode_line: {
        channel: r.channel,
        blockId: r.blockId,
        weekCode: r.weekCode,
        line: r.line,
      },
    }
    const data = { ...r, syncedAt }
    await prisma.bdrWeekLine.upsert({ where, update: data, create: data })
  }
  return rows.length
}
```

3. В `runReportsSync` после шага `iu_facts` (окно БДР — 10 ISO-недель,
   full — с начала года):

```typescript
  const weekTo = weekCode(now)
  const weekFrom = options.full
    ? Number(`${now.getUTCFullYear() % 100}01`)
    : weekCode(new Date(now.getTime() - 10 * 7 * 86_400_000))
  const bdr = getBdrFetchers()
  report.bdr_wb = await step(async () =>
    syncBdrLines(await bdr.wb.fetch(weekFrom, weekTo))
  )
  report.bdr_ozon = await step(async () =>
    syncBdrLines(await bdr.ozon.fetch(weekFrom, weekTo))
  )
```

(Комментарий `// План 11 добавит шаги…` удалить.)

- [ ] **Step 3: env**

`.env.example` (рядом с `IU_FACT_SOURCE`) и локальный `.env`:

```bash
BDR_FACT_SOURCE="fixture"
```

- [ ] **Step 4: Проверить сид**

Run: `npx prisma db seed`
Expected: в `bdr_week_lines` — сотни строк (недели снапшота × 6 кабинетов ×
статьи; при `full=1` — все недели fixture-кэша); `sync_runs.slices`
содержит `bdr_wb`/`bdr_ozon`.

- [ ] **Step 5: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/integrations/bdr-facts.ts lib/sync/run-reports-sync.ts .env.example prisma/fixtures/bdr-wb-cache.json prisma/fixtures/bdr-ozon-cache.json
git commit -m "feat: fixture-фетчеры БДР и шаги bdr_wb/bdr_ozon в синке отчётов"
```

---

### Task 5: Парсер ориентира (TDD)

Координаты — из `fin/finflow-app/bdr.py`: коды недель в строке 3; блоки
кабинетов по диапазонам строк с матчингом лейблов (колонка A);
нижние секции — фиксированные строки.

**Files:**
- Create: `lib/reports/bdr-orientir-parser.ts`
- Test: `lib/reports/bdr-orientir-parser.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```typescript
// lib/reports/bdr-orientir-parser.test.ts
import { describe, expect, it } from "vitest"
import ExcelJS from "exceljs"
import { parseBdrOrientir } from "./bdr-orientir-parser"

// Мини-ориентир: коды недель в строке 3 (колонки B, C), блок WB
// «ИП Бобровская» в строках 161–185, секция opex в строках из константы.
async function buildOrientir(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("БДР")
  ws.getCell(3, 2).value = 2624
  ws.getCell(3, 3).value = 2625
  // блок ip-bobrovskaya (161–185): лейбл в A, значения в B/C
  ws.getCell(161, 1).value = "Выручка с продаж WB"
  ws.getCell(161, 2).value = 51_562_771
  ws.getCell(161, 3).value = 48_000_000
  ws.getCell(163, 1).value = "Комиссия"
  ws.getCell(163, 2).value = -7_638_220
  // повтор кода недели правее (блок «долей») — должен игнорироваться
  ws.getCell(3, 50).value = 2624
  ws.getCell(161, 50).value = 0.99
  // нижняя секция: производственные расходы (строка 660)
  ws.getCell(660, 1).value = "Производственные расходы"
  ws.getCell(660, 2).value = -204_854
  return Buffer.from(await wb.xlsx.writeBuffer())
}

describe("parseBdrOrientir", () => {
  it("читает статьи кабинетов и нижние строки по неделям", async () => {
    const lines = await parseBdrOrientir(await buildOrientir())
    const revenue = lines.find(
      (l) => l.rowKey === "wb:ip-bobrovskaya:revenue" && l.weekCode === 2624
    )
    expect(revenue?.value).toBe(51_562_771)
    const revenue25 = lines.find(
      (l) => l.rowKey === "wb:ip-bobrovskaya:revenue" && l.weekCode === 2625
    )
    expect(revenue25?.value).toBe(48_000_000)
    const commission = lines.find(
      (l) => l.rowKey === "wb:ip-bobrovskaya:commission" && l.weekCode === 2624
    )
    expect(commission?.value).toBe(-7_638_220)
    const prod = lines.find(
      (l) => l.rowKey === "sections:opex:prod" && l.weekCode === 2624
    )
    expect(prod?.value).toBe(-204_854)
  })

  it("повторные коды недель (блок долей) игнорируются", async () => {
    const lines = await parseBdrOrientir(await buildOrientir())
    const dups = lines.filter(
      (l) => l.rowKey === "wb:ip-bobrovskaya:revenue" && l.weekCode === 2624
    )
    expect(dups).toHaveLength(1)
    expect(dups[0].value).toBe(51_562_771) // не 0.99 из блока долей
  })

  it("нет листа «БДР» → понятная ошибка", async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet("Другое")
    await expect(
      parseBdrOrientir(Buffer.from(await wb.xlsx.writeBuffer()))
    ).rejects.toThrow(/БДР/)
  })
})
```

- [ ] **Step 2: FAIL**

Run: `npx vitest run lib/reports/bdr-orientir-parser.test.ts`

- [ ] **Step 3: Реализация**

```typescript
// lib/reports/bdr-orientir-parser.ts
// Парсер ориентира БДР (порт координат fin/finflow-app/bdr.py):
// строка 3 — коды недель ГГНН (первое вхождение кода; повтор правее —
// блок «долей», игнорируется); блоки кабинетов — диапазоны строк, статьи
// матчатся по началу лейбла в колонке A; нижние секции — фиксированные строки.
import ExcelJS from "exceljs"

export type OrientirLine = { weekCode: number; rowKey: string; value: number }

const SHEET = "БДР"
const WEEK_ROW = 3
const MAX_COL = 120

// Диапазоны блоков кабинетов (r0..r1) — из bdr.py MARKETPLACES.
const CABINET_BLOCKS: Array<{
  channel: "wb" | "ozon"
  blockId: string
  r0: number
  r1: number
}> = [
  { channel: "wb", blockId: "ip-bobrovskaya", r0: 161, r1: 185 },
  { channel: "wb", blockId: "tori-brands", r0: 468, r1: 491 },
  { channel: "wb", blockId: "rusbubon", r0: 582, r1: 605 },
  { channel: "ozon", blockId: "laretto", r0: 324, r1: 353 },
  { channel: "ozon", blockId: "shapki", r0: 370, r1: 397 },
  { channel: "ozon", blockId: "lrtt", r0: 415, r1: 442 },
]

// Матчинг лейблов статей (по началу строки, как _starts/_eq в bdr.py).
const LINE_MATCHERS: Array<{ key: string; starts: string[] }> = [
  { key: "revenue", starts: ["выручка с продаж"] },
  { key: "points", starts: ["баллы"] },
  { key: "commission", starts: ["комиссия"] },
  { key: "acquiring", starts: ["эквайринг"] },
  { key: "logistics", starts: ["логистика"] },
  { key: "storage", starts: ["хранение"] },
  { key: "ads", starts: ["реклама"] },
  { key: "acceptance", starts: ["платная приемка", "платная приёмка", "поштучная приемка", "поштучная приёмка"] },
  { key: "fines", starts: ["штрафы"] },
  { key: "gross_rev", starts: ["грязная выручка"] },
  { key: "cogs", starts: ["себестоимость продаж"] },
  { key: "delivery", starts: ["доставка до складов"] },
  { key: "gross_profit", starts: ["валовая прибыль"] },
]

// Нижние секции: фиксированные строки-итоги — из bdr.py SECTIONS.
const SECTION_ROWS: Array<{ rowKey: string; row: number }> = [
  { rowKey: "sections:opex:gross_all", row: 84 },
  { rowKey: "sections:opex:prod", row: 660 },
  { rowKey: "sections:opex:comm", row: 677 },
  { rowKey: "sections:opex:admin", row: 685 },
  { rowKey: "sections:opex:other_inc", row: 717 },
  { rowKey: "sections:opex:other_exp", row: 720 },
  { rowKey: "sections:balance:stock", row: 754 },
  { rowKey: "sections:balance:cash", row: 755 },
  { rowKey: "sections:balance:advances", row: 756 },
  { rowKey: "sections:balance:recv", row: 757 },
  { rowKey: "sections:balance:payables", row: 758 },
  { rowKey: "sections:balance:equity", row: 760 },
]

function matchLine(label: string): string | null {
  const norm = label.trim().toLowerCase()
  if (!norm) return null
  for (const m of LINE_MATCHERS) {
    if (m.starts.some((s) => norm.startsWith(s))) return m.key
  }
  return null
}

function cellNumber(v: ExcelJS.CellValue): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v && typeof v === "object" && "result" in v && typeof v.result === "number")
    return v.result
  return null
}

export async function parseBdrOrientir(buffer: Buffer): Promise<OrientirLine[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.getWorksheet(SHEET)
  if (!ws) throw new Error(`В файле нет листа «${SHEET}»`)

  // Коды недель: первое вхождение каждого кода слева направо.
  const weekCols = new Map<number, number>() // weekCode → col
  for (let col = 1; col <= MAX_COL; col++) {
    const v = cellNumber(ws.getCell(WEEK_ROW, col).value)
    if (v !== null && Number.isInteger(v) && v >= 2000 && v <= 9953 && !weekCols.has(v)) {
      weekCols.set(v, col)
    }
  }

  const lines: OrientirLine[] = []
  const emit = (rowKey: string, row: number) => {
    for (const [weekCode, col] of weekCols) {
      const value = cellNumber(ws.getCell(row, col).value)
      if (value !== null) lines.push({ weekCode, rowKey, value })
    }
  }

  for (const block of CABINET_BLOCKS) {
    for (let r = block.r0; r <= block.r1; r++) {
      const label = String(ws.getCell(r, 1).value ?? "")
      const line = matchLine(label)
      if (line) emit(`${block.channel}:${block.blockId}:${line}`, r)
    }
  }
  for (const s of SECTION_ROWS) emit(s.rowKey, s.row)
  return lines
}
```

- [ ] **Step 4: PASS (3 теста), проверки и commit**

```bash
npx vitest run lib/reports/bdr-orientir-parser.test.ts
npm run format && npm run lint && npm run typecheck && npm run test
git add lib/reports/
git commit -m "feat: парсер ориентира БДР — недели ГГНН, блоки кабинетов, нижние секции"
```

---

### Task 6: Настройки БДР — загрузка ориентира

**Files:**
- Create: `app/reports/bdr/settings/actions.ts`, `settings-form.tsx`, `page.tsx`

- [ ] **Step 1: Server actions**

```typescript
// app/reports/bdr/settings/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAction } from "@/lib/auth/session"
import { parseBdrOrientir } from "@/lib/reports/bdr-orientir-parser"

export type FormState = { error: string | null; ok?: string }

const MAX_XLSX_BYTES = 50 * 1024 * 1024 // ориентир крупный (сотни строк × недели)

export async function uploadOrientir(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_report_settings")
  if (auth.error) return { error: auth.error }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0)
    return { error: "Выберите xlsx-файл ориентира" }
  if (file.size > MAX_XLSX_BYTES) return { error: "Файл больше 50 МБ" }

  let lines
  try {
    lines = await parseBdrOrientir(Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  if (lines.length === 0)
    return { error: "В файле не нашлось строк БДР (лист, коды недель?)" }

  await prisma.$transaction(async (tx) => {
    const upload = await tx.bdrOrientirUpload.create({
      data: {
        fileName: file.name,
        rowsParsed: lines.length,
        uploadedById: auth.user.id,
        uploadedBy: auth.user.name,
      },
    })
    await tx.bdrOrientirLine.deleteMany({})
    await tx.bdrOrientirLine.createMany({
      data: lines.map((l) => ({ ...l, uploadId: upload.id })),
    })
  })

  revalidatePath("/reports/bdr")
  revalidatePath("/reports/bdr/settings")
  return { error: null, ok: `Загружено строк: ${lines.length}` }
}

export async function saveExcludedBrands(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_report_settings")
  if (auth.error) return { error: auth.error }
  const value = String(formData.get("excludedBrands") ?? "").trim()
  await prisma.bdrSetting.upsert({
    where: { key: "excludedBrands" },
    update: { value },
    create: { key: "excludedBrands", value },
  })
  revalidatePath("/reports/bdr/settings")
  return { error: null, ok: "Сохранено" }
}
```

- [ ] **Step 2: Форма и страница**

```tsx
// app/reports/bdr/settings/settings-form.tsx
"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveExcludedBrands, uploadOrientir, type FormState } from "./actions"

const initialState: FormState = { error: null }

export function OrientirUploadForm() {
  const [state, formAction, isPending] = useActionState(uploadOrientir, initialState)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="file" name="file" accept=".xlsx" className="text-sm" />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Загружаю…" : "Загрузить ориентир"}
      </Button>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">{state.ok}</p>}
    </form>
  )
}

export function BrandsForm({ value }: { value: string }) {
  const [state, formAction, isPending] = useActionState(
    saveExcludedBrands,
    initialState
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="excludedBrands">
          Бренды-комиссионеры (исключаются из WB, через запятую)
        </Label>
        <Input id="excludedBrands" name="excludedBrands" defaultValue={value} className="w-80" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохраняю…" : "Сохранить"}
      </Button>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-600">{state.ok}</p>}
    </form>
  )
}
```

```tsx
// app/reports/bdr/settings/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
import { formatDate } from "@/lib/domain/dates"
import { BrandsForm, OrientirUploadForm } from "./settings-form"

export const dynamic = "force-dynamic"

export default async function BdrSettingsPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.role as Role, "manage_report_settings")) notFound()

  const [uploads, brands] = await Promise.all([
    prisma.bdrOrientirUpload.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.bdrSetting.findUnique({ where: { key: "excludedBrands" } }),
  ])

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <div>
        <Link
          href="/reports/bdr"
          className="text-muted-foreground text-sm underline underline-offset-4"
        >
          ← К отчёту
        </Link>
      </div>
      <h1 className="text-2xl font-semibold">Настройки БДР</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Ориентир (лист «БДР»)</h2>
        <p className="text-muted-foreground text-sm">
          Недели без БД-данных показываются из ориентира; нижние секции берут
          из него входы (opex, балансы).
        </p>
        <OrientirUploadForm />
        <ul className="text-muted-foreground space-y-1 text-sm">
          {uploads.map((u) => (
            <li key={u.id}>
              {u.fileName} · {u.rowsParsed} строк · {u.uploadedBy} ·{" "}
              {formatDate(u.createdAt)}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Исключения</h2>
        <BrandsForm value={brands?.value ?? ""} />
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/reports/bdr/
git commit -m "feat: настройки БДР — загрузка ориентира и исключённые бренды"
```

---

### Task 7: Экран отчёта БДР

**Files:**
- Create: `app/reports/bdr/bdr-view.tsx`, `app/reports/bdr/page.tsx`
- Modify: `app/page.tsx`
- Test: `tests/e2e/bdr-report.spec.ts`

- [ ] **Step 1: Серверная страница — сборка датасета**

```tsx
// app/reports/bdr/page.tsx
import Link from "next/link"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
import {
  BLOCKS,
  buildDataset,
  computeLowerBlocks,
  OZ_LINE_DEFS,
  rowKey,
  WB_LINE_DEFS,
  type DbLineRow,
} from "@/lib/domain/bdr"
import { compareWeeks } from "@/lib/domain/weeks"
import { Button } from "@/components/ui/button"
import { refreshReports } from "@/app/reports/iu-wb/actions"
import { BdrView, type BdrViewData } from "./bdr-view"

export const dynamic = "force-dynamic"

export default async function BdrPage() {
  const user = await getCurrentUser()
  const canSettings = user && can(user.role as Role, "manage_report_settings")

  const [dbRows, orientirRows, lastSync] = await Promise.all([
    prisma.bdrWeekLine.findMany(),
    prisma.bdrOrientirLine.findMany(),
    prisma.syncRun.findFirst({
      where: { scope: "reports", status: { in: ["ok", "error"] } },
      orderBy: { startedAt: "desc" },
    }),
  ])

  const orientir = new Map<string, Map<number, number>>()
  for (const r of orientirRows) {
    const row = orientir.get(r.rowKey) ?? new Map<number, number>()
    row.set(r.weekCode, Number(r.value))
    orientir.set(r.rowKey, row)
  }
  const db: DbLineRow[] = dbRows.map((r) => ({
    channel: r.channel,
    blockId: r.blockId,
    weekCode: r.weekCode,
    line: r.line,
    value: Number(r.value),
  }))
  const dataset = buildDataset(db, orientir)

  // Все недели датасета (по кабинетным статьям).
  const weekSet = new Set<number>()
  for (const block of BLOCKS) {
    const defs = block.channel === "wb" ? WB_LINE_DEFS : OZ_LINE_DEFS
    for (const def of defs) {
      const row = dataset.get(rowKey(block.channel, block.id, def.key))
      if (row) for (const code of row.keys()) weekSet.add(code)
    }
  }
  const weeks = [...weekSet].sort((a, b) => a - b)
  const latest = weeks.at(-1) ?? 0

  // Сериализация датасета для клиента: rowKey → { weekCode: {v, s} }.
  const cells: BdrViewData["cells"] = {}
  for (const [key, row] of dataset) {
    cells[key] = {}
    for (const [code, cell] of row) {
      cells[key][code] = { v: cell.value, s: cell.source }
    }
  }

  // Нижние блоки по неделям: живые входы из датасета + ориентир-секции.
  const lower: BdrViewData["lower"] = {}
  for (const code of weeks) {
    let grossAll = 0
    let revenueAll = 0
    let cogsAll = 0
    let hasAny = false
    for (const block of BLOCKS) {
      const get = (line: string) =>
        dataset.get(rowKey(block.channel, block.id, line))?.get(code)?.value
      const gp = get("gross_profit")
      if (gp !== undefined) {
        grossAll += gp
        hasAny = true
      }
      revenueAll += get("revenue") ?? 0
      cogsAll += get("cogs") ?? 0
    }
    if (!hasAny) continue
    const blocks = computeLowerBlocks({
      weekCode: code,
      grossAll,
      revenueAll,
      cogsAll,
      inputs: orientir,
    })
    const inp = (k: string) => orientir.get(k)?.get(code) ?? null
    lower[code] = {
      grossAll,
      prod: inp("sections:opex:prod"),
      comm: inp("sections:opex:comm"),
      admin: inp("sections:opex:admin"),
      opProfit: blocks.opProfit,
      otherInc: inp("sections:opex:other_inc"),
      otherExp: inp("sections:opex:other_exp"),
      netProfit: blocks.netProfit,
      dist: blocks.dist,
      balance: {
        stock: inp("sections:balance:stock"),
        cash: inp("sections:balance:cash"),
        advances: inp("sections:balance:advances"),
        recv: inp("sections:balance:recv"),
        payables: inp("sections:balance:payables"),
        equity: inp("sections:balance:equity"),
      },
    }
  }

  const data: BdrViewData = {
    cells,
    weeks,
    latest,
    compare: latest ? compareWeeks(latest) : null,
    lower,
    hasOrientir: orientirRows.length > 0,
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">БДР Маркетплейсы</h1>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          {lastSync?.status === "error" ? (
            <span className="text-destructive">Ошибка обновления — данные могли устареть</span>
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
          <form action={refreshReports}>
            <Button type="submit" variant="outline" size="sm">
              Обновить
            </Button>
          </form>
          {canSettings && (
            <Link href="/reports/bdr/settings" className="underline underline-offset-4">
              Настройки
            </Link>
          )}
        </div>
      </div>
      {!data.hasOrientir && (
        <p className="text-muted-foreground text-sm">
          Ориентир не загружен: показываются только БД-недели, нижние секции —
          «нет данных» (Настройки → «Загрузить ориентир»).
        </p>
      )}
      <BdrView data={data} />
    </main>
  )
}
```

- [ ] **Step 2: Клиентский вид (фильтры, режимы, таблица, KPI, график, секции)**

```tsx
// app/reports/bdr/bdr-view.tsx
"use client"

import { useState } from "react"
import {
  BLOCKS,
  OZ_LINE_DEFS,
  rowKey,
  WB_LINE_DEFS,
  type BdrChannel,
} from "@/lib/domain/bdr"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type BdrViewData = {
  cells: Record<string, Record<number, { v: number; s: "db" | "orientir" }>>
  weeks: number[]
  latest: number
  compare: { prev: number; monthAgo: number; yearAgo: number } | null
  lower: Record<
    number,
    {
      grossAll: number
      prod: number | null
      comm: number | null
      admin: number | null
      opProfit: number
      otherInc: number | null
      otherExp: number | null
      netProfit: number
      dist: {
        safety: number
        reinvest60: number
        insurance: number
        surplus: number
        fundSu: number
        divs: number
        ccReinvest: number
      }
      balance: Record<string, number | null>
    }
  >
  hasOrientir: boolean
}

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Math.round(n).toLocaleString("ru-RU")}`

// Объединённый список статей для смешанного выбора WB+OZON.
const ALL_LINE_DEFS = (() => {
  const seen = new Map<string, { key: string; label: string; kind: string }>()
  for (const def of [...WB_LINE_DEFS, ...OZ_LINE_DEFS]) {
    if (!seen.has(def.key)) seen.set(def.key, def)
  }
  return [...seen.values()]
})()

const chartCfg = {
  revenue: { label: "Выручка", color: "var(--chart-1)" },
  gross_rev: { label: "Грязная", color: "var(--chart-2)" },
  gross_profit: { label: "Валовая", color: "var(--chart-3)" },
} satisfies ChartConfig

export function BdrView({ data }: { data: BdrViewData }) {
  const [mode, setMode] = useState<"compare" | "all">("compare")
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    new Set(BLOCKS.map((b) => b.id))
  )

  const toggleBlock = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleChannel = (channel: BdrChannel) => {
    const ids = BLOCKS.filter((b) => b.channel === channel).map((b) => b.id)
    const allOn = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  // Сумма статьи по выбранным кабинетам; источник «ориентир», если хоть
  // одна ячейка из ориентира.
  const sumLine = (line: string, code: number) => {
    let total = 0
    let seen = false
    let orientir = false
    for (const block of BLOCKS) {
      if (!selected.has(block.id)) continue
      const cell = data.cells[rowKey(block.channel, block.id, line)]?.[code]
      if (!cell) continue
      total += cell.v
      seen = true
      if (cell.s === "orientir") orientir = true
    }
    return seen ? { total, orientir } : null
  }

  const columns =
    mode === "all"
      ? data.weeks
      : data.compare
        ? [data.compare.yearAgo, data.compare.monthAgo, data.compare.prev, data.latest].filter(
            (c) => data.weeks.includes(c) || c === data.latest
          )
        : []

  const latestRev = sumLine("revenue", data.latest)?.total ?? 0
  const latestGrossRev = sumLine("gross_rev", data.latest)?.total ?? 0
  const latestGross = sumLine("gross_profit", data.latest)?.total ?? 0

  const chartData = data.weeks.map((code) => ({
    week: `W${code % 100}`,
    revenue: Math.round(sumLine("revenue", code)?.total ?? 0),
    gross_rev: Math.round(sumLine("gross_rev", code)?.total ?? 0),
    gross_profit: Math.round(sumLine("gross_profit", code)?.total ?? 0),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["wb", "ozon"] as const).map((ch) => (
          <button key={ch} onClick={() => toggleChannel(ch)}>
            <Badge variant="secondary">{ch === "wb" ? "WB" : "Озон"}</Badge>
          </button>
        ))}
        {BLOCKS.map((b) => (
          <button key={b.id} onClick={() => toggleBlock(b.id)}>
            <Badge variant={selected.has(b.id) ? "default" : "outline"}>{b.name}</Badge>
          </button>
        ))}
        <span className="mx-2" />
        <button onClick={() => setMode("compare")}>
          <Badge variant={mode === "compare" ? "default" : "outline"}>Сравнение недель</Badge>
        </button>
        <button onClick={() => setMode("all")}>
          <Badge variant={mode === "all" ? "default" : "outline"}>Все недели</Badge>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: `Выручка W${data.latest % 100}`, value: latestRev },
          { label: "Грязная выручка", value: latestGrossRev },
          { label: "Валовая прибыль", value: latestGross },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-muted-foreground text-xs">{k.label}</p>
              <p className="text-lg font-semibold">{fmt(k.value)} ₽</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ChartContainer config={chartCfg} className="h-64 w-full">
        <LineChart data={chartData}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="week" tickLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line dataKey="revenue" stroke="var(--color-revenue)" dot={false} />
          <Line dataKey="gross_rev" stroke="var(--color-gross_rev)" dot={false} />
          <Line dataKey="gross_profit" stroke="var(--color-gross_profit)" dot={false} />
        </LineChart>
      </ChartContainer>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Статья</TableHead>
              {columns.map((code) => (
                <TableHead key={code} className="text-right">
                  W{code % 100}
                  {sumLine("revenue", code)?.orientir && (
                    <span className="text-muted-foreground ml-1 text-xs" title="Неделя из ориентира">
                      ○
                    </span>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ALL_LINE_DEFS.map((def) => (
              <TableRow
                key={def.key}
                className={def.kind === "total" || def.kind === "subtotal" ? "font-medium" : ""}
              >
                <TableCell>{def.label}</TableCell>
                {columns.map((code) => {
                  const cell = sumLine(def.key, code)
                  return (
                    <TableCell key={code} className="text-right tabular-nums">
                      {cell ? fmt(cell.total) : "—"}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Операционные расходы и прибыль</h2>
        <p className="text-muted-foreground text-xs">
          Общефирменные секции — не зависят от фильтра кабинетов. Опер. и чистая
          прибыль пересчитаны от живой валовой; входы — из ориентира.
          «Доставка до складов» — начисление появится с API 1С.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Строка</TableHead>
                {columns.map((code) => (
                  <TableHead key={code} className="text-right">
                    W{code % 100}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  ["Валовая прибыль (всего МП)", (c: number) => data.lower[c]?.grossAll],
                  ["Производственные расходы", (c: number) => data.lower[c]?.prod],
                  ["Коммерческие расходы", (c: number) => data.lower[c]?.comm],
                  ["Административные расходы", (c: number) => data.lower[c]?.admin],
                  ["Операционная прибыль", (c: number) => data.lower[c]?.opProfit],
                  ["Прочие доходы", (c: number) => data.lower[c]?.otherInc],
                  ["Прочие расходы", (c: number) => data.lower[c]?.otherExp],
                  ["Чистая прибыль (до бонусов)", (c: number) => data.lower[c]?.netProfit],
                  ["— Безопасность (5%)", (c: number) => data.lower[c]?.dist.safety],
                  ["— Реинвест (60% ЧП)", (c: number) => data.lower[c]?.dist.reinvest60],
                  ["— Страховка (6%)", (c: number) => data.lower[c]?.dist.insurance],
                  ["— Сверхдоход", (c: number) => data.lower[c]?.dist.surplus],
                  ["— Фонд СУ", (c: number) => data.lower[c]?.dist.fundSu],
                  ["— Дивиденды", (c: number) => data.lower[c]?.dist.divs],
                  ["Запасы", (c: number) => data.lower[c]?.balance.stock],
                  ["Деньги (конец недели)", (c: number) => data.lower[c]?.balance.cash],
                  ["Собственный капитал", (c: number) => data.lower[c]?.balance.equity],
                ] as Array<[string, (c: number) => number | null | undefined]>
              ).map(([label, get]) => (
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  {columns.map((code) => (
                    <TableCell key={code} className="text-right tabular-nums">
                      {fmt(get(code))}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Ссылка с главной (`app/page.tsx`)**

```tsx
        <div>
          <Link
            href="/reports/bdr"
            className="text-primary underline underline-offset-4"
          >
            БДР Маркетплейсы
          </Link>
        </div>
```

- [ ] **Step 4: E2e**

```typescript
// tests/e2e/bdr-report.spec.ts
import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

test("БДР: таблица статей, фильтр кабинета меняет суммы, режимы", async ({
  page,
}) => {
  await loginAs(page, "viewer")
  await page.goto("/reports/bdr")
  await expect(page.getByRole("heading", { name: "БДР Маркетплейсы" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "Выручка с продаж" })).toBeVisible()
  await expect(page.getByRole("cell", { name: "Валовая прибыль", exact: true })).toBeVisible()

  const revenueRow = page.getByRole("row", { name: /Выручка с продаж/ })
  const before = await revenueRow.textContent()
  await page.getByText("ИП Бобровская", { exact: true }).click() // выключить кабинет
  await expect(revenueRow).not.toHaveText(before ?? "")

  await page.getByText("Все недели").click()
  await expect(page.getByRole("columnheader", { name: /W\d+/ }).nth(4)).toBeVisible()
})

test("БДР: нижние секции видны и не зависят от фильтра", async ({ page }) => {
  await loginAs(page, "viewer")
  await page.goto("/reports/bdr")
  await expect(page.getByText("Операционные расходы и прибыль")).toBeVisible()
  await expect(page.getByRole("cell", { name: "Чистая прибыль (до бонусов)" })).toBeVisible()
})

test("настройки БДР: 404 для не-owner", async ({ page }) => {
  await loginAs(page, "accountant")
  const resp = await page.goto("/reports/bdr/settings")
  expect(resp?.status()).toBe(404)
})
```

- [ ] **Step 5: Запустить e2e**

Run: `npm run test:e2e -- tests/e2e/bdr-report.spec.ts`
Expected: PASS (3 теста; ориентир в e2e не загружен — верх работает
на fixture-БД-неделях, нижние секции показывают «—», заголовок секции виден).

- [ ] **Step 6: Проверки и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
git add app/reports/bdr/ app/page.tsx tests/e2e/bdr-report.spec.ts
git commit -m "feat: экран БДР — фильтры, режимы, таблица статей, нижние секции"
```

---

### Task 8: Боевые фетчеры БДР (после плана 08)

Порт SQL из `bdr_wb_lines_from_db.py`, `bdr_ozon_lines_from_db.py`,
`bdr_cogs_build.py`. Cogs требует права на `OPENQUERY` (предпосылка §11.2).

**Files:**
- Create: `lib/integrations/bdr-facts-mssql.ts`
- Modify: `lib/integrations/bdr-facts.ts`, `lib/sync/run-reports-sync.ts`, `.env.example`, `scripts/dwh-probe.ts`

- [ ] **Step 1: Боевые фетчеры**

```typescript
// lib/integrations/bdr-facts-mssql.ts
// Боевые статьи БДР: порт выверенных запросов старого приложения
// (сверка с ориентиром до рубля, W24). Пул и туннель — план 8.
import sql from "mssql"
import { getMssqlPool } from "./dwh-mssql"
import { prisma } from "@/lib/db"
import {
  linesFromWbComponents,
  opLine,
  svcLine,
  OZ_ACC2BLK,
  WB_ACC2BLK,
  type DbLineRow,
} from "@/lib/domain/bdr"
import { weekCode, weekEnd, weekStart } from "@/lib/domain/weeks"
import type { BdrLinesFetcher } from "./bdr-facts"

async function excludedBrands(): Promise<string[]> {
  const s = await prisma.bdrSetting.findUnique({ where: { key: "excludedBrands" } })
  return (s?.value ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ── WB: посуточные компоненты реализации (дедуп rrd_id MAX batch),
// далее агрегация в недели и формулы статей — в домене ──
export const mssqlBdrWb: BdrLinesFetcher = {
  async fetch(weekFrom, weekTo) {
    const brands = await excludedBrands()
    const brandList = brands.map((b) => `N'${b.replace(/'/g, "''")}'`).join(",")
    const brandFilter = brands.length
      ? `AND (brand_name IS NULL OR brand_name NOT IN (${brandList}))`
      : ""
    const pool = await getMssqlPool()
    const request = pool.request()
    request.input("from", sql.VarChar, isoDate(weekStart(weekFrom)))
    request.input("to", sql.VarChar, isoDate(weekEnd(weekTo)))
    // date_to в БД — varchar: строковое сравнение 'YYYY-MM-DD' безопасно.
    const result = await request.query(`
      WITH dd AS (
        SELECT account_id, date_to, supplier_oper_name, retail_amount, brand_name,
               ppvz_for_pay, delivery_rub, storage_fee, penalty, deduction, acceptance,
               ROW_NUMBER() OVER (PARTITION BY rrd_id ORDER BY batch_id DESC) rn
        FROM WBALL.wb_report_detail_by_period
        WHERE account_id IN (1,2,3) AND date_to >= @from AND date_to <= @to
      )
      SELECT account_id, date_to,
        SUM(CASE WHEN supplier_oper_name=N'Продажа' THEN retail_amount
                 WHEN supplier_oper_name=N'Возврат' THEN -retail_amount ELSE 0 END) revenue,
        SUM(CASE WHEN supplier_oper_name=N'Возврат' THEN -ppvz_for_pay ELSE ppvz_for_pay END) pay_net,
        SUM(delivery_rub) deliv, SUM(storage_fee) storage, SUM(penalty) penalty,
        SUM(deduction) deduction, SUM(acceptance) acceptance
      FROM dd
      WHERE rn=1 ${brandFilter}
      GROUP BY account_id, date_to`)

    // Агрегация дней в недели по ISO-коду date_to.
    type C = { revenue: number; payNet: number; deliv: number; storage: number; penalty: number; deduction: number; acceptance: number }
    const byWeekAcc = new Map<string, C>()
    for (const r of result.recordset as Record<string, unknown>[]) {
      const code = weekCode(new Date(String(r.date_to)))
      if (code < weekFrom || code > weekTo) continue
      const key = `${code}:${r.account_id}`
      const c = byWeekAcc.get(key) ?? {
        revenue: 0, payNet: 0, deliv: 0, storage: 0, penalty: 0, deduction: 0, acceptance: 0,
      }
      c.revenue += Number(r.revenue ?? 0)
      c.payNet += Number(r.pay_net ?? 0)
      c.deliv += Number(r.deliv ?? 0)
      c.storage += Number(r.storage ?? 0)
      c.penalty += Number(r.penalty ?? 0)
      c.deduction += Number(r.deduction ?? 0)
      c.acceptance += Number(r.acceptance ?? 0)
      byWeekAcc.set(key, c)
    }
    const rows: DbLineRow[] = []
    for (const [key, c] of byWeekAcc) {
      const [codeStr, accStr] = key.split(":")
      const blockId = WB_ACC2BLK[Number(accStr)]
      if (!blockId) continue
      const lines = linesFromWbComponents(c)
      for (const [line, value] of Object.entries(lines)) {
        rows.push({ channel: "wb", blockId, weekCode: Number(codeStr), line, value })
      }
    }
    return rows
  },
}

// ── OZON: операции + услуги, residual замыкает грязную ──
export const mssqlBdrOzon: BdrLinesFetcher = {
  async fetch(weekFrom, weekTo) {
    const pool = await getMssqlPool()
    const from = isoDate(weekStart(weekFrom))
    const to = isoDate(weekEnd(weekTo))
    const opsReq = pool.request()
    opsReq.input("from", sql.Date, from)
    opsReq.input("to", sql.Date, to)
    const ops = (
      await opsReq.query(`
      WITH dd AS (
        SELECT account_id, operation_id, batch_id, operation_type_name, operation_date,
               amount, accruals_for_sale, sale_commission,
               (delivery_charge+return_delivery_charge) deliv,
               ROW_NUMBER() OVER (PARTITION BY operation_id ORDER BY batch_id DESC) rn
        FROM OZONALL.ozon_finance_transactions
        WHERE CAST(operation_date AS date) BETWEEN @from AND @to)
      SELECT account_id, operation_id, operation_type_name,
             CAST(operation_date AS date) d, amount, accruals_for_sale, sale_commission, deliv
      FROM dd WHERE rn=1`)
    ).recordset as Record<string, unknown>[]
    const svcReq = pool.request()
    svcReq.input("from", sql.Date, from)
    svcReq.input("to", sql.Date, to)
    const svc = (
      await svcReq.query(`
      WITH dd AS (
        SELECT operation_id, batch_id,
               ROW_NUMBER() OVER (PARTITION BY operation_id ORDER BY batch_id DESC) rn
        FROM OZONALL.ozon_finance_transactions
        WHERE CAST(operation_date AS date) BETWEEN @from AND @to)
      SELECT s.account_id, s.operation_id, s.service_name, s.service_price
      FROM OZONALL.ozon_finance_transactions_services s
      JOIN dd ON dd.operation_id=s.operation_id AND dd.batch_id=s.batch_id AND dd.rn=1`)
    ).recordset as Record<string, unknown>[]

    const LINE_KEYS = ["revenue", "commission", "logistics", "acquiring", "ads", "storage", "other", "gross_rev"]
    const agg = new Map<string, Record<string, number>>()
    const cell = (code: number, acc: number) => {
      const key = `${code}:${acc}`
      const c = agg.get(key) ?? Object.fromEntries(LINE_KEYS.map((k) => [k, 0]))
      agg.set(key, c)
      return c
    }
    const svcByOp = new Map<number, number>()
    for (const s of svc) {
      const oid = Number(s.operation_id)
      svcByOp.set(oid, (svcByOp.get(oid) ?? 0) + Number(s.service_price ?? 0))
    }
    const opCode = new Map<number, number>()
    const opAcc = new Map<number, number>()
    for (const r of ops) {
      const code = weekCode(r.d as Date)
      if (code < weekFrom || code > weekTo) continue
      const acc = Number(r.account_id)
      opCode.set(Number(r.operation_id), code)
      opAcc.set(Number(r.operation_id), acc)
      const L = cell(code, acc)
      const amount = Number(r.amount ?? 0)
      const accr = Number(r.accruals_for_sale ?? 0)
      const comm = Number(r.sale_commission ?? 0)
      const deliv = Number(r.deliv ?? 0)
      L.revenue += accr
      L.commission += comm
      L.logistics += deliv
      L.gross_rev += amount
      const resid = amount - accr - comm - deliv - (svcByOp.get(Number(r.operation_id)) ?? 0)
      L[opLine(String(r.operation_type_name ?? ""))] += resid
    }
    for (const s of svc) {
      const oid = Number(s.operation_id)
      const code = opCode.get(oid)
      if (code === undefined) continue
      const L = cell(code, opAcc.get(oid)!)
      L[svcLine(String(s.service_name ?? ""))] += Number(s.service_price ?? 0)
    }
    const rows: DbLineRow[] = []
    for (const [key, L] of agg) {
      const [codeStr, accStr] = key.split(":")
      const blockId = OZ_ACC2BLK[Number(accStr)]
      if (!blockId) continue
      // other — residual, замыкает грязную.
      L.other =
        L.gross_rev - (L.revenue + L.commission + L.logistics + L.acquiring + L.ads + L.storage)
      for (const line of LINE_KEYS) {
        rows.push({ channel: "ozon", blockId, weekCode: Number(codeStr), line, value: L[line] })
      }
    }
    return rows
  },
}

// ── COGS: нетто шт × прайс-лист 1С (OPENQUERY BI.[1cv]) по коду 1С
// из составного sa_name (regex 00-\d+) ──
export async function fetchWbCogs(
  weekFrom: number,
  weekTo: number
): Promise<DbLineRow[]> {
  const brands = await excludedBrands()
  const brandList = brands.map((b) => `N'${b.replace(/'/g, "''")}'`).join(",")
  const brandFilter = brands.length
    ? `AND (brand_name IS NULL OR brand_name NOT IN (${brandList}))`
    : ""
  const pool = await getMssqlPool()
  const qtyReq = pool.request()
  qtyReq.input("from", sql.VarChar, isoDate(weekStart(weekFrom)))
  qtyReq.input("to", sql.VarChar, isoDate(weekEnd(weekTo)))
  const qty = (
    await qtyReq.query(`
    WITH dd AS (
      SELECT account_id, date_to, sa_name, supplier_oper_name, quantity, brand_name,
             ROW_NUMBER() OVER (PARTITION BY rrd_id ORDER BY batch_id DESC) rn
      FROM WBALL.wb_report_detail_by_period
      WHERE account_id IN (1,2,3) AND date_to >= @from AND date_to <= @to
    )
    SELECT account_id, date_to, sa_name,
      SUM(CASE WHEN supplier_oper_name=N'Продажа' THEN quantity
               WHEN supplier_oper_name=N'Возврат' THEN -quantity ELSE 0 END) qty
    FROM dd
    WHERE rn=1 ${brandFilter}
    GROUP BY account_id, date_to, sa_name`)
  ).recordset as Record<string, unknown>[]

  // Прайс-лист: последняя цена закуп/доп по коду 1С (linked server BI).
  const inner =
    "SELECT Код, " +
    "MAX(CASE WHEN vc=''00-000003'' THEN Цена END) zakup, " +
    "MAX(CASE WHEN vc=''00-000007'' THEN Цена END) dop FROM (" +
    "SELECT n.Код Код, vc.Код vc, z.Цена, " +
    "ROW_NUMBER() OVER (PARTITION BY z.Номенклатура, z.ВидЦены ORDER BY d.Дата DESC) rn " +
    "FROM BI.[1cv].[Документ_УстановкаЦенНоменклатуры_Запасы] z " +
    "JOIN BI.[1cv].[Документ_УстановкаЦенНоменклатуры] d ON d.Ссылка=z.Владелец " +
    "JOIN BI.[1cv].[Справочник_Номенклатура] n ON n.Ссылка=z.Номенклатура " +
    "JOIN BI.[1cv].[Справочник_ВидыЦен] vc ON vc.Ссылка=z.ВидЦены " +
    "WHERE vc.Код IN (''00-000003'',''00-000007'') " +
    ") t WHERE rn=1 GROUP BY Код"
  const prices = (
    await (await getMssqlPool())
      .request()
      .query(`SELECT * FROM OPENQUERY([192.168.79.250], '${inner}')`)
  ).recordset as Record<string, unknown>[]
  const unitCost = new Map<string, number>()
  for (const p of prices) {
    const code = String(p["Код"] ?? "").trim()
    const dop = Number(p.dop)
    const zakup = Number(p.zakup)
    const uc = Number.isFinite(dop) && dop > 0 ? dop : Number.isFinite(zakup) ? zakup : null
    if (code && uc !== null) unitCost.set(code, uc)
  }

  const CODE_RE = /00-\d+/
  const agg = new Map<string, number>() // `${code}:${acc}` → cogs
  for (const r of qty) {
    const code = weekCode(new Date(String(r.date_to)))
    if (code < weekFrom || code > weekTo) continue
    const m = CODE_RE.exec(String(r.sa_name ?? ""))
    const uc = m ? unitCost.get(m[0]) : undefined
    if (uc === undefined) continue
    const key = `${code}:${r.account_id}`
    agg.set(key, (agg.get(key) ?? 0) + Number(r.qty ?? 0) * uc)
  }
  const rows: DbLineRow[] = []
  for (const [key, cogs] of agg) {
    const [codeStr, accStr] = key.split(":")
    const blockId = WB_ACC2BLK[Number(accStr)]
    if (!blockId) continue
    // Отрицательной, как в ориентире.
    rows.push({ channel: "wb", blockId, weekCode: Number(codeStr), line: "cogs", value: -cogs })
  }
  return rows
}
```

- [ ] **Step 2: Фабрика и шаг cogs**

`lib/integrations/bdr-facts.ts`:

```typescript
import { mssqlBdrOzon, mssqlBdrWb } from "./bdr-facts-mssql"
```

```typescript
export function getBdrFetchers(): BdrFetchers {
  const source = process.env.BDR_FACT_SOURCE ?? "fixture"
  if (source === "fixture") return { wb: fixtureBdrWb, ozon: fixtureBdrOzon }
  if (source === "dwh") return { wb: mssqlBdrWb, ozon: mssqlBdrOzon }
  throw new Error(`BDR_FACT_SOURCE="${source}" не поддерживается`)
}
```

`lib/sync/run-reports-sync.ts` — шаг cogs (только в боевом режиме; в fixture
cogs уже в кэше WB):

```typescript
  if ((process.env.BDR_FACT_SOURCE ?? "fixture") === "dwh") {
    const { fetchWbCogs } = await import("@/lib/integrations/bdr-facts-mssql")
    report.bdr_cogs = await step(async () =>
      syncBdrLines(await fetchWbCogs(weekFrom, weekTo))
    )
  }
```

`.env.example`: дополнить комментарий `BDR_FACT_SOURCE` — `# fixture | dwh
(нужны туннель плана 8 и права OPENQUERY для cogs)`.

- [ ] **Step 3: Пробник (`scripts/dwh-probe.ts`, после блока ИУ)**

```typescript
  console.log("— БДР (последняя завершённая неделя) —")
  try {
    const { mssqlBdrWb, mssqlBdrOzon } = await import(
      "../lib/integrations/bdr-facts-mssql"
    )
    const { weekCode } = await import("../lib/domain/weeks")
    const code = weekCode(new Date(Date.now() - 7 * 86_400_000))
    const wb = await mssqlBdrWb.fetch(code, code)
    const oz = await mssqlBdrOzon.fetch(code, code)
    console.log(`bdr wb ${code}: ${wb.length} строк; ozon: ${oz.length} строк`)
  } catch (e) {
    console.log(`bdr: ОШИБКА — ${e instanceof Error ? e.message : e}`)
  }
```

- [ ] **Step 4: Сверка перед включением (ручная)**

При живом туннеле: `npm run dwh:probe`; затем сверить W24 c контрольными
суммами доки (`fin/finflow/03-bdr-marketplaces.md`): Бобровская выручка
51 562 771 / комиссия −7 638 211 / грязная 34 170 285 (допуск 0);
cogs — ±1–4% от ориентира. Включение: `BDR_FACT_SOURCE=dwh` в env prod.

- [ ] **Step 5: Финальный прогон и commit**

```bash
npm run format && npm run lint && npm run typecheck && npm run test && npm run test:e2e
git add lib/integrations/ lib/sync/run-reports-sync.ts scripts/dwh-probe.ts .env.example
git commit -m "feat: боевые фетчеры БДР — WB/OZON статьи и cogs через OPENQUERY"
```

---

## Что считается готовым (Definition of Done)

- На fixtures (реальные снапшоты кэшей): таблица 6 кабинетов со статьями,
  фильтры каналы×кабинеты пересчитывают суммы мгновенно, KPI и график,
  режимы «Сравнение недель»/«Все недели».
- Ориентир загружается xlsx: недели без БД-данных подхватываются из него
  с пометкой «○», нижние секции получают входы, формулы (опер./чистая
  прибыль, распределение 5%/60%/6%/сверхдоход) пересчитаны от живой валовой.
- Синк scope=reports содержит шаги bdr_wb/bdr_ozon (окно 10 недель),
  в боевом режиме — bdr_cogs; шаги независимы, ошибки видны в SyncRun.
- Боевой режим включается `BDR_FACT_SOURCE=dwh` без правок кода; сверка W24
  с контрольными суммами доки — допуск 0 (статьи), ±1–4% (cogs).
- Unit (формулы, merge, парсер ориентира) и e2e зелёные.


