# План 1: Фундамент репозитория finflow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Репозиторий finflow, в котором локальная разработка полностью работает (Prisma + PostgreSQL, seed, unit- и e2e-каркасы, образцовая фича), а правила команды зашиты в CLAUDE.md и `.claude/`.

**Architecture:** Этап 1 спеки `docs/superpowers/specs/2026-07-13-team-environment-design.md`. Всё делается локально в ветке `main` (remote и команда появятся в Плане 2, до этого main — рабочая ветка разработчика). Добавляем слой БД (Prisma 6, деньги в целых копейках), доменную логику в `lib/domain/` с unit-тестами (Vitest), образцовую фичу `/transactions` на shadcn как эталон конвенций, e2e-смоук (Playwright), затем правила: CLAUDE.md, `.claude/settings.json`, копии процессных скиллов, команды-заглушки.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui (Base UI), Prisma 6 + PostgreSQL, Vitest, Playwright, Node 26, npm.

**Важно для исполнителя:** перед задачами 5–6 прочитай гайды App Router в `node_modules/next/dist/docs/` — репозиторный AGENTS.md предупреждает, что эта версия Next.js отличается от привычной.

---

### Task 1: Зафиксировать версию Node

**Files:**
- Create: `.nvmrc`
- Modify: `package.json`

- [ ] **Step 1: Создать `.nvmrc`**

Содержимое файла (одна строка):

```
26
```

- [ ] **Step 2: Добавить `engines` в `package.json`**

После блока `"private": true,` добавить:

```json
"engines": {
  "node": ">=26"
},
```

- [ ] **Step 3: Проверить валидность package.json**

Run: `node -e "require('/Users/minas/projects/finflow/package.json'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .nvmrc package.json
git commit -m "chore: зафиксирована версия Node 26"
```

---

### Task 2: Prisma — схема, локальная БД, миграция, клиент

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db.ts`
- Create: `.env` (не коммитится)
- Modify: `package.json`

- [ ] **Step 1: Проверить локальный PostgreSQL**

Run: `psql --version`
Expected: строка вида `psql (PostgreSQL) 16.x` или новее.
Если команда не найдена: `brew install postgresql@17 && brew services start postgresql@17`, затем повторить проверку.

- [ ] **Step 2: Установить Prisma 6**

Prisma 7 сменила генератор клиента и конвенции; фиксируемся на стабильной 6-й мажорной.

Run: `npm install --save-dev prisma@6 tsx && npm install @prisma/client@6`
Expected: успешная установка, в package.json появились зависимости.

- [ ] **Step 3: Создать `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Деньги храним в целых копейках (amountMinor).
// Знак: положительное значение — доход, отрицательное — расход.
model Transaction {
  id          String   @id @default(cuid())
  occurredAt  DateTime
  amountMinor Int
  currency    String   @default("RUB")
  category    String
  note        String?
  createdAt   DateTime @default(now())

  @@map("transactions")
}
```

- [ ] **Step 4: Создать `.env` с локальной строкой подключения**

```
DATABASE_URL="postgresql://localhost:5432/finflow_dev"
```

Проверить, что `.env` игнорируется git:

Run: `git check-ignore .env && echo ignored`
Expected: `ignored` (шаблон Next.js уже игнорирует `.env*`; если нет — добавить `.env*` в `.gitignore`).

- [ ] **Step 5: Создать локальную БД и первую миграцию**

Run: `createdb finflow_dev && npx prisma migrate dev --name init`
Expected: `Your database is now in sync with your schema`, создан каталог `prisma/migrations/<timestamp>_init/` с `migration.sql`, выполнен `prisma generate`.

- [ ] **Step 6: Добавить скрипт postinstall**

В `package.json` в блок `"scripts"` добавить:

```json
"postinstall": "prisma generate"
```

- [ ] **Step 7: Создать `lib/db.ts` — синглтон клиента**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 8: Проверить typecheck**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 9: Commit**

```bash
git add prisma/ lib/db.ts package.json package-lock.json
git commit -m "feat: Prisma 6 + схема Transaction + локальная миграция"
```

---

### Task 3: Seed демо-данных

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json`

- [ ] **Step 1: Создать `prisma/seed.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const demo: Array<{
  occurredAt: string;
  amountMinor: number;
  category: string;
  note?: string;
}> = [
  { occurredAt: "2026-06-01", amountMinor: 12000000, category: "Зарплата", note: "Аванс" },
  { occurredAt: "2026-06-03", amountMinor: -450050, category: "Продукты" },
  { occurredAt: "2026-06-05", amountMinor: -120000, category: "Транспорт", note: "Проездной" },
  { occurredAt: "2026-06-08", amountMinor: -890000, category: "Аренда" },
  { occurredAt: "2026-06-10", amountMinor: -230075, category: "Продукты" },
  { occurredAt: "2026-06-12", amountMinor: 3500000, category: "Фриланс", note: "Проект А" },
  { occurredAt: "2026-06-15", amountMinor: 12000000, category: "Зарплата", note: "Оклад" },
  { occurredAt: "2026-06-17", amountMinor: -156000, category: "Развлечения", note: "Кино" },
  { occurredAt: "2026-06-20", amountMinor: -340025, category: "Продукты" },
  { occurredAt: "2026-06-22", amountMinor: -78000, category: "Транспорт", note: "Такси" },
  { occurredAt: "2026-06-25", amountMinor: -1200000, category: "Техника", note: "Клавиатура" },
  { occurredAt: "2026-06-28", amountMinor: -95050, category: "Развлечения" },
];

async function main() {
  await prisma.transaction.deleteMany();
  await prisma.transaction.createMany({
    data: demo.map((d) => ({
      occurredAt: new Date(d.occurredAt),
      amountMinor: d.amountMinor,
      category: d.category,
      note: d.note ?? null,
    })),
  });
  const count = await prisma.transaction.count();
  console.log(`Seed: создано ${count} транзакций`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Подключить seed в `package.json`**

На верхнем уровне package.json (рядом со `"scripts"`) добавить:

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
},
```

- [ ] **Step 3: Прогнать seed**

Run: `npx prisma db seed`
Expected: `Seed: создано 12 транзакций`

- [ ] **Step 4: Проверить данные в БД**

Run: `psql finflow_dev -c "SELECT count(*), sum(\"amountMinor\") FROM transactions;"`
Expected: `12` строк, сумма `23940800` (в копейках).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat: seed демо-транзакций"
```

---

### Task 4: Vitest + доменная логика (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/domain/money.test.ts`
- Create: `lib/domain/money.ts`
- Create: `lib/domain/transactions.test.ts`
- Create: `lib/domain/transactions.ts`
- Modify: `package.json`

- [ ] **Step 1: Установить Vitest**

Run: `npm install --save-dev vitest`

- [ ] **Step 2: Создать `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Добавить скрипт в `package.json`**

В блок `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Написать падающий тест `lib/domain/money.test.ts`**

Intl вставляет неразрывные пробелы — в тестах нормализуем их в обычные.

```ts
import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

const norm = (s: string) => s.replace(/[  ]/g, " ");

describe("formatMoney", () => {
  it("форматирует копейки в рубли по ru-RU", () => {
    expect(norm(formatMoney(123456))).toBe("1 234,56 ₽");
  });

  it("форматирует отрицательные суммы", () => {
    expect(norm(formatMoney(-50000))).toBe("-500,00 ₽");
  });
});
```

- [ ] **Step 5: Убедиться, что тест падает**

Run: `npm run test`
Expected: FAIL — `Cannot find module './money'` (или аналогичная ошибка резолва).

- [ ] **Step 6: Реализовать `lib/domain/money.ts`**

```ts
// Деньги во всём проекте — целые копейки (minor units).
export function formatMoney(amountMinor: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
    amountMinor / 100,
  );
}
```

- [ ] **Step 7: Убедиться, что тесты money проходят**

Run: `npm run test`
Expected: PASS (2 теста).

- [ ] **Step 8: Написать падающий тест `lib/domain/transactions.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { summarizeByCategory } from "./transactions";

describe("summarizeByCategory", () => {
  it("возвращает пустой массив для пустого входа", () => {
    expect(summarizeByCategory([])).toEqual([]);
  });

  it("группирует и суммирует по категориям", () => {
    const result = summarizeByCategory([
      { category: "Продукты", amountMinor: -100 },
      { category: "Зарплата", amountMinor: 500 },
      { category: "Продукты", amountMinor: -250 },
    ]);
    expect(result).toEqual([
      { category: "Зарплата", totalMinor: 500 },
      { category: "Продукты", totalMinor: -350 },
    ]);
  });

  it("сортирует категории по алфавиту (ru)", () => {
    const result = summarizeByCategory([
      { category: "Ужин", amountMinor: 1 },
      { category: "Аренда", amountMinor: 1 },
    ]);
    expect(result.map((r) => r.category)).toEqual(["Аренда", "Ужин"]);
  });
});
```

- [ ] **Step 9: Убедиться, что тест падает**

Run: `npm run test`
Expected: FAIL — `Cannot find module './transactions'`.

- [ ] **Step 10: Реализовать `lib/domain/transactions.ts`**

```ts
export type TransactionLike = { category: string; amountMinor: number };
export type CategorySummary = { category: string; totalMinor: number };

export function summarizeByCategory(
  transactions: TransactionLike[],
): CategorySummary[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amountMinor);
  }
  return [...totals.entries()]
    .map(([category, totalMinor]) => ({ category, totalMinor }))
    .sort((a, b) => a.category.localeCompare(b.category, "ru"));
}
```

- [ ] **Step 11: Все unit-тесты зелёные**

Run: `npm run test`
Expected: PASS (5 тестов).

- [ ] **Step 12: Commit**

```bash
git add vitest.config.ts lib/domain/ package.json package-lock.json
git commit -m "feat: доменная логика денег и сводки по категориям (TDD)"
```

---

### Task 5: Образцовая фича /transactions (эталон конвенций)

Эта страница — «эталонная фича», на которую ссылается CLAUDE.md: server component + Prisma + доменная логика + shadcn в токенах темы + server action.

**Files:**
- Create: `app/transactions/page.tsx`
- Create: `app/transactions/actions.ts`
- Create: `app/transactions/transaction-form.tsx`
- Modify: `app/page.tsx` (ссылка на раздел)
- Create (через shadcn CLI): `components/ui/{button,input,label,card,table}.tsx`

- [ ] **Step 0: Прочитать доки Next.js 16**

Прочитать в `node_modules/next/dist/docs/` разделы про Server Components, Server Actions и revalidatePath. Если реальные API отличаются от кода ниже — адаптировать код к документации, сохранив поведение.

- [ ] **Step 1: Добавить shadcn-компоненты**

Run: `npx shadcn add button input label card table`
Expected: файлы появились в `components/ui/`.

- [ ] **Step 2: Создать server action `app/transactions/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function createTransaction(formData: FormData) {
  const category = String(formData.get("category") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").replace(",", ".");
  const amountRub = Number(rawAmount);
  const note = String(formData.get("note") ?? "").trim();

  if (!category || !Number.isFinite(amountRub) || amountRub === 0) {
    throw new Error("Укажите категорию и ненулевую сумму");
  }

  await prisma.transaction.create({
    data: {
      category,
      amountMinor: Math.round(amountRub * 100),
      note: note || null,
      occurredAt: new Date(),
    },
  });

  revalidatePath("/transactions");
}
```

- [ ] **Step 3: Создать форму `app/transactions/transaction-form.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTransaction } from "./actions";

export function TransactionForm() {
  return (
    <form action={createTransaction} className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="category">Категория</Label>
        <Input id="category" name="category" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="amount">Сумма</Label>
        <Input id="amount" name="amount" placeholder="-500 или 1000,50" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="note">Заметка</Label>
        <Input id="note" name="note" />
      </div>
      <Button type="submit">Добавить</Button>
    </form>
  );
}
```

- [ ] **Step 4: Создать страницу `app/transactions/page.tsx`**

```tsx
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/domain/money";
import { summarizeByCategory } from "@/lib/domain/transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransactionForm } from "./transaction-form";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { occurredAt: "desc" },
  });
  const summary = summarizeByCategory(transactions);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Транзакции</h1>

      <TransactionForm />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {summary.map((s) => (
          <Card key={s.category}>
            <CardHeader>
              <CardTitle className="text-sm">{s.category}</CardTitle>
            </CardHeader>
            <CardContent className="font-medium">
              {formatMoney(s.totalMinor)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Заметка</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.occurredAt.toLocaleDateString("ru-RU")}</TableCell>
              <TableCell>{t.category}</TableCell>
              <TableCell>{t.note}</TableCell>
              <TableCell className="text-right">
                {formatMoney(t.amountMinor)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  );
}
```

- [ ] **Step 5: Добавить ссылку с главной**

В `app/page.tsx` добавить в разметку (в подходящее по существующей структуре место) ссылку:

```tsx
<Link href="/transactions">Транзакции</Link>
```

с `import Link from "next/link";` вверху файла.

- [ ] **Step 6: Проверить вручную**

Run: `npm run dev` (в фоне), затем `curl -s http://localhost:3000/transactions | grep -o "Транзакции" | head -1`
Expected: `Транзакции`; страница отдаёт список из seed-данных без ошибок в консоли dev-сервера. Остановить dev-сервер.

- [ ] **Step 7: Формат, линт, typecheck**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add app/ components/ package.json package-lock.json
git commit -m "feat: образцовая фича /transactions (эталон конвенций)"
```

---

### Task 6: Playwright — e2e-смоук

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/transactions.spec.ts`
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: Установить Playwright**

Run: `npm install --save-dev @playwright/test && npx playwright install chromium`
Expected: пакет установлен, браузер chromium скачан.

- [ ] **Step 2: Создать `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Добавить скрипт и gitignore**

В `"scripts"` package.json:

```json
"test:e2e": "playwright test"
```

В `.gitignore` добавить строки:

```
test-results/
playwright-report/
```

- [ ] **Step 4: Написать смоук `tests/e2e/transactions.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test("страница транзакций открывается и показывает данные", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page.getByRole("heading", { name: "Транзакции" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();
});

test("новая транзакция появляется в списке", async ({ page }) => {
  await page.goto("/transactions");
  const note = `e2e-${Date.now()}`;
  await page.getByLabel("Категория").fill("Тест");
  await page.getByLabel("Сумма").fill("123,45");
  await page.getByLabel("Заметка").fill(note);
  await page.getByRole("button", { name: "Добавить" }).click();
  await expect(page.getByText(note)).toBeVisible();
});
```

- [ ] **Step 5: Прогнать e2e**

Run: `npm run test:e2e`
Expected: 2 passed. (Тест пишет строку в локальную БД — это нормально, данные расходные.)

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/ package.json package-lock.json .gitignore
git commit -m "feat: e2e-смоук Playwright для /transactions"
```

---

### Task 7: CLAUDE.md — правила команды

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Создать `CLAUDE.md`**

````markdown
# finflow — правила работы

Внутреннее финансовое приложение. Его развивают доменные специалисты (не разработчики)
через Claude Code. Эти правила обязательны для каждой сессии. Полная спецификация
окружения: `docs/superpowers/specs/2026-07-13-team-environment-design.md`.

## Жёсткие рамки

- Стек только такой: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui +
  Prisma + PostgreSQL. Никаких других фреймворков, сборщиков, ORM и CSS-подходов.
- **Новые npm-зависимости — только с одобрения разработчика (Минас).** Если для
  задачи кажется нужной новая библиотека — остановись и спроси, не устанавливай.
- Ветка `main` — production, в неё нельзя пушить и мержить локально. Путь в prod
  один: PR `sandbox` → `main`, ревью разработчика.

## Процесс разработки

- Любая новая функциональность или изменение поведения начинается со скилла
  **brainstorming** (спека → план → реализация). Не пиши код фичи без утверждённого
  дизайна — даже «простой».
- Мелкие правки (опечатка, текст на кнопке) можно делать без полного цикла,
  но через обычные проверки перед коммитом.
- Образцовая фича — `app/transactions/`: server component + Prisma + доменная
  логика из `lib/domain/` + shadcn + server action. Новые фичи строй по этому образцу.

## Структура каталогов

- `app/<раздел>/` — страницы, layout'ы и server actions раздела.
- `components/ui/` — только компоненты shadcn (не редактировать руками).
- `components/` (вне ui/) — переиспользуемые композиции из shadcn-примитивов.
- `lib/domain/` — чистая доменная логика (расчёты, деньги, агрегации). Без React,
  без Prisma, без I/O.
- `lib/db.ts` — единственная точка доступа к Prisma-клиенту.
- `prisma/` — схема, миграции, seed.
- `tests/e2e/` — Playwright-смоук.

## База данных и деньги

- Схему меняем только через `prisma/schema.prisma` + `npx prisma migrate dev --name <слаг>`.
- Применённые миграции не редактируются — только новая миграция.
- Деструктивная миграция (удаление таблицы/колонки с данными) — явно предупреди
  пользователя до применения и отметь это в описании изменений.
- **Деньги — всегда целые копейки (`amountMinor: Int`)**, форматирование только
  через `formatMoney` из `lib/domain/money.ts`. Никаких float для денег.

## Тесты (гибрид по слоям)

- Чистая логика в `lib/domain/` — обязательные unit-тесты (Vitest, TDD),
  файл `*.test.ts` рядом с кодом.
- Ключевые пользовательские сценарии — e2e-смоук в `tests/e2e/` (Playwright).
  При добавлении фичи добавь/обнови смоук её главного сценария.
- **Unit-тесты на React-компоненты и страницы запрещены** — их роль выполняет e2e.

## UI: только shadcn в рамках темы

1. Компоненты — только shadcn/ui: `npx shadcn add <имя>` или композиции из уже
   установленных примитивов. Другие UI-библиотеки запрещены.
2. Стили — только Tailwind-классы и токены темы (CSS-переменные из `app/globals.css`).
   Без хардкод-цветов, инлайн-стилей и новых шрифтов. Тему меняет только разработчик.
3. Иконки — только `lucide-react`.
4. Графики — только shadcn charts.
5. Нет подходящего компонента в shadcn — остановись и спроси разработчика.
   Одобренные исключения фиксируются в списке ниже.

### Разрешённые исключения

(пока пусто)

## Языковые конвенции

- Интерфейс приложения — на русском.
- Код, идентификаторы, имена файлов — на английском.
- Коммиты — conventional commits (`feat:`, `fix:`, `chore:`, `docs:`), описание на русском.

## Проверки перед любым коммитом

```bash
npm run format && npm run lint && npm run typecheck && npm run test
```

## Доставка и операционный режим

- Доставка только командами: `/ship` (в песочницу), `/request-prod` (PR на релиз),
  `/status`, `/logs`, `/reset-sandbox`. Не изобретай процесс деплоя заново.
- Операционные отчёты/выгрузки по prod-данным — только через read-only подключение
  `DATABASE_URL_PROD_RO` из `.env` (выдаёт разработчик). Писать в prod-БД нельзя
  технически — и не пытайся обходить.
````

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — правила команды finflow"
```

---

### Task 8: .claude — настройки и процессные скиллы

**Files:**
- Create: `.claude/settings.json`
- Create: `.claude/skills/` (копии пяти скиллов)

- [ ] **Step 1: Создать `.claude/settings.json`**

Allowlist типовых безопасных операций, чтобы специалистов не заваливало запросами разрешений:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run typecheck)",
      "Bash(npm run test)",
      "Bash(npm run test:*)",
      "Bash(npm run format)",
      "Bash(npm run build)",
      "Bash(npm run dev:*)",
      "Bash(npx prisma generate)",
      "Bash(npx prisma migrate dev:*)",
      "Bash(npx prisma db seed)",
      "Bash(npx shadcn add:*)",
      "Bash(npx playwright test:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git switch:*)",
      "Bash(git pull:*)",
      "Bash(git merge:*)",
      "Bash(git push:*)"
    ]
  }
}
```

`git push` разрешён, потому что пуш в `main` блокируется на стороне GitHub (branch protection, План 2), а не на машине специалиста.

- [ ] **Step 2: Скопировать процессные скиллы в репо**

Копии (не симлинки), чтобы окружение не зависело от личных установок на машинах:

```bash
mkdir -p .claude/skills
cp -RL /Users/minas/.claude/skills/brainstorming .claude/skills/
cp -RL /Users/minas/.claude/skills/writing-plans .claude/skills/
cp -RL /Users/minas/.claude/skills/executing-plans .claude/skills/
cp -RL /Users/minas/.claude/skills/test-driven-development .claude/skills/
cp -RL /Users/minas/.claude/skills/systematic-debugging .claude/skills/
```

- [ ] **Step 3: Проверить копии**

Run: `ls .claude/skills/*/SKILL.md | wc -l`
Expected: `5`

Run: `grep -rl "/Users/minas" .claude/skills/ || echo clean`
Expected: `clean` (в копиях нет абсолютных путей; если есть — заменить на относительные).

- [ ] **Step 4: Commit**

```bash
git add .claude/
git commit -m "feat: .claude — allowlist разрешений и процессные скиллы в репо"
```

---

### Task 9: Команды-заглушки доставки и опер-режима

Работающие версии появятся в Планах 2–3; заглушки нужны, чтобы команды были видны и честно объясняли статус, а не чтобы имитировать работу.

**Files:**
- Create: `.claude/commands/ship.md`
- Create: `.claude/commands/request-prod.md`
- Create: `.claude/commands/status.md`
- Create: `.claude/commands/logs.md`
- Create: `.claude/commands/reset-sandbox.md`
- Create: `.claude/commands/onboarding.md`

- [ ] **Step 1: Создать шесть файлов команд**

`.claude/commands/ship.md`:

```markdown
---
description: Доставить изменения в песочницу (проверки → коммит → merge в sandbox → контроль деплоя)
---

Команда пока не активна: контур доставки (GitHub + сервер) ещё не настроен.
Сообщи пользователю: «/ship заработает после внедрения этапа "Контур доставки"
(спека: docs/superpowers/specs/2026-07-13-team-environment-design.md, раздел 16,
этапы 2–4)» — и остановись. Ничего не коммить и не пушь.
```

`.claude/commands/request-prod.md`:

```markdown
---
description: Создать PR sandbox → main на ревью разработчику (релиз в production)
---

Команда пока не активна: GitHub-контур ещё не настроен. Сообщи пользователю:
«/request-prod заработает после внедрения этапа "Контур доставки" (спека:
docs/superpowers/specs/2026-07-13-team-environment-design.md)» — и остановись.
```

`.claude/commands/status.md`:

```markdown
---
description: Состояние контуров sandbox и production (HTTP, pm2, последние деплои)
---

Команда пока не активна: серверный контур ещё не настроен. Сообщи пользователю:
«/status заработает после внедрения этапа "Контур доставки" (спека:
docs/superpowers/specs/2026-07-13-team-environment-design.md)» — и остановись.
```

`.claude/commands/logs.md`:

```markdown
---
description: Логи контура (sandbox или production)
---

Команда пока не активна: серверный контур ещё не настроен. Сообщи пользователю:
«/logs заработает после внедрения этапа "Контур доставки" (спека:
docs/superpowers/specs/2026-07-13-team-environment-design.md)» — и остановись.
```

`.claude/commands/reset-sandbox.md`:

```markdown
---
description: Пересоздать sandbox-БД из миграций и seed (данные песочницы расходные)
---

Команда пока не активна: серверный контур ещё не настроен. Сообщи пользователю:
«/reset-sandbox заработает после внедрения этапа "Контур доставки" (спека:
docs/superpowers/specs/2026-07-13-team-environment-design.md)» — и остановись.
```

`.claude/commands/onboarding.md`:

```markdown
---
description: Первичная настройка машины специалиста (Node, PostgreSQL, БД, .env, зависимости)
---

Команда пока не активна: onboarding внедряется этапом 5 (спека:
docs/superpowers/specs/2026-07-13-team-environment-design.md). Сообщи это
пользователю и остановись.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/
git commit -m "feat: команды-заглушки доставки и опер-режима"
```

---

### Task 10: README, .env.example, финальная проверка

**Files:**
- Modify: `README.md` (полная замена содержимого)
- Create: `.env.example`
- Modify: `.gitignore` (при необходимости)

- [ ] **Step 1: Создать `.env.example`**

```
# Локальная база разработки (создаётся при onboarding)
DATABASE_URL="postgresql://localhost:5432/finflow_dev"

# Read-only доступ к prod-данным для операционного режима (выдаёт разработчик)
# DATABASE_URL_PROD_RO="postgresql://finflow_ro:<пароль>@<сервер>:5432/finflow_prod"
```

- [ ] **Step 2: Убедиться, что `.env.example` коммитится**

Run: `git check-ignore .env.example && echo IGNORED || echo ok`
Expected: `ok`. Если `IGNORED` — добавить в `.gitignore` строку `!.env.example` после шаблона `.env*`.

- [ ] **Step 3: Переписать `README.md`**

````markdown
# finflow

Внутреннее финансовое приложение. Разрабатывается доменными специалистами
через Claude Code по правилам из `CLAUDE.md`.

## Документы

- Правила работы: `CLAUDE.md`
- Спецификация окружения: `docs/superpowers/specs/2026-07-13-team-environment-design.md`
- Планы внедрения: `docs/superpowers/plans/`

## Быстрый старт (разработчик)

```bash
nvm use                # Node 26
npm install
createdb finflow_dev   # локальный PostgreSQL
cp .env.example .env
npx prisma migrate dev
npx prisma db seed
npm run dev            # http://localhost:3000
```

## Проверки

```bash
npm run lint && npm run typecheck && npm run test   # быстрые
npm run test:e2e                                    # e2e-смоук
```

Специалисты настраивают машину командой `/onboarding` в Claude Code
(активируется после внедрения этапа 5).
````

- [ ] **Step 4: Полная проверка фундамента**

Run: `npm run format && npm run lint && npm run typecheck && npm run test && npm run build`
Expected: всё зелёное, build успешен.

Run: `npx prisma migrate reset --force && npm run test:e2e`
Expected: БД пересоздана из миграций + seed, e2e 2 passed. Это репетиция будущего `/reset-sandbox`.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example .gitignore
git commit -m "docs: README и .env.example"
```

---

## Definition of Done (План 1)

- `npm install && npx prisma migrate dev && npx prisma db seed && npm run dev` поднимает рабочее приложение с данными на чистой машине с Node 26 и PostgreSQL.
- `npm run lint / typecheck / test / test:e2e / build` — зелёные.
- В репо: CLAUDE.md, `.claude/settings.json`, 5 процессных скиллов, 6 команд-заглушек.
- Образцовая фича `/transactions` демонстрирует все конвенции (Prisma, lib/domain, shadcn, server action, деньги в копейках).

## Следующие планы

- **План 2 — Контур доставки** (этапы 2–4 спеки): пишется после получения входных данных — адрес VPS и SSH-доступ, домены sandbox/prod, GitHub-организация и имя репо, пароль basic auth.
- **План 3 — Люди** (этапы 5–6): команда `/onboarding`, пилот на Windows-машине, профильные скиллы; нужен список специалистов и их профили.
