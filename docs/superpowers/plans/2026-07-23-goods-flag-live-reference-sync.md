# Галочка «оплата за товар» в справочнике ДДС + живой синк 1С — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Признак «оплата за товар» переезжает из отдельной вкладки настроек в справочник «Статьи ДДС»; таблица `cash_flow_item_settings` и вкладка удаляются; клиент 1С получает реальное имя справочника БДР, после чего синк можно переключать на живую 1С.

**Architecture:** Поле `isGoods` живёт на `Article` (локальный признак finflow, синк из 1С его не трогает). `syncDispatch` берёт «товарные» названия из справочника ДДС вместо своей таблицы. Переключатель — server action + клиентский компонент по паттерну `useActionState` (как везде в проекте).

**Tech Stack:** Next.js App Router, Prisma + PostgreSQL, shadcn/ui (Base UI), Playwright e2e.

**Спека:** `docs/superpowers/specs/2026-07-23-goods-flag-live-reference-sync-design.md`

**Отклонение от спеки (осознанное):** спека описывает одну миграцию из трёх шагов. В плане их две — Task 3 (добавить колонку + перенести галочки) и Task 6 (удалить таблицу). Итоговое состояние БД то же самое; разделение нужно, чтобы каждый коммит проходил `typecheck` и тесты (код, читающий старую таблицу, живёт до Task 5–6). Деструктивный шаг (DROP TABLE) — только в Task 6.

---

## Карта файлов

| Файл | Что происходит |
|---|---|
| `lib/integrations/one-c-odata-fixture.ts` | + статья ДДС «Оплата поставщикам за товар» |
| `lib/integrations/one-c-odata-http.ts` | имя набора БДР → `Catalog_RSФП_СтруктураБДР`, комментарии |
| `lib/sync/run-reference-sync.ts` | предупреждение о пустом виде движения — только для ДДС |
| `prisma/schema.prisma` | + `Article.isGoods`; − модель `CashFlowItemSetting` |
| `prisma/migrations/...` | две миграции (см. Task 3 и Task 6) |
| `app/reference/cashflow-items/actions.ts` | создать: server action `toggleIsGoods` |
| `components/reference/goods-toggle.tsx` | создать: клиентский переключатель |
| `components/reference/article-dictionary.tsx` | опциональная колонка «Оплата за товар» |
| `app/reference/cashflow-items/page.tsx` | передать goods-проп, подпись, право |
| `lib/sync/sync-dispatch.ts` | «товарные» статьи — из справочника ДДС |
| `prisma/seed.ts` | флаг ставится на статью справочника после reference-синка |
| `app/settings/cash-flow-items/` (3 файла) | удалить |
| `components/app-sidebar.tsx` | − пункт «Статьи для отправки» |
| `tests/e2e/reference.spec.ts` | + тест переключателя |
| `tests/e2e/dispatch.spec.ts` | − тест старой вкладки |

Все команды — из корня репозитория, в ветке `feature/goods-flag-live-sync`:

```bash
git checkout -b feature/goods-flag-live-sync
```

---

### Task 1: Фикстура 1С — статья «Оплата поставщикам за товар»

Демо-заявки из DWH-фикстуры (`lib/integrations/dwh-fixture.ts`) ссылаются на статью «Оплата поставщикам за товар», но в демо-справочнике ДДС такой статьи нет — сопоставление по названию не сойдётся. Добавляем.

**Files:**
- Modify: `lib/integrations/one-c-odata-fixture.ts` (массив `CASHFLOW`, после элемента `fx-cf-out-suppliers`)

- [ ] **Step 1: Добавить статью в фикстуру**

После объекта с `uid: "fx-cf-out-suppliers"` (заканчивается на строке 41) вставить:

```ts
  {
    uid: "fx-cf-out-goods",
    code: "1.3",
    name: "Оплата поставщикам за товар",
    parentUid: "fx-cf-group-op",
    isGroup: false,
    flow: "OUTFLOW",
    description: null,
    isDeletedIn1c: false,
  },
```

Название должно посимвольно совпадать с `cashFlowItem` в `lib/integrations/dwh-fixture.ts` («Оплата поставщикам за товар»).

- [ ] **Step 2: Проверки**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
```

Ожидание: всё зелёное (изменение — только данные фикстуры).

- [ ] **Step 3: Commit**

```bash
git add lib/integrations/one-c-odata-fixture.ts
git commit -m "feat: статья «Оплата поставщикам за товар» в демо-справочнике ДДС"
```

---

### Task 2: HTTP-клиент 1С — реальное имя справочника БДР

В коде осталось предварительное имя `Catalog_СтатьиДоходовИРасходов` — такого объекта в базе `rbb_cut` нет. Реальное имя проверено живым запросом 2026-07-22: `Catalog_RSФП_СтруктураБДР`. Полей `ВидДвижения` и `Комментарий` этот справочник не отдаёт — клиент их не запрашивает явно (нет `$select`), отсутствующее поле даёт `null`, `parseFlow(null)` → `null`. Менять маппинг не нужно, но предупреждения синка «нет вида движения» для БДР становятся штатной ситуацией — оставляем их только для ДДС.

**Files:**
- Modify: `lib/integrations/one-c-odata-http.ts:1-24`
- Modify: `lib/sync/run-reference-sync.ts:119-122`

- [ ] **Step 1: Заменить имя набора и устаревший комментарий**

В `lib/integrations/one-c-odata-http.ts` заменить шапку файла (строки 1–5):

```ts
// Реальный клиент OData 1С: basic auth, только GET, постранично.
// Имена объектов и реквизитов 1С собраны здесь в одной карте — проверены
// живыми запросами к базе rbb_cut (учётка ClaudeOR, 2026-07-22/23).
```

И в карте `NAMES` заменить:

```ts
    PNL: "Catalog_СтатьиДоходовИРасходов",
```

на:

```ts
    // Справочник не отдаёт полей ВидДвижения и Комментарий — отсутствующее
    // поле даёт null, это штатно (вид движения статьям БДР не нужен,
    // решение 2026-07-22).
    PNL: "Catalog_RSФП_СтруктураБДР",
```

Также в комментарии к `NAMES` (строки 18–19) убрать фразу «ВНИМАНИЕ: значения предварительные, уточняются в Task 15».

- [ ] **Step 2: Предупреждение о пустом виде движения — только для ДДС**

В `lib/sync/run-reference-sync.ts` заменить:

```ts
    // Нераспознанный вид движения у конечной статьи — предупреждение, не сбой.
    for (const a of [...cashflow, ...pnl]) {
      if (!a.isGroup && a.flow === null && !a.isDeletedIn1c) totals.warnings++
    }
```

на:

```ts
    // Нераспознанный вид движения у конечной статьи ДДС — предупреждение,
    // не сбой. У статей БДР вида движения нет вовсе (решение 2026-07-22) —
    // для них это не предупреждение.
    for (const a of cashflow) {
      if (!a.isGroup && a.flow === null && !a.isDeletedIn1c) totals.warnings++
    }
```

- [ ] **Step 3: Проверки**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
```

Ожидание: зелёное.

- [ ] **Step 4: Commit**

```bash
git add lib/integrations/one-c-odata-http.ts lib/sync/run-reference-sync.ts
git commit -m "fix: реальное имя справочника БДР в 1С, предупреждения о виде движения только для ДДС"
```

---

### Task 3: Миграция — `Article.isGoods` + перенос галочек

**Files:**
- Modify: `prisma/schema.prisma:288-309` (модель `Article`)
- Create: `prisma/migrations/<timestamp>_goods-flag-on-articles/migration.sql` (генерируется, затем дописывается)

- [ ] **Step 1: Поле в схеме**

В модель `Article` после строки `isActive    Boolean      @default(true)` добавить:

```prisma
  // Локальный признак finflow «оплата за товар» — НЕ из 1С, синк его
  // не читает и не пишет. По нему syncDispatch создаёт черновики платёжек.
  isGoods     Boolean      @default(false)
```

- [ ] **Step 2: Сгенерировать миграцию без применения**

```bash
npx prisma migrate dev --create-only --name goods-flag-on-articles
```

Ожидание: появился файл `prisma/migrations/<timestamp>_goods-flag-on-articles/migration.sql` с одной строкой `ALTER TABLE ... ADD COLUMN`.

- [ ] **Step 3: Дописать перенос галочек в SQL миграции**

Привести файл миграции к виду:

```sql
-- AlterTable
ALTER TABLE "articles" ADD COLUMN "isGoods" BOOLEAN NOT NULL DEFAULT false;

-- Перенос галочек «оплата за товар» из настроек в справочник (по названию).
-- Название, не найденное в справочнике, пропадает — осознанно (см. спеку).
UPDATE "articles" AS a
SET "isGoods" = true
FROM "cash_flow_item_settings" AS s
WHERE a."kind" = 'CASHFLOW'
  AND s."isGoods" = true
  AND a."name" = s."name";
```

(Точный текст первой строки — как сгенерировал Prisma; проверить имя колонки `"isGoods"` в сгенерированном SQL и использовать его же в UPDATE.)

- [ ] **Step 4: Применить**

```bash
npx prisma migrate dev
```

Ожидание: миграция применилась без ошибок, Prisma Client перегенерирован.

- [ ] **Step 5: Проверки**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
```

Ожидание: зелёное (старая таблица пока на месте, весь код компилируется).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: признак «оплата за товар» на статье справочника + перенос из настроек"
```

---

### Task 4: Переключатель «оплата за товар» на странице «Статьи ДДС»

TDD через e2e (юнит-тесты страниц запрещены правилами проекта): сначала тест, убеждаемся что падает, потом реализация.

**Files:**
- Test: `tests/e2e/reference.spec.ts`
- Create: `app/reference/cashflow-items/actions.ts`
- Create: `components/reference/goods-toggle.tsx`
- Modify: `components/reference/article-dictionary.tsx`
- Modify: `app/reference/cashflow-items/page.tsx`

- [ ] **Step 1: Написать e2e-тест**

В `tests/e2e/reference.spec.ts` после теста «ДДС: помеченная удалённой…» добавить:

```ts
test("ДДС: флаг «оплата за товар» переключается", async ({ page }) => {
  await page.goto("/reference/cashflow-items")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()

  // Нейтральная конечная статья: её флаг ни на что больше не влияет,
  // тест возвращает состояние как было (выкл).
  const row = page.getByRole("row", { name: /Кредиты и займы/ })
  await row.getByRole("button", { name: "Пометить «за товар»" }).click()
  await expect(row.getByText("оплата за товар")).toBeVisible()
  await row.getByRole("button", { name: "Снять флаг" }).click()
  await expect(row.getByText("оплата за товар")).toHaveCount(0)
})
```

- [ ] **Step 2: Убедиться, что тест падает**

```bash
npm run db:reset
npm run test:e2e -- tests/e2e/reference.spec.ts
```

Ожидание: новый тест FAIL (кнопки «Пометить «за товар»» нет), остальные — PASS.

- [ ] **Step 3: Server action**

Создать `app/reference/cashflow-items/actions.ts`:

```ts
// app/reference/cashflow-items/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAction } from "@/lib/auth/session"

export type FormState = { error: string | null }

// Переключает локальный признак «оплата за товар» у конечной статьи ДДС.
export async function toggleIsGoods(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_cash_flow_items")
  if (auth.error) return { error: auth.error }

  const id = String(formData.get("id") ?? "")
  const article = await prisma.article.findUnique({ where: { id } })
  if (!article || article.kind !== "CASHFLOW" || article.isGroup) {
    return { error: "Статья не найдена" }
  }

  await prisma.article.update({
    where: { id },
    data: { isGoods: !article.isGoods },
  })
  revalidatePath("/reference/cashflow-items")
  return { error: null }
}
```

- [ ] **Step 4: Клиентский переключатель**

Создать `components/reference/goods-toggle.tsx` (импорт action из `app/` — по образцу `components/reference/sync-status.tsx`):

```tsx
// Переключатель локального признака «оплата за товар» у статьи ДДС.
// Без права manage_cash_flow_items кнопка видна, но недоступна.
"use client"

import { useActionState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  toggleIsGoods,
  type FormState,
} from "@/app/reference/cashflow-items/actions"

const initialState: FormState = { error: null }

export function GoodsToggle({
  articleId,
  isGoods,
  canEdit,
}: {
  articleId: string
  isGoods: boolean
  canEdit: boolean
}) {
  const [state, formAction, isPending] = useActionState(
    toggleIsGoods,
    initialState
  )
  return (
    <div className="flex items-center gap-2">
      {isGoods ? (
        <Badge>оплата за товар</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <form action={formAction}>
        <input type="hidden" name="id" value={articleId} />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isPending || !canEdit}
        >
          {isGoods ? "Снять флаг" : "Пометить «за товар»"}
        </Button>
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  )
}
```

- [ ] **Step 5: Колонка в `ArticleDictionary`**

В `components/reference/article-dictionary.tsx`:

1. Добавить импорт:

```ts
import { GoodsToggle } from "./goods-toggle"
```

2. Добавить экспортируемый тип и проп (сигнатура компонента становится такой):

```tsx
// Данные для колонки «Оплата за товар» (только справочник ДДС).
export type ArticleGoods = {
  canEdit: boolean
  byId: Record<string, boolean>
}

export function ArticleDictionary({
  kind,
  articles,
  basePath,
  showArchived,
  goods,
}: {
  kind: Kind
  articles: Row[]
  basePath: string
  showArchived: boolean
  goods?: ArticleGoods
}) {
```

3. В `TableHeader` после `<TableHead>Тип</TableHead>` добавить:

```tsx
            {goods && <TableHead>Оплата за товар</TableHead>}
```

4. В теле строки после ячейки с `flow` добавить (флаг — только у конечных активных статей):

```tsx
                {goods && (
                  <TableCell>
                    {!r.isGroup && active && (
                      <GoodsToggle
                        articleId={r.id}
                        isGoods={goods.byId[r.id] ?? false}
                        canEdit={goods.canEdit}
                      />
                    )}
                  </TableCell>
                )}
```

Страница БДР (`app/reference/pnl-items/page.tsx`) проп не передаёт — для неё ничего не меняется.

- [ ] **Step 6: Страница «Статьи ДДС»**

Заменить содержимое `app/reference/cashflow-items/page.tsx`:

```tsx
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
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
  const user = await getCurrentUser()
  const canEdit = !!user && can(user.role as Role, "manage_cash_flow_items")
  const articles = await prisma.article.findMany({
    where: { kind: "CASHFLOW", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи ДДС</h1>
      <p className="text-sm text-muted-foreground">
        По статьям с признаком «оплата за товар» синк создаёт черновики
        отправки платёжек поставщикам (экран «Отправка платёжек»).
      </p>
      <SyncStatus />
      <ArticleDictionary
        kind="CASHFLOW"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
        goods={{
          canEdit,
          byId: Object.fromEntries(
            articles.filter((a) => !a.isGroup).map((a) => [a.id, a.isGoods])
          ),
        }}
      />
    </main>
  )
}
```

- [ ] **Step 7: Проверки + e2e**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
npm run test:e2e -- tests/e2e/reference.spec.ts
```

Ожидание: всё PASS, включая новый тест. Дополнительно глазами в браузере: обе ширины, консоль чистая (Base UI-ошибки видны только там).

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/reference.spec.ts app/reference/cashflow-items/ components/reference/
git commit -m "feat: флаг «оплата за товар» на странице справочника ДДС"
```

---

### Task 5: `syncDispatch` и seed читают справочник

**Files:**
- Modify: `lib/sync/sync-dispatch.ts`
- Modify: `prisma/seed.ts:146-162`
- Modify: `tests/e2e/dispatch.spec.ts` (удалить тест старой вкладки)

- [ ] **Step 1: `syncDispatch` — «товарные» статьи из справочника**

В `lib/sync/sync-dispatch.ts` удалить весь шаг 1 (комментарий «// 1. Справочник статей…» и цикл upsert, строки 10–24) и заменить чтение `cashFlowItemSetting` (строки 26–31). Начало функции становится таким:

```ts
export async function syncDispatch(): Promise<number> {
  // «Товарные» статьи — из справочника ДДС (источник истины — 1С),
  // флаг isGoods — локальный (страница «Статьи ДДС»). Сопоставление
  // с заявкой — по названию: в заявках из DWH статья приходит строкой,
  // UID статьи 1С в них нет.
  const goods = await prisma.article.findMany({
    where: { kind: "CASHFLOW", isGoods: true, isActive: true },
    select: { name: true },
  })
  const goodsNames = goods.map((g) => g.name)
  if (goodsNames.length === 0) return 0
```

Остальное тело функции (запрос `debit`, цикл создания черновиков) — без изменений. Обновить шапку-комментарий файла: убрать фразу «пополняет справочник статей ДДС и», она больше не верна.

- [ ] **Step 2: seed — флаг на статью справочника**

В `prisma/seed.ts` удалить блок (строки 146–152):

```ts
  // Статья «за товар» для демо и e2e: черновики отправок создаст синк.
  await prisma.cashFlowItemSetting.upsert({
    where: { name: "Оплата поставщикам за товар" },
    update: { isGoods: true },
    create: { name: "Оплата поставщикам за товар", isGoods: true },
  })
  console.log("Seed: статья «Оплата поставщикам за товар» помечена isGoods")
```

И добавить ПОСЛЕ `runReferenceSync(...)` / `console.log("Seed: справочники наполнены")` и ДО `runSync(...)` (порядок важен: флаг должен стоять к моменту `syncDispatch` внутри `runSync`):

```ts
  // Флаг «оплата за товар» — локальная настройка поверх справочника из 1С.
  // Ставим до синка заявок: syncDispatch внутри runSync создаст черновики.
  await prisma.article.updateMany({
    where: { kind: "CASHFLOW", name: "Оплата поставщикам за товар" },
    data: { isGoods: true },
  })
  console.log("Seed: статья «Оплата поставщикам за товар» помечена isGoods")
```

- [ ] **Step 3: Удалить e2e-тест старой вкладки**

В `tests/e2e/dispatch.spec.ts` удалить целиком первый тест `test("настройки статей: флаг переключается", ...)` (строки 9–18) — его роль теперь выполняет тест переключателя в `reference.spec.ts` (Task 4). Остальные тесты не трогать: черновик REQ-0001 создаётся из флага, который ставит seed.

- [ ] **Step 4: Проверки + e2e**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
npm run db:reset
npm run test:e2e
```

Ожидание: всё PASS. В `dispatch.spec.ts` черновик REQ-0001 создаётся — значит, цепочка «флаг на статье справочника → черновик» работает.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/sync-dispatch.ts prisma/seed.ts tests/e2e/dispatch.spec.ts
git commit -m "feat: черновики платёжек по флагу из справочника ДДС вместо отдельной таблицы"
```

---

### Task 6: Удалить вкладку «Статьи для отправки» и таблицу настроек

⚠️ **Деструктивная миграция**: удаляется таблица `cash_flow_item_settings` с данными. Согласовано в спеке; галочки уже перенесены в Task 3. Перед применением на общих контурах предупредить пользователя (пункт входит в описание изменений при /ship).

**Files:**
- Delete: `app/settings/cash-flow-items/page.tsx`, `items-table.tsx`, `actions.ts`
- Modify: `components/app-sidebar.tsx:58-63`
- Modify: `prisma/schema.prisma:437-443` (модель `CashFlowItemSetting`)
- Create: `prisma/migrations/<timestamp>_drop-cash-flow-item-settings/migration.sql` (генерируется)

- [ ] **Step 1: Удалить страницу настроек**

```bash
git rm -r app/settings/cash-flow-items
```

- [ ] **Step 2: Убрать пункт из сайдбара**

В `components/app-sidebar.tsx` из группы «Настройки» удалить объект:

```ts
      {
        title: "Статьи для отправки",
        href: "/settings/cash-flow-items",
        icon: "cash-flow-items",
        action: "manage_cash_flow_items",
      },
```

Иконку `"cash-flow-items"` в `components/nav-main.tsx` оставить — тип `IconName` используется конфигом, неиспользуемый ключ в карте не мешает; удалять можно, только если lint попросит.

- [ ] **Step 3: Удалить модель из схемы и мигрировать**

Из `prisma/schema.prisma` удалить целиком:

```prisma
model CashFlowItemSetting {
  id      String  @id @default(cuid())
  name    String  @unique
  isGoods Boolean @default(false) // «оплата за товар» → триггер отправки платёжки
  @@map("cash_flow_item_settings")
}
```

(вместе с комментарием над моделью, если есть). Затем:

```bash
npx prisma migrate dev --name drop-cash-flow-item-settings
```

Ожидание: сгенерирован и применён `DROP TABLE "cash_flow_item_settings"`.

- [ ] **Step 4: Проверить, что ссылок не осталось**

```bash
git grep -il "cashFlowItemSetting" -- ':!docs' ':!prisma/migrations'
```

Ожидание: пусто (упоминания только в docs и старых миграциях — это нормально).

- [ ] **Step 5: Проверки + e2e**

```bash
npm run format && npm run lint && npm run typecheck && npm run test
npm run db:reset
npm run test:e2e
```

Ожидание: всё PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: вкладка «Статьи для отправки» удалена — признак живёт в справочнике ДДС"
```

---

### Task 7: Финальный прогон и доставка в песочницу

- [ ] **Step 1: Полный прогон с нуля**

```bash
npm run db:reset
npm run format && npm run lint && npm run typecheck && npm run test
npm run test:e2e
```

Ожидание: всё зелёное.

- [ ] **Step 2: Ручная проверка в браузере**

Открыть dev-сервер: страница «Статьи ДДС» — колонка и переключатель на месте; страница «Статьи БДР» — колонки нет; `/settings/cash-flow-items` — 404; в сайдбаре пункта нет; консоль браузера чистая; мобильная ширина не разваливается.

- [ ] **Step 3: Доставка**

Командой `/ship` (проверки → merge в `develop` → контроль деплоя). В описании изменений явно упомянуть деструктивную миграцию (удаление `cash_flow_item_settings`).

---

### Task 8: Живой синк 1С — локальная проверка (вручную, вместе с пользователем)

Машина пользователя находится в офисной сети и видит 1С (`192.168.79.250`); учётка `ClaudeOR` в `.env` уже есть.

- [ ] **Step 1: Включить real-режим локально**

В локальном `.env` поменять `ONEC_ODATA_MODE="fixture"` → `ONEC_ODATA_MODE="real"`, перезапустить dev-сервер.

- [ ] **Step 2: Прогнать синк и сверить объёмы**

На странице «Статьи ДДС» нажать «Обновить из 1С». Ожидание:
- статей ДДС — порядка 203 (включая 43 папки и ветку «Не используются с 01.07.2023» — она придёт обычными записями, это нормально);
- «Статьи БДР» — 7 статей, колонка «Тип» пустая (вид движения в 1С не ведётся — штатно);
- «Банковские счета» — реальные счета организаций;
- предупреждений и ошибок синка нет (панель над справочником).

Фикстурные статьи (`fx-…`) при этом уйдут в архив — в 1С их нет. Это правильно.

- [ ] **Step 3: Вернуть локальное окружение**

`ONEC_ODATA_MODE` вернуть в `"fixture"`, затем `npm run db:reset` — локальная БД снова демо (e2e и повседневная работа зависят от фикстур).

---

### Task 9: Живой синк в песочнице (вне кода; возможна эскалация)

- [ ] **Step 1: Проверить доступность 1С с VPS**

С VPS (161.104.50.20) должен открываться `http://192.168.79.250:1281/...` — 1С стоит во внутренней сети офиса, скорее всего с внешнего VPS её НЕ видно. Проверка — на стороне разработчика (у специалистов нет SSH на VPS).

- [ ] **Step 2а: Если 1С доступна**

Минас меняет env песочницы: `ONEC_ODATA_MODE="real"` + `ONEC_ODATA_URL/USER/PASSWORD`; далее перезапуск и «Обновить из 1С» — сверка объёмов как в Task 8 Step 2.

- [ ] **Step 2б: Если 1С недоступна (ожидаемо)**

Написать Минасу: нужен туннель/проброс от VPS до 1С (или решение, что живой синк остаётся только локальным). До решения песочница живёт на `fixture` — функциональность флага и справочников от этого не страдает, отличается только состав данных.

---

## Порядок и зависимости

Task 1 → 2 → 3 → 4 → 5 → 6 → 7 строго по порядку (каждый коммит зелёный).
Task 8 — после Task 7, вместе с пользователем.
Task 9 — независим от Task 8, требует разработчика (Минаса).
