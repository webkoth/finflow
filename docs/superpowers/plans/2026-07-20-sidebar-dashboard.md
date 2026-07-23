# Сайдбар и дашборд — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить временную навигацию на каркас с сайдбаром (shadcn Sidebar, видимость пунктов по ролям) и дашборд на `/` (4 stat-карточки, график ДДС 7/30/90, таблица остатков).

**Architecture:** Серверный `AppShell` в корневом layout: без пользователя рендерит детей как есть (страница `/login`), с пользователем — стоковый shadcn Sidebar + `SidebarInset`. Дашборд — server component с параллельными Prisma-запросами; вся расчётная логика — чистые функции в `lib/domain/` (TDD); график — единственный клиентский компонент, получает 90 дней данных пропсами и фильтрует на клиенте.

**Tech Stack:** Next.js App Router, shadcn/ui на Base UI (`base-mira`), shadcn charts (recharts — новая npm-зависимость, одобрена спекой), Prisma, Vitest, Playwright.

**Спека:** `docs/superpowers/specs/2026-07-20-sidebar-dashboard-design.md`

**ВАЖНО — Base UI, не Radix.** Примеры реестра написаны в Radix-стиле с `asChild` — этого пропа в Base UI НЕТ. Подмена элемента — только проп `render`: `<SidebarMenuButton render={<Link href="…" />}>текст</SidebarMenuButton>`. После установки каждого компонента открой его файл в `components/ui/` и сверь имена пропов — установленный файл важнее любого примера из этого плана.

## Структура файлов

| Файл | Ответственность |
| --- | --- |
| `components/ui/sidebar.tsx`, `chart.tsx`, `toggle-group.tsx` (+зависимости) | стоковые shadcn, ставятся CLI, не редактируются |
| `components/app-shell.tsx` (create) | серверная обёртка: нет пользователя → голые children; есть → SidebarProvider + сайдбар + SidebarInset с шапкой |
| `components/app-sidebar.tsx` (create) | серверный сайдбар: конфиг меню, фильтрация групп по `can()`, футер (имя, роль, смена пароля, выход) |
| `components/nav-main.tsx` (create) | клиентский список групп меню: иконки по имени, подсветка активного через `usePathname` |
| `components/app-header.tsx` (delete) | старая шапка, функции переезжают в футер сайдбара |
| `app/layout.tsx` (modify) | `AppHeader` → `AppShell` вокруг children |
| `app/page.tsx` (rewrite) | дашборд: запросы, stat-карточки, таблица остатков, встраивание графика |
| `app/cashflow-chart.tsx` (create) | клиентский график ДДС с переключателем 7/30/90 |
| `lib/domain/dates.ts` + test (modify) | `startOfMoscowDay` |
| `lib/domain/transactions.ts` + test (modify) | `groupDailyCashflow` |
| `lib/domain/balances.ts` + test (create) | пересчёт остатков в ₽, итог, флаг неполноты |
| `tests/e2e/dashboard.spec.ts` (create) | смоук сайдбара и дашборда |

---

### Task 1: Ветка и установка компонентов реестра

**Files:**
- Create (через CLI): `components/ui/sidebar.tsx`, `components/ui/chart.tsx`, `components/ui/toggle-group.tsx` + зависимости (sheet, tooltip, skeleton и т.п.)
- Modify (через CLI): `package.json` (+ `recharts`)

- [ ] **Step 1: Создать feature-ветку** (в основном чекауте, worktree не создавать)

```bash
git checkout develop && git pull && git checkout -b feature/sidebar-dashboard
```

- [ ] **Step 2: Установить компоненты**

```bash
npx shadcn@latest add sidebar chart toggle-group
```

Expected: в `components/ui/` появились `sidebar.tsx`, `chart.tsx`, `toggle-group.tsx` и их зависимости; в `package.json` в dependencies добавился `recharts`. Никаких других новых npm-зависимостей быть не должно — если CLI предложит что-то ещё, остановись и спроси разработчика.

- [ ] **Step 3: Сверить API установленных компонентов**

Открой и прочитай:
- `components/ui/sidebar.tsx` — найди `SidebarMenuButton`: проп подмены элемента (`render`), проп `isActive`, экспорты `SidebarProvider`, `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarFooter`, `SidebarInset`, `SidebarTrigger`.
- `components/ui/toggle-group.tsx` — сигнатура `ToggleGroup`: в Base UI значение — массив (`value: string[]`), колбэк `onValueChange(groupValue)`; `type="single"` из Radix-примеров НЕ существует.

Если реальные имена пропов отличаются от кода в задачах 5 и 7 — при реализации следуй установленному файлу.

- [ ] **Step 4: Проверки и коммит**

```bash
npm run typecheck && npm run lint
git add components/ui package.json package-lock.json components.json
git commit -m "chore: компоненты sidebar, chart, toggle-group из реестра shadcn (+recharts)"
```

---

### Task 2: Домен — `startOfMoscowDay` (TDD)

**Files:**
- Modify: `lib/domain/dates.ts`
- Test: `lib/domain/dates.test.ts`

- [ ] **Step 1: Написать падающие тесты** (добавить в существующий `dates.test.ts`)

```ts
import { describe, expect, it } from "vitest"
import { formatDate, startOfMoscowDay } from "./dates"

describe("startOfMoscowDay", () => {
  it("возвращает 00:00 по Москве (21:00 UTC предыдущего дня)", () => {
    // 15 июля 12:00 UTC = 15 июля 15:00 МСК → начало суток 15 июля 00:00 МСК
    const result = startOfMoscowDay(new Date("2026-07-15T12:00:00Z"))
    expect(result.toISOString()).toBe("2026-07-14T21:00:00.000Z")
  })

  it("время до 03:00 МСК относится к предыдущим UTC-суткам", () => {
    // 15 июля 22:30 UTC = 16 июля 01:30 МСК → начало суток 16 июля 00:00 МСК
    const result = startOfMoscowDay(new Date("2026-07-15T22:30:00Z"))
    expect(result.toISOString()).toBe("2026-07-15T21:00:00.000Z")
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/dates.test.ts`
Expected: FAIL — `startOfMoscowDay is not a function` (нет экспорта).

- [ ] **Step 3: Минимальная реализация** (добавить в `lib/domain/dates.ts`)

```ts
// Москва — фиксированный UTC+3 (без переходов с 2014 года).
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

// Начало текущих московских суток в UTC (для фильтров «за сегодня»).
export function startOfMoscowDay(now: Date): Date {
  const shifted = new Date(now.getTime() + MOSCOW_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - MOSCOW_OFFSET_MS)
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/dates.test.ts`
Expected: PASS (все тесты файла, включая старые на `formatDate`).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/dates.ts lib/domain/dates.test.ts
git commit -m "feat: startOfMoscowDay — начало московских суток для фильтров дашборда"
```

---

### Task 3: Домен — `groupDailyCashflow` (TDD)

**Files:**
- Modify: `lib/domain/transactions.ts`
- Test: `lib/domain/transactions.test.ts`

- [ ] **Step 1: Написать падающие тесты** (добавить в существующий `transactions.test.ts`)

```ts
import { groupDailyCashflow } from "./transactions"

describe("groupDailyCashflow", () => {
  const now = new Date("2026-07-15T12:00:00Z") // 15 июля 15:00 МСК

  it("пустой список — непрерывный ряд нулевых дней", () => {
    const points = groupDailyCashflow([], 3, now)
    expect(points).toEqual([
      { date: "2026-07-13", incomeMinor: 0, expenseMinor: 0 },
      { date: "2026-07-14", incomeMinor: 0, expenseMinor: 0 },
      { date: "2026-07-15", incomeMinor: 0, expenseMinor: 0 },
    ])
  })

  it("делит приход и расход по знаку, расход — по модулю", () => {
    const points = groupDailyCashflow(
      [
        { occurredAt: new Date("2026-07-15T09:00:00Z"), amountMinor: 100_00 },
        { occurredAt: new Date("2026-07-15T10:00:00Z"), amountMinor: -40_00 },
        { occurredAt: new Date("2026-07-15T11:00:00Z"), amountMinor: 5_00 },
      ],
      1,
      now
    )
    expect(points).toEqual([
      { date: "2026-07-15", incomeMinor: 105_00, expenseMinor: 40_00 },
    ])
  })

  it("границы суток — московские: 22:30 UTC попадает в следующий день", () => {
    const points = groupDailyCashflow(
      [{ occurredAt: new Date("2026-07-13T22:30:00Z"), amountMinor: 10_00 }],
      2,
      now
    )
    expect(points).toEqual([
      { date: "2026-07-14", incomeMinor: 10_00, expenseMinor: 0 },
      { date: "2026-07-15", incomeMinor: 0, expenseMinor: 0 },
    ])
  })

  it("транзакции вне периода отбрасываются", () => {
    const points = groupDailyCashflow(
      [{ occurredAt: new Date("2026-07-10T12:00:00Z"), amountMinor: 10_00 }],
      2,
      now
    )
    expect(points.every((p) => p.incomeMinor === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/transactions.test.ts`
Expected: FAIL — `groupDailyCashflow is not a function`.

- [ ] **Step 3: Минимальная реализация** (добавить в `lib/domain/transactions.ts`)

```ts
export type DailyCashflowPoint = {
  date: string // "YYYY-MM-DD" московских суток
  incomeMinor: number
  expenseMinor: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
// en-CA даёт формат YYYY-MM-DD.
const moscowDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
})

// Непрерывный ряд последних `days` московских суток (кончая сегодняшними):
// сумма положительных сумм — приход, модуль отрицательных — расход.
export function groupDailyCashflow(
  transactions: { occurredAt: Date; amountMinor: number }[],
  days: number,
  now: Date
): DailyCashflowPoint[] {
  const totals = new Map<string, DailyCashflowPoint>()
  for (let i = days - 1; i >= 0; i--) {
    const date = moscowDay.format(new Date(now.getTime() - i * MS_PER_DAY))
    totals.set(date, { date, incomeMinor: 0, expenseMinor: 0 })
  }
  for (const t of transactions) {
    const point = totals.get(moscowDay.format(t.occurredAt))
    if (!point) continue
    if (t.amountMinor > 0) point.incomeMinor += t.amountMinor
    else point.expenseMinor += -t.amountMinor
  }
  return [...totals.values()]
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/transactions.test.ts`
Expected: PASS (включая старые тесты `summarizeByCategory`).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/transactions.ts lib/domain/transactions.test.ts
git commit -m "feat: groupDailyCashflow — приход/расход по московским дням для графика"
```

---

### Task 4: Домен — остатки в рублях (TDD)

**Files:**
- Create: `lib/domain/balances.ts`
- Test: `lib/domain/balances.test.ts`

- [ ] **Step 1: Написать падающие тесты**

```ts
import { describe, expect, it } from "vitest"
import { convertToRubMinor, summarizeBalances } from "./balances"

const rates = new Map([
  ["USD", 80],
  ["CNY", 11.5],
])

describe("convertToRubMinor", () => {
  it("RUB возвращается как есть", () => {
    expect(convertToRubMinor(150_00n, "RUB", rates)).toBe(150_00n)
  })

  it("валюта пересчитывается по курсу (₽ за единицу)", () => {
    // 100 USD в копейках × 80 ₽/USD = 8000 ₽ в копейках
    expect(convertToRubMinor(100_00n, "USD", rates)).toBe(8000_00n)
  })

  it("нет курса — null", () => {
    expect(convertToRubMinor(100_00n, "EUR", rates)).toBeNull()
  })

  it("BigInt-суммы за пределами Int не теряются", () => {
    expect(convertToRubMinor(5_000_000_000_00n, "RUB", rates)).toBe(
      5_000_000_000_00n
    )
  })
})

describe("summarizeBalances", () => {
  const account = (currency: string, balanceMinor: bigint) => ({
    orgName: "ООО Тест",
    accountName: "Основной",
    bankName: "Банк",
    currency,
    balanceMinor,
  })

  it("суммирует рублёвые и валютные счета в ₽", () => {
    const s = summarizeBalances(
      [account("RUB", 1000_00n), account("USD", 10_00n)],
      rates
    )
    expect(s).toEqual({
      totalRubMinor: 1800_00n,
      isPartial: false,
      accountCount: 2,
    })
  })

  it("счёт без курса исключается из итога, итог помечается неполным", () => {
    const s = summarizeBalances(
      [account("RUB", 1000_00n), account("EUR", 10_00n)],
      rates
    )
    expect(s).toEqual({
      totalRubMinor: 1000_00n,
      isPartial: true,
      accountCount: 2,
    })
  })

  it("пустой список — ноль без пометок", () => {
    expect(summarizeBalances([], rates)).toEqual({
      totalRubMinor: 0n,
      isPartial: false,
      accountCount: 0,
    })
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run lib/domain/balances.test.ts`
Expected: FAIL — модуль `./balances` не найден.

- [ ] **Step 3: Минимальная реализация** — создать `lib/domain/balances.ts`

```ts
// Пересчёт остатков по счетам в рубли. Чистые функции без I/O;
// курс — number ₽ за единицу валюты (Decimal из БД приводит вызывающий код).
export type AccountBalanceLike = {
  orgName: string
  accountName: string
  bankName: string | null
  currency: string
  balanceMinor: bigint
}

export type BalancesSummary = {
  totalRubMinor: bigint
  isPartial: boolean // есть счета без курса — итог неполный
  accountCount: number
}

// null — курса для валюты нет. Точность Number достаточна
// до ~90 трлн ₽ (та же граница, что у formatMoneyBig).
export function convertToRubMinor(
  balanceMinor: bigint,
  currency: string,
  rates: Map<string, number>
): bigint | null {
  if (currency === "RUB") return balanceMinor
  const rate = rates.get(currency)
  if (rate === undefined) return null
  return BigInt(Math.round(Number(balanceMinor) * rate))
}

export function summarizeBalances(
  accounts: AccountBalanceLike[],
  rates: Map<string, number>
): BalancesSummary {
  let totalRubMinor = 0n
  let isPartial = false
  for (const a of accounts) {
    const rub = convertToRubMinor(a.balanceMinor, a.currency, rates)
    if (rub === null) isPartial = true
    else totalRubMinor += rub
  }
  return { totalRubMinor, isPartial, accountCount: accounts.length }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run lib/domain/balances.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/balances.ts lib/domain/balances.test.ts
git commit -m "feat: домен остатков — пересчёт в рубли, итог с флагом неполноты"
```

---

### Task 5: Каркас — AppShell и сайдбар

**Files:**
- Create: `components/app-shell.tsx`, `components/app-sidebar.tsx`, `components/nav-main.tsx`
- Modify: `app/layout.tsx`
- Delete: `components/app-header.tsx`

Иконки нельзя передавать из server в client компонент (функции несериализуемы), поэтому сервер передаёт имя иконки строкой, клиент мапит его на компонент lucide.

- [ ] **Step 1: Создать `components/nav-main.tsx`** (клиентский список меню)

```tsx
"use client"

// Список групп меню с подсветкой активного пункта. Группы приходят
// пропсами с сервера уже отфильтрованные по роли; иконки мапятся
// по имени — компоненты не сериализуются через границу server/client.
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  BookOpen,
  FileCheck,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Send,
  Users,
  type LucideIcon,
} from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  transactions: ArrowLeftRight,
  requests: FileCheck,
  dispatch: Send,
  reference: BookOpen,
  users: Users,
  "cash-flow-items": ListChecks,
  verdict: Gauge,
}

export type NavItem = { title: string; href: string; icon: string }
export type NavGroup = { label: string; items: NavItem[] }

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = ICONS[item.icon]
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={<Link href={item.href} />}
                    >
                      {Icon && <Icon />}
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}
```

Проп подмены элемента (`render`) сверь с установленным `components/ui/sidebar.tsx` (Task 1 Step 3).

- [ ] **Step 2: Создать `components/app-sidebar.tsx`** (серверный сайдбар)

```tsx
// Сайдбар приложения: конфиг меню, фильтрация по роли (can()),
// футер с пользователем и выходом. Рендерится только для залогиненных.
import Link from "next/link"
import { logout } from "@/app/login/actions"
import { can, ROLE_LABELS, type Action, type Role } from "@/lib/domain/permissions"
import type { SessionUser } from "@/lib/auth/session"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavMain, type NavGroup } from "@/components/nav-main"

type NavItemConfig = {
  title: string
  href: string
  icon: string
  action?: Action // пункт виден, только если can(role, action)
}

const NAV_CONFIG: { label: string; items: NavItemConfig[] }[] = [
  {
    label: "Обзор",
    items: [{ title: "Дашборд", href: "/", icon: "dashboard" }],
  },
  {
    label: "Операции",
    items: [
      { title: "Транзакции", href: "/transactions", icon: "transactions" },
      { title: "Заявки на оплату", href: "/requests", icon: "requests" },
      { title: "Отправка платёжек", href: "/dispatch", icon: "dispatch" },
    ],
  },
  {
    label: "Справочники",
    items: [{ title: "Справочники", href: "/reference", icon: "reference" }],
  },
  {
    label: "Настройки",
    items: [
      {
        title: "Пользователи",
        href: "/settings/users",
        icon: "users",
        action: "manage_users",
      },
      {
        title: "Статьи для отправки",
        href: "/settings/cash-flow-items",
        icon: "cash-flow-items",
        action: "manage_cash_flow_items",
      },
      {
        title: "Светофор",
        href: "/settings/verdict",
        icon: "verdict",
        action: "manage_verdict_settings",
      },
    ],
  },
]

export function AppSidebar({ user }: { user: SessionUser }) {
  const role = user.role as Role
  const groups: NavGroup[] = NAV_CONFIG.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => !item.action || can(role, item.action))
      .map(({ title, href, icon }) => ({ title, href, icon })),
  })).filter((group) => group.items.length > 0)

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/" />}>
              <span className="font-medium">finflow</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 text-sm">
          <span className="truncate">{user.name}</span>
          <Badge variant="outline">{ROLE_LABELS[role]}</Badge>
        </div>
        <div className="flex items-center justify-between gap-2 px-2">
          <Link
            href="/settings/password"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Сменить пароль
          </Link>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Выйти
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
```

- [ ] **Step 3: Создать `components/app-shell.tsx`**

```tsx
// Каркас приложения: без пользователя (страница /login) — голый контент,
// с пользователем — сайдбар и шапка с кнопкой сворачивания.
import { getCurrentUser } from "@/lib/auth/session"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) return <>{children}</>

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 4: Обновить `app/layout.tsx`** — заменить импорт и использование `AppHeader`:

```tsx
import { AppShell } from "@/components/app-shell"
```

```tsx
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
```

- [ ] **Step 5: Удалить старую шапку**

```bash
git rm components/app-header.tsx
```

Затем `grep -rn "app-header" app components lib` — ссылок остаться не должно.

- [ ] **Step 6: Проверки и живой браузер**

```bash
npm run typecheck && npm run lint
```

Запусти `npm run dev` и проверь в браузере: `/login` — без сайдбара; после входа — сайдбар с группами, активный пункт подсвечен при переходах, футер работает (выход, смена пароля); консоль браузера чистая (ошибка `nativeButton`/семантики кнопки у Base UI видна только здесь — если появилась, у `Button` в роли ссылки нужен `nativeButton={false}`, у `SidebarMenuButton` — сверься с установленным файлом); мобильная ширина — меню в выдвижной панели; обе темы.

- [ ] **Step 7: Прогнать существующие e2e** (каркас затрагивает все страницы)

Run: `npm run test:e2e`
Expected: PASS. `loginAs` ждёт кнопку «Выйти» — она теперь в футере сайдбара и на десктопной ширине видна.

- [ ] **Step 8: Commit**

```bash
git add components/app-shell.tsx components/app-sidebar.tsx components/nav-main.tsx app/layout.tsx
git commit -m "feat: каркас с сайдбаром — группы разделов, роли, футер пользователя"
```

---

### Task 6: Дашборд — запросы и stat-карточки

**Files:**
- Rewrite: `app/page.tsx`

- [ ] **Step 1: Переписать `app/page.tsx`** (график и таблица добавятся в задачах 7–8)

```tsx
import Link from "next/link"
import { requirePageUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { summarizeBalances } from "@/lib/domain/balances"
import { startOfMoscowDay } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { groupDailyCashflow } from "@/lib/domain/transactions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

const CHART_DAYS = 90
const MS_PER_DAY = 24 * 60 * 60 * 1000

export default async function DashboardPage() {
  await requirePageUser()

  const now = new Date()
  const todayStart = startOfMoscowDay(now)
  const chartSince = new Date(
    todayStart.getTime() - (CHART_DAYS - 1) * MS_PER_DAY
  )

  const [
    accounts,
    rateRows,
    onApprovalCount,
    executionGroups,
    dispatchGroups,
    sentTodayCount,
    transactions,
  ] = await Promise.all([
    prisma.accountBalance.findMany({
      orderBy: [{ orgName: "asc" }, { accountName: "asc" }],
    }),
    prisma.currencyRate.findMany(),
    prisma.paymentRequest.count({ where: { approvalStatus: "on_approval" } }),
    prisma.paymentRequest.groupBy({ by: ["executionStatus"], _count: true }),
    prisma.paymentOrderDispatch.groupBy({ by: ["status"], _count: true }),
    prisma.paymentOrderDispatch.count({
      where: { status: "sent", sentAt: { gte: todayStart } },
    }),
    prisma.transaction.findMany({
      where: { occurredAt: { gte: chartSince } },
      select: { occurredAt: true, amountMinor: true },
    }),
  ])

  const rates = new Map(rateRows.map((r) => [r.currencyCode, Number(r.rate)]))
  const balances = summarizeBalances(accounts, rates)
  const executionCount = (status: string) =>
    executionGroups.find((g) => g.executionStatus === status)?._count ?? 0
  const dispatchCount = (status: string) =>
    dispatchGroups.find((g) => g.status === status)?._count ?? 0
  const points = groupDailyCashflow(transactions, CHART_DAYS, now)
  void points // используется графиком в Task 7

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Дашборд</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/reference/bank-accounts">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-sm">На счетах</CardTitle>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  нет данных
                </span>
              ) : (
                <div className="space-y-1">
                  <div className="text-xl font-semibold">
                    {formatMoneyBig(balances.totalRubMinor)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {balances.isPartial
                      ? `счета: ${balances.accountCount}, часть без курса — итог неполный`
                      : `счета: ${balances.accountCount}`}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/requests">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-sm">На согласовании</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold">{onApprovalCount}</div>
              <div className="text-xs text-muted-foreground">
                заявок ждут решения
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/requests">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-sm">К оплате</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold">
                {executionCount("awaiting")}
              </div>
              <div className="text-xs text-muted-foreground">
                из них просрочено: {executionCount("overdue")}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dispatch">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle className="text-sm">Платёжки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <div>
                ждут подтверждения:{" "}
                <span className="font-medium text-foreground">
                  {dispatchCount("awaiting_confirmation")}
                </span>
              </div>
              <div>
                ошибки:{" "}
                <span className="font-medium text-foreground">
                  {dispatchCount("failed")}
                </span>
              </div>
              <div>
                отправлено сегодня:{" "}
                <span className="font-medium text-foreground">
                  {sentTodayCount}
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Проверки**

```bash
npm run typecheck && npm run lint
```

В браузере: `/` показывает заголовок «Дашборд» и 4 карточки; при пустой БД остатков — «нет данных».

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: дашборд — stat-карточки остатков, заявок и платёжек"
```

---

### Task 7: Дашборд — график движения денег

**Files:**
- Create: `app/cashflow-chart.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Создать `app/cashflow-chart.tsx`**

Перед написанием сверь API `ToggleGroup` с установленным `components/ui/toggle-group.tsx` (Base UI: `value: string[]`, `onValueChange(groupValue)`; Radix-пропа `type` нет).

```tsx
"use client"

// График прихода/расхода по дням. Получает с сервера сразу 90 дней
// (значения — целые копейки), переключатель фильтрует на клиенте.
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import { formatDate } from "@/lib/domain/dates"
import { formatMoney } from "@/lib/domain/money"
import type { DailyCashflowPoint } from "@/lib/domain/transactions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const chartConfig = {
  incomeMinor: { label: "Поступления", color: "var(--chart-1)" },
  expenseMinor: { label: "Списания", color: "var(--chart-2)" },
} satisfies ChartConfig

const PERIODS = ["7", "30", "90"] as const

// "2026-07-15" → "15.07"
function dayLabel(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`
}

export function CashflowChart({ points }: { points: DailyCashflowPoint[] }) {
  const [period, setPeriod] = useState<string>("30")
  const visible = points.slice(-Number(period))
  const hasData = visible.some(
    (p) => p.incomeMinor !== 0 || p.expenseMinor !== 0
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Движение денег</CardTitle>
        <ToggleGroup
          value={[period]}
          onValueChange={(value: string[]) => {
            if (value[0]) setPeriod(value[0])
          }}
        >
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p} value={p}>
              {p} дней
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart accessibilityLayer data={visible}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                tickFormatter={dayLabel}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) =>
                      // "YYYY-MM-DD" парсится как UTC-полночь — по Москве это
                      // те же сутки, formatDate вернёт правильную дату
                      formatDate(new Date(String(label)))
                    }
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          {chartConfig[name as keyof typeof chartConfig]
                            ?.label ?? name}
                        </span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {formatMoney(Number(value))}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <Bar
                dataKey="incomeMinor"
                fill="var(--color-incomeMinor)"
                radius={4}
              />
              <Bar
                dataKey="expenseMinor"
                fill="var(--color-expenseMinor)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Нет операций за период
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Встроить график в `app/page.tsx`**

Импорт:

```tsx
import { CashflowChart } from "./cashflow-chart"
```

Удалить строку `void points // используется графиком в Task 7` и после закрывающего `</div>` сетки карточек добавить:

```tsx
      <CashflowChart points={points} />
```

- [ ] **Step 3: Проверки**

```bash
npm run typecheck && npm run lint
```

В браузере: график рендерится, переключатель 7/30/90 мгновенно меняет период, тултип показывает суммы в ₽; без транзакций — «Нет операций за период»; обе темы; консоль чистая.

- [ ] **Step 4: Commit**

```bash
git add app/cashflow-chart.tsx app/page.tsx
git commit -m "feat: график движения денег с переключателем периода 7/30/90"
```

---

### Task 8: Дашборд — таблица остатков по счетам

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Добавить таблицу в `app/page.tsx`**

Дополнить импорты:

```tsx
import { convertToRubMinor } from "@/lib/domain/balances"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
```

(`summarizeBalances` уже импортирован — объединить в один импорт из `@/lib/domain/balances`.)

После `<CashflowChart points={points} />` добавить:

```tsx
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Остатки по счетам</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Данные ещё не синхронизированы
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Организация</TableHead>
                  <TableHead>Банк</TableHead>
                  <TableHead>Счёт</TableHead>
                  <TableHead>Валюта</TableHead>
                  <TableHead className="text-right">Остаток</TableHead>
                  <TableHead className="text-right">В рублях</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => {
                  const rub = convertToRubMinor(
                    a.balanceMinor,
                    a.currency,
                    rates
                  )
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{a.orgName}</TableCell>
                      <TableCell>{a.bankName ?? "—"}</TableCell>
                      <TableCell>{a.accountName}</TableCell>
                      <TableCell>{a.currency}</TableCell>
                      <TableCell className="text-right">
                        {formatMoneyBig(a.balanceMinor, a.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {rub === null ? (
                          <span className="text-muted-foreground">
                            нет курса
                          </span>
                        ) : (
                          formatMoneyBig(rub)
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 2: Проверки**

```bash
npm run typecheck && npm run lint
```

В браузере: при пустых остатках — заглушка; наполнить можно кнопкой «Обновить» на `/requests` (fixture-синк) — тогда таблица с пересчётом в ₽.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: таблица остатков по счетам с пересчётом в рубли"
```

---

### Task 9: E2e-смоук и финальные проверки

**Files:**
- Create: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Написать e2e-смоук**

```ts
import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

test("дашборд: карточки, график и таблица на месте", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible()
  await expect(page.getByText("На счетах")).toBeVisible()
  await expect(page.getByText("На согласовании")).toBeVisible()
  await expect(page.getByText("К оплате")).toBeVisible()
  await expect(page.getByText("Платёжки", { exact: true })).toBeVisible()
  await expect(page.getByText("Движение денег")).toBeVisible()
  await expect(page.getByText("Остатки по счетам")).toBeVisible()
})

test("график наполняется созданной транзакцией", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/transactions")
  await page.getByLabel("Категория").fill("Тест дашборда")
  await page.getByLabel("Сумма").fill("321,00")
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByText("Тест дашборда").first()).toBeVisible()

  await page.goto("/")
  await expect(page.getByText("Нет операций за период")).toBeHidden()
})

test("сайдбар: группы видны, переход подсвечивает раздел", async ({
  page,
}) => {
  await loginAs(page, "owner")
  await page.goto("/")
  for (const label of ["Обзор", "Операции", "Справочники", "Настройки"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
  await page.getByRole("link", { name: "Транзакции" }).click()
  await expect(page).toHaveURL(/\/transactions/)
  await expect(page.getByRole("heading", { name: "Транзакции" })).toBeVisible()
})

test("читатель не видит группу «Настройки»", async ({ page }) => {
  await loginAs(page, "viewer")
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible()
  await expect(page.getByText("Настройки", { exact: true })).toBeHidden()
  await expect(page.getByRole("link", { name: "Пользователи" })).toBeHidden()
})
```

Транзакция создаётся внутри теста через UI (как в `transactions.spec.ts`) — от seed-данных график не зависит.

- [ ] **Step 2: Прогнать e2e**

Run: `npm run test:e2e`
Expected: PASS — новый спек и все существующие.

- [ ] **Step 3: Полный набор проверок перед финишем**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
```

Expected: всё зелёное. После `format` проверь `git status` — если форматер тронул файлы, добавь их в коммит.

- [ ] **Step 4: Финальная ручная проверка в браузере**

Обе темы, мобильная ширина (сайдбар в панели, карточки в одну колонку), чистая консоль на `/`, `/login`, `/transactions`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/dashboard.spec.ts
git commit -m "test: e2e-смоук сайдбара и дашборда"
```

---

## После завершения

Ветка `feature/sidebar-dashboard` готова к доставке командой `/ship` (проверки → merge в `develop` → контроль деплоя в песочницу). Доставку запускает пользователь.
