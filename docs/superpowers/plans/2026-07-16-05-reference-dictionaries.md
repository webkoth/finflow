# Раздел «Справочники» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить раздел `/reference` с тремя справочниками — Статьи ДДС, Статьи БДР (древовидные) и Банковские счета — с CRUD и мягким удалением (архив), на seed-данных.

**Architecture:** Единая модель `Article` (дискриминатор `kind` = CASHFLOW/PNL, дерево через `parentId`) обслуживает ДДС и БДР одним набором компонентов; `BankAccount` — отдельная плоская модель. Чистая логика (дерево, валидация) — в `lib/domain/reference/` с unit-тестами; мутации — server actions по образцу `app/transactions/`; общий UI статей — в `components/reference/`.

**Tech Stack:** Next.js (App Router) 16, TypeScript, Prisma + PostgreSQL, Tailwind + shadcn/ui (base-ui), Vitest, Playwright.

**Спека:** `docs/superpowers/specs/2026-07-16-reference-dictionaries-design.md`

**Ветка/доставка:** работаем в текущей `feature/reference-dictionaries`; после плана — доставка через `/ship`. Источник данных сейчас — finflow на seed; синк с 1С не входит (см. §8 спеки).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `prisma/schema.prisma` | Модели `Article`, `BankAccount`, enum'ы `ArticleKind`, `ArticleFlow` |
| `lib/domain/reference/articles.ts` (+ `.test.ts`) | Дерево статей и валидация (чисто, без I/O) |
| `lib/domain/reference/bank-account.ts` (+ `.test.ts`) | Валидаторы полей счёта (чисто) |
| `components/reference/article-labels.ts` | Русские подписи типов по `kind` |
| `components/reference/article-form.tsx` | Клиентская форма статьи (`useActionState`), общая ДДС/БДР |
| `components/reference/article-dictionary.tsx` | Дерево-таблица статей + встраивание формы |
| `app/reference/article-actions.ts` | Общие server-хелперы create/update/archive статьи (не route) |
| `app/reference/page.tsx` | Витрина раздела: 3 карточки |
| `app/reference/cashflow-items/{actions.ts,page.tsx}` | Статьи ДДС |
| `app/reference/pnl-items/{actions.ts,page.tsx}` | Статьи БДР |
| `app/reference/bank-accounts/{actions.ts,bank-account-form.tsx,page.tsx}` | Банковские счета |
| `app/page.tsx` | Ссылка на раздел с главной |
| `prisma/seed.ts` | Тестовое наполнение справочников |
| `tests/e2e/reference.spec.ts` | Смоук раздела |

---

## Task 1: Схема БД и миграция

**Files:**
- Modify: `prisma/schema.prisma` (добавить в конец)

- [ ] **Step 1: Добавить enum'ы и модели в конец `prisma/schema.prisma`**

```prisma
// --- Раздел «Справочники» (спека 2026-07-16-reference-dictionaries-design) ---

enum ArticleKind {
  CASHFLOW // статьи ДДС
  PNL // статьи БДР
}

enum ArticleFlow {
  INFLOW // приток (поступление / доход)
  OUTFLOW // отток (выбытие / расход)
}

// Статья ДДС или БДР. Дерево произвольной глубины через parentId.
// Группа (isGroup) — папка без типа; конечная статья имеет flow.
// Мягкое удаление: isActive=false (архив), физически не удаляем.
model Article {
  id          String       @id @default(cuid())
  kind        ArticleKind
  name        String
  code        String?
  flow        ArticleFlow?
  isGroup     Boolean      @default(false)
  description String?
  parentId    String?
  parent      Article?     @relation("ArticleTree", fields: [parentId], references: [id])
  children    Article[]    @relation("ArticleTree")
  isActive    Boolean      @default(true)
  createdAt   DateTime     @default(now()) @db.Timestamptz(3)

  @@index([kind, parentId])
  @@map("articles")
}

// Банковский счёт организации. Плоский справочник, мягкое удаление.
model BankAccount {
  id            String   @id @default(cuid())
  name          String
  accountNumber String
  bankName      String
  bankBic       String
  currency      String   @default("RUB")
  organization  String
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now()) @db.Timestamptz(3)

  @@map("bank_accounts")
}
```

- [ ] **Step 2: Проверить схему**

Run: `npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Создать и применить миграцию (генерирует клиент)**

Run: `npx prisma migrate dev --name reference-dictionaries`
Expected: создана папка `prisma/migrations/<timestamp>_reference_dictionaries/`, миграция применена, `✔ Generated Prisma Client`. Недеструктивно — только новые таблицы/enum'ы.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: схема справочников — Article (ДДС/БДР) и BankAccount"
```

---

## Task 2: Доменная логика статей (TDD)

**Files:**
- Create: `lib/domain/reference/articles.ts`
- Test: `lib/domain/reference/articles.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать `lib/domain/reference/articles.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  buildArticleTree,
  flattenArticleTree,
  validateArticleInput,
  type ArticleNode,
} from "./articles"

const n = (o: Partial<ArticleNode> & { id: string }): ArticleNode => ({
  id: o.id,
  name: o.name ?? o.id,
  code: o.code ?? null,
  flow: o.flow ?? null,
  isGroup: o.isGroup ?? false,
  parentId: o.parentId ?? null,
})

describe("buildArticleTree", () => {
  it("вкладывает детей в родителя и проставляет глубину", () => {
    const tree = buildArticleTree([n({ id: "g", isGroup: true }), n({ id: "c", parentId: "g" })])
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe("g")
    expect(tree[0].depth).toBe(0)
    expect(tree[0].children[0].id).toBe("c")
    expect(tree[0].children[0].depth).toBe(1)
  })

  it("сортирует соседей по коду (натурально), затем по имени", () => {
    const tree = buildArticleTree([
      n({ id: "b", code: "10", name: "Б" }),
      n({ id: "a", code: "2", name: "А" }),
    ])
    expect(tree.map((t) => t.id)).toEqual(["a", "b"])
  })

  it("узел без известного родителя становится корнем", () => {
    const tree = buildArticleTree([n({ id: "x", parentId: "missing" })])
    expect(tree.map((t) => t.id)).toEqual(["x"])
  })
})

describe("flattenArticleTree", () => {
  it("возвращает узлы в порядке обхода с глубиной", () => {
    const rows = flattenArticleTree(
      buildArticleTree([n({ id: "g", isGroup: true }), n({ id: "c", parentId: "g" })])
    )
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ["g", 0],
      ["c", 1],
    ])
  })
})

describe("validateArticleInput", () => {
  const list = [n({ id: "g", isGroup: true }), n({ id: "leaf", flow: "INFLOW" })]

  it("требует наименование", () => {
    expect(
      validateArticleInput({ name: " ", isGroup: false, flow: "INFLOW", parentId: null }, list)
    ).toMatch(/наименование/i)
  })
  it("требует тип у конечной статьи", () => {
    expect(
      validateArticleInput({ name: "X", isGroup: false, flow: null, parentId: null }, list)
    ).toMatch(/тип/i)
  })
  it("разрешает группу без типа", () => {
    expect(
      validateArticleInput({ name: "X", isGroup: true, flow: null, parentId: null }, list)
    ).toBeNull()
  })
  it("родителем может быть только группа", () => {
    expect(
      validateArticleInput({ name: "X", isGroup: false, flow: "INFLOW", parentId: "leaf" }, list)
    ).toMatch(/группа/i)
  })
  it("отклоняет несуществующего родителя", () => {
    expect(
      validateArticleInput({ name: "X", isGroup: false, flow: "INFLOW", parentId: "nope" }, list)
    ).toMatch(/не найден/i)
  })
  it("запрещает делать статью родителем самой себе", () => {
    expect(
      validateArticleInput({ name: "G", isGroup: true, flow: null, parentId: "g" }, list, "g")
    ).toMatch(/сам/i)
  })
  it("запрещает цикл (родитель — собственный потомок)", () => {
    const nested = [n({ id: "g", isGroup: true }), n({ id: "sub", isGroup: true, parentId: "g" })]
    expect(
      validateArticleInput({ name: "G", isGroup: true, flow: null, parentId: "sub" }, nested, "g")
    ).toMatch(/потомк|цикл/i)
  })
  it("возвращает null для корректной статьи", () => {
    expect(
      validateArticleInput({ name: "X", isGroup: false, flow: "OUTFLOW", parentId: "g" }, list)
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run lib/domain/reference/articles.test.ts`
Expected: FAIL — `Failed to resolve import "./articles"`.

- [ ] **Step 3: Реализовать `lib/domain/reference/articles.ts`**

```ts
// Чистая логика справочника статей: дерево и валидация. Без React и Prisma.

export type ArticleFlow = "INFLOW" | "OUTFLOW"

export type ArticleNode = {
  id: string
  name: string
  code: string | null
  flow: ArticleFlow | null
  isGroup: boolean
  parentId: string | null
}

export type ArticleTreeNode = ArticleNode & {
  depth: number
  children: ArticleTreeNode[]
}

export type ArticleInput = {
  name: string
  isGroup: boolean
  flow: ArticleFlow | null
  parentId: string | null
}

function compareNodes(a: ArticleNode, b: ArticleNode): number {
  if (a.code && b.code) {
    const r = a.code.localeCompare(b.code, "ru", { numeric: true })
    if (r !== 0) return r
  } else if (a.code && !b.code) {
    return -1
  } else if (!a.code && b.code) {
    return 1
  }
  return a.name.localeCompare(b.name, "ru")
}

export function buildArticleTree(items: ArticleNode[]): ArticleTreeNode[] {
  const byId = new Map<string, ArticleTreeNode>()
  for (const it of items) byId.set(it.id, { ...it, depth: 0, children: [] })

  const roots: ArticleTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (nodes: ArticleTreeNode[], depth: number) => {
    nodes.sort(compareNodes)
    for (const node of nodes) {
      node.depth = depth
      sortRec(node.children, depth + 1)
    }
  }
  sortRec(roots, 0)
  return roots
}

export function flattenArticleTree(roots: ArticleTreeNode[]): ArticleTreeNode[] {
  const out: ArticleTreeNode[] = []
  const walk = (nodes: ArticleTreeNode[]) => {
    for (const node of nodes) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(roots)
  return out
}

// Возвращает текст ошибки или null. allSameKind — все статьи того же kind
// (для проверки родителя и защиты от циклов). selfId — id редактируемой статьи.
export function validateArticleInput(
  input: ArticleInput,
  allSameKind: ArticleNode[],
  selfId?: string
): string | null {
  if (!input.name.trim()) return "Укажите наименование"
  if (!input.isGroup && !input.flow) return "Укажите тип статьи"

  if (input.parentId) {
    if (input.parentId === selfId) return "Статья не может быть родителем самой себе"
    const byId = new Map(allSameKind.map((a) => [a.id, a]))
    const parent = byId.get(input.parentId)
    if (!parent) return "Родитель не найден"
    if (!parent.isGroup) return "Родителем может быть только группа"

    if (selfId) {
      let cur: ArticleNode | undefined = parent
      while (cur) {
        if (cur.id === selfId) return "Нельзя переместить статью внутрь её потомка"
        cur = cur.parentId ? byId.get(cur.parentId) : undefined
      }
    }
  }
  return null
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run lib/domain/reference/articles.test.ts`
Expected: PASS (все тесты зелёные).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reference/articles.ts lib/domain/reference/articles.test.ts
git commit -m "feat: доменная логика статей — дерево и валидация"
```

---

## Task 3: Валидаторы банковского счёта (TDD)

**Files:**
- Create: `lib/domain/reference/bank-account.ts`
- Test: `lib/domain/reference/bank-account.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Создать `lib/domain/reference/bank-account.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { validateBankAccountInput, type BankAccountInput } from "./bank-account"

const base: BankAccountInput = {
  name: "Основной",
  accountNumber: "40702810900000001234",
  bankName: "Сбербанк",
  bankBic: "044525225",
  currency: "RUB",
  organization: "ООО Ромашка",
}

describe("validateBankAccountInput", () => {
  it("принимает корректный счёт", () => {
    expect(validateBankAccountInput(base)).toBeNull()
  })
  it("требует название", () => {
    expect(validateBankAccountInput({ ...base, name: " " })).toMatch(/назв/i)
  })
  it("требует ровно 20 цифр в номере счёта", () => {
    expect(validateBankAccountInput({ ...base, accountNumber: "123" })).toMatch(/20/)
  })
  it("требует ровно 9 цифр в БИК", () => {
    expect(validateBankAccountInput({ ...base, bankBic: "12345" })).toMatch(/БИК/)
  })
  it("требует банк", () => {
    expect(validateBankAccountInput({ ...base, bankName: "" })).toMatch(/банк/i)
  })
  it("требует организацию", () => {
    expect(validateBankAccountInput({ ...base, organization: "" })).toMatch(/организац/i)
  })
})
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npx vitest run lib/domain/reference/bank-account.test.ts`
Expected: FAIL — `Failed to resolve import "./bank-account"`.

- [ ] **Step 3: Реализовать `lib/domain/reference/bank-account.ts`**

```ts
// Чистые валидаторы банковского счёта. Без React и Prisma.

export type BankAccountInput = {
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
}

export function validateBankAccountInput(input: BankAccountInput): string | null {
  if (!input.name.trim()) return "Укажите название счёта"
  if (!/^\d{20}$/.test(input.accountNumber.trim())) return "Номер счёта — 20 цифр"
  if (!input.bankName.trim()) return "Укажите банк"
  if (!/^\d{9}$/.test(input.bankBic.trim())) return "БИК — 9 цифр"
  if (!input.organization.trim()) return "Укажите организацию-владельца"
  if (!input.currency.trim()) return "Укажите валюту"
  return null
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npx vitest run lib/domain/reference/bank-account.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/reference/bank-account.ts lib/domain/reference/bank-account.test.ts
git commit -m "feat: валидаторы банковского счёта (БИК, номер счёта)"
```

---

## Task 4: shadcn-примитивы select и checkbox

**Files:**
- Create (генерируются): `components/ui/select.tsx`, `components/ui/checkbox.tsx`

`badge` и `textarea` уже установлены — не трогаем.

- [ ] **Step 1: Добавить компоненты через shadcn CLI**

Run: `npx shadcn@latest add select checkbox`
Expected: созданы `components/ui/select.tsx` и `components/ui/checkbox.tsx`. Если CLI спросит про перезапись существующих — отвечать «нет» (перезаписывать badge/textarea/… нельзя).

- [ ] **Step 2: Проверить сборку типов**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add components/ui/select.tsx components/ui/checkbox.tsx
git commit -m "chore: shadcn-примитивы select и checkbox для форм справочников"
```

**Примечание для Task 6:** форма статьи управляет значениями `flow`/`parentId` через React-state и отправляет их скрытыми `<input>` (не полагаемся на form-интеграцию base-ui Select). Это гарантирует отправку значения независимо от версии сгенерированного компонента. Ожидаемый API `Select`: `Select, SelectTrigger, SelectValue, SelectContent, SelectItem`; `Checkbox` с `checked`/`onCheckedChange`. Если сгенерированный API отличается — использовать его в тех же ролях.

---

## Task 5: Общие server-хелперы статей

**Files:**
- Create: `app/reference/article-actions.ts`

Это НЕ route и НЕ `"use server"`-модуль — обычная библиотека серверных хелперов, которые вызовут тонкие обёртки-actions из Task 6.

- [ ] **Step 1: Создать `app/reference/article-actions.ts`**

```ts
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { validateArticleInput, type ArticleNode } from "@/lib/domain/reference/articles"

export type ArticleFormState = { error: string | null }
export type ArticleKind = "CASHFLOW" | "PNL"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function parseArticleForm(fd: FormData) {
  const isGroup = str(fd, "isGroup") === "1"
  const flowRaw = str(fd, "flow")
  const flow = flowRaw === "INFLOW" || flowRaw === "OUTFLOW" ? flowRaw : null
  const parentRaw = str(fd, "parentId")
  return {
    name: str(fd, "name"),
    code: str(fd, "code") || null,
    flow: isGroup ? null : flow,
    isGroup,
    description: str(fd, "description") || null,
    parentId: parentRaw && parentRaw !== "__none__" ? parentRaw : null,
  }
}

async function loadNodes(kind: ArticleKind): Promise<ArticleNode[]> {
  const items = await prisma.article.findMany({ where: { kind } })
  return items.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    flow: a.flow,
    isGroup: a.isGroup,
    parentId: a.parentId,
  }))
}

export async function createArticleAction(
  kind: ArticleKind,
  path: string,
  _prev: ArticleFormState,
  fd: FormData
): Promise<ArticleFormState> {
  const input = parseArticleForm(fd)
  const err = validateArticleInput(input, await loadNodes(kind))
  if (err) return { error: err }
  await prisma.article.create({
    data: {
      kind,
      name: input.name.trim(),
      code: input.code,
      flow: input.flow,
      isGroup: input.isGroup,
      description: input.description,
      parentId: input.parentId,
    },
  })
  revalidatePath(path)
  return { error: null }
}

export async function updateArticleAction(
  kind: ArticleKind,
  path: string,
  _prev: ArticleFormState,
  fd: FormData
): Promise<ArticleFormState> {
  const id = str(fd, "id")
  if (!id) return { error: "Не указан идентификатор статьи" }
  const input = parseArticleForm(fd)
  const err = validateArticleInput(input, await loadNodes(kind), id)
  if (err) return { error: err }
  await prisma.article.update({
    where: { id },
    data: {
      name: input.name.trim(),
      code: input.code,
      flow: input.flow,
      isGroup: input.isGroup,
      description: input.description,
      parentId: input.parentId,
    },
  })
  revalidatePath(path)
  return { error: null }
}

export async function setArticleActiveAction(path: string, fd: FormData): Promise<void> {
  const id = str(fd, "id")
  const active = str(fd, "active") === "1"
  if (!id) return
  await prisma.article.update({ where: { id }, data: { isActive: active } })
  revalidatePath(path)
}
```

- [ ] **Step 2: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add app/reference/article-actions.ts
git commit -m "feat: server-хелперы CRUD статей справочника"
```

---

## Task 6: Общий UI статей — подписи, форма, дерево-таблица

**Files:**
- Create: `components/reference/article-labels.ts`
- Create: `components/reference/article-form.tsx`
- Create: `components/reference/article-dictionary.tsx`

- [ ] **Step 1: Создать `components/reference/article-labels.ts`**

```ts
// Русские подписи типа статьи по виду справочника.
export const FLOW_LABELS = {
  CASHFLOW: { INFLOW: "Поступление", OUTFLOW: "Выбытие" },
  PNL: { INFLOW: "Доход", OUTFLOW: "Расход" },
} as const
```

- [ ] **Step 2: Создать `components/reference/article-form.tsx`**

```tsx
"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FLOW_LABELS } from "./article-labels"

type Kind = "CASHFLOW" | "PNL"
type FormState = { error: string | null }
export type GroupOption = { id: string; name: string; depth: number }
export type EditingArticle = {
  id: string
  name: string
  code: string | null
  flow: "INFLOW" | "OUTFLOW" | null
  isGroup: boolean
  description: string | null
  parentId: string | null
}

const initial: FormState = { error: null }

export function ArticleForm({
  kind,
  action,
  groups,
  editing,
  cancelHref,
}: {
  kind: Kind
  action: (prev: FormState, fd: FormData) => Promise<FormState>
  groups: GroupOption[]
  editing?: EditingArticle
  cancelHref: string
}) {
  const [state, formAction, isPending] = useActionState(action, initial)
  const [isGroup, setIsGroup] = useState(editing?.isGroup ?? false)
  const [flow, setFlow] = useState<string>(editing?.flow ?? "")
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? "__none__")
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)
  const labels = FLOW_LABELS[kind]

  // Сброс формы после успешного создания (в режиме правки не сбрасываем).
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null && !editing) {
      setIsGroup(false)
      setFlow("")
      setParentId("__none__")
      formRef.current?.reset()
    }
    wasPending.current = isPending
  }, [isPending, state, editing])

  return (
    <form
      ref={formRef}
      action={formAction}
      key={editing?.id ?? "new"}
      className="space-y-4 rounded-lg border p-4"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <input type="hidden" name="isGroup" value={isGroup ? "1" : ""} />
      <input type="hidden" name="flow" value={isGroup ? "" : flow} />
      <input type="hidden" name="parentId" value={parentId} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Наименование</Label>
          <Input id="name" name="name" defaultValue={editing?.name} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="code">Код</Label>
          <Input id="code" name="code" defaultValue={editing?.code ?? ""} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="isGroup"
            checked={isGroup}
            onCheckedChange={(v) => setIsGroup(v === true)}
          />
          <Label htmlFor="isGroup">Это группа</Label>
        </div>
      </div>

      {!isGroup && (
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="flow">Тип</Label>
          <Select value={flow} onValueChange={setFlow}>
            <SelectTrigger id="flow">
              <SelectValue placeholder="Выберите тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INFLOW">{labels.INFLOW}</SelectItem>
              <SelectItem value="OUTFLOW">{labels.OUTFLOW}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="parentId">Родитель</Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger id="parentId">
            <SelectValue placeholder="— нет —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— нет —</SelectItem>
            {groups
              .filter((g) => g.id !== editing?.id)
              .map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {" ".repeat(g.depth * 2) + g.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Описание</Label>
        <Textarea id="description" name="description" defaultValue={editing?.description ?? ""} />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохраняю…" : editing ? "Сохранить" : "Добавить"}
        </Button>
        {editing && (
          <Button type="button" variant="outline" asChild>
            <a href={cancelHref}>Отмена</a>
          </Button>
        )}
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Создать `components/reference/article-dictionary.tsx`**

```tsx
import Link from "next/link"
import {
  buildArticleTree,
  flattenArticleTree,
  type ArticleNode,
} from "@/lib/domain/reference/articles"
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
import { cn } from "@/lib/utils"
import { ArticleForm, type EditingArticle, type GroupOption } from "./article-form"
import { FLOW_LABELS } from "./article-labels"

type Kind = "CASHFLOW" | "PNL"
type FormState = { error: string | null }
type Row = ArticleNode & { isActive: boolean }

// Классы отступа по глубине (статические — Tailwind их видит; без инлайн-стилей).
const PAD = ["pl-0", "pl-4", "pl-8", "pl-12", "pl-16", "pl-20"]

export function ArticleDictionary({
  kind,
  articles,
  basePath,
  showArchived,
  editing,
  createAction,
  updateAction,
  setActiveAction,
}: {
  kind: Kind
  articles: Row[]
  basePath: string
  showArchived: boolean
  editing?: EditingArticle
  createAction: (p: FormState, fd: FormData) => Promise<FormState>
  updateAction: (p: FormState, fd: FormData) => Promise<FormState>
  setActiveAction: (fd: FormData) => Promise<void>
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
  const groups: GroupOption[] = flattenArticleTree(
    buildArticleTree(nodes.filter((node) => node.isGroup))
  ).map((g) => ({ id: g.id, name: g.name, depth: g.depth }))
  const labels = FLOW_LABELS[kind]

  return (
    <div className="space-y-6">
      <ArticleForm
        kind={kind}
        action={editing ? updateAction : createAction}
        groups={groups}
        editing={editing}
        cancelHref={basePath + (showArchived ? "?archived=1" : "")}
      />

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
            <TableHead className="text-right">Действия</TableHead>
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
                  {r.flow ? <Badge variant="secondary">{labels[r.flow]}</Badge> : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link
                        href={`${basePath}?edit=${r.id}${showArchived ? "&archived=1" : ""}`}
                      >
                        Изменить
                      </Link>
                    </Button>
                    <form action={setActiveAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="active" value={active ? "" : "1"} />
                      <Button variant="ghost" size="sm" type="submit">
                        {active ? "В архив" : "Вернуть"}
                      </Button>
                    </form>
                  </div>
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

- [ ] **Step 4: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add components/reference
git commit -m "feat: общий UI статей — форма и дерево-таблица"
```

---

## Task 7: Маршруты статей ДДС и БДР

**Files:**
- Create: `app/reference/cashflow-items/actions.ts`
- Create: `app/reference/cashflow-items/page.tsx`
- Create: `app/reference/pnl-items/actions.ts`
- Create: `app/reference/pnl-items/page.tsx`

- [ ] **Step 1: Создать `app/reference/cashflow-items/actions.ts`**

```ts
"use server"

import {
  createArticleAction,
  setArticleActiveAction,
  updateArticleAction,
  type ArticleFormState,
} from "../article-actions"

const PATH = "/reference/cashflow-items"

export async function createArticle(prev: ArticleFormState, fd: FormData) {
  return createArticleAction("CASHFLOW", PATH, prev, fd)
}
export async function updateArticle(prev: ArticleFormState, fd: FormData) {
  return updateArticleAction("CASHFLOW", PATH, prev, fd)
}
export async function setArticleActive(fd: FormData) {
  return setArticleActiveAction(PATH, fd)
}
```

- [ ] **Step 2: Создать `app/reference/cashflow-items/page.tsx`**

```tsx
import { prisma } from "@/lib/db"
import { ArticleDictionary } from "@/components/reference/article-dictionary"
import { createArticle, setArticleActive, updateArticle } from "./actions"

export const dynamic = "force-dynamic"
const BASE = "/reference/cashflow-items"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; edit?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const articles = await prisma.article.findMany({
    where: { kind: "CASHFLOW", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  let editing = undefined as (typeof articles)[number] | undefined
  if (sp.edit) {
    editing =
      articles.find((a) => a.id === sp.edit) ??
      (await prisma.article.findUnique({ where: { id: sp.edit } })) ??
      undefined
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи ДДС</h1>
      <ArticleDictionary
        kind="CASHFLOW"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
        editing={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                code: editing.code,
                flow: editing.flow,
                isGroup: editing.isGroup,
                description: editing.description,
                parentId: editing.parentId,
              }
            : undefined
        }
        createAction={createArticle}
        updateAction={updateArticle}
        setActiveAction={setArticleActive}
      />
    </main>
  )
}
```

- [ ] **Step 3: Создать `app/reference/pnl-items/actions.ts`**

```ts
"use server"

import {
  createArticleAction,
  setArticleActiveAction,
  updateArticleAction,
  type ArticleFormState,
} from "../article-actions"

const PATH = "/reference/pnl-items"

export async function createArticle(prev: ArticleFormState, fd: FormData) {
  return createArticleAction("PNL", PATH, prev, fd)
}
export async function updateArticle(prev: ArticleFormState, fd: FormData) {
  return updateArticleAction("PNL", PATH, prev, fd)
}
export async function setArticleActive(fd: FormData) {
  return setArticleActiveAction(PATH, fd)
}
```

- [ ] **Step 4: Создать `app/reference/pnl-items/page.tsx`**

```tsx
import { prisma } from "@/lib/db"
import { ArticleDictionary } from "@/components/reference/article-dictionary"
import { createArticle, setArticleActive, updateArticle } from "./actions"

export const dynamic = "force-dynamic"
const BASE = "/reference/pnl-items"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; edit?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const articles = await prisma.article.findMany({
    where: { kind: "PNL", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  let editing = undefined as (typeof articles)[number] | undefined
  if (sp.edit) {
    editing =
      articles.find((a) => a.id === sp.edit) ??
      (await prisma.article.findUnique({ where: { id: sp.edit } })) ??
      undefined
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи БДР</h1>
      <ArticleDictionary
        kind="PNL"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
        editing={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                code: editing.code,
                flow: editing.flow,
                isGroup: editing.isGroup,
                description: editing.description,
                parentId: editing.parentId,
              }
            : undefined
        }
        createAction={createArticle}
        updateAction={updateArticle}
        setActiveAction={setArticleActive}
      />
    </main>
  )
}
```

- [ ] **Step 5: Проверить типы и прокликать в браузере**

Run: `npm run typecheck`
Expected: без ошибок.

Затем поднять preview (`preview_start` c `name` из `.claude/launch.json`, либо `npm run dev`), открыть `/reference/cashflow-items`, создать группу и статью, убедиться что дерево отрисовалось и ошибок в консоли нет.

- [ ] **Step 6: Commit**

```bash
git add app/reference/cashflow-items app/reference/pnl-items
git commit -m "feat: маршруты справочников статей ДДС и БДР"
```

---

## Task 8: Маршрут банковских счетов

**Files:**
- Create: `app/reference/bank-accounts/actions.ts`
- Create: `app/reference/bank-accounts/bank-account-form.tsx`
- Create: `app/reference/bank-accounts/page.tsx`

- [ ] **Step 1: Создать `app/reference/bank-accounts/actions.ts`**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { validateBankAccountInput } from "@/lib/domain/reference/bank-account"

const PATH = "/reference/bank-accounts"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function parse(fd: FormData) {
  return {
    name: str(fd, "name"),
    accountNumber: str(fd, "accountNumber"),
    bankName: str(fd, "bankName"),
    bankBic: str(fd, "bankBic"),
    currency: str(fd, "currency") || "RUB",
    organization: str(fd, "organization"),
  }
}

export async function createBankAccount(
  _prev: { error: string | null },
  fd: FormData
): Promise<{ error: string | null }> {
  const input = parse(fd)
  const err = validateBankAccountInput(input)
  if (err) return { error: err }
  await prisma.bankAccount.create({ data: input })
  revalidatePath(PATH)
  return { error: null }
}

export async function updateBankAccount(
  _prev: { error: string | null },
  fd: FormData
): Promise<{ error: string | null }> {
  const id = str(fd, "id")
  if (!id) return { error: "Не указан идентификатор счёта" }
  const input = parse(fd)
  const err = validateBankAccountInput(input)
  if (err) return { error: err }
  await prisma.bankAccount.update({ where: { id }, data: input })
  revalidatePath(PATH)
  return { error: null }
}

export async function setBankAccountActive(fd: FormData): Promise<void> {
  const id = str(fd, "id")
  const active = str(fd, "active") === "1"
  if (!id) return
  await prisma.bankAccount.update({ where: { id }, data: { isActive: active } })
  revalidatePath(PATH)
}
```

- [ ] **Step 2: Создать `app/reference/bank-accounts/bank-account-form.tsx`**

```tsx
"use client"

import { useActionState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBankAccount, updateBankAccount } from "./actions"

type FormState = { error: string | null }
export type EditingBankAccount = {
  id: string
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
}

const initial: FormState = { error: null }

export function BankAccountForm({
  editing,
  cancelHref,
}: {
  editing?: EditingBankAccount
  cancelHref: string
}) {
  const [state, formAction, isPending] = useActionState(
    editing ? updateBankAccount : createBankAccount,
    initial
  )
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null && !editing) {
      formRef.current?.reset()
    }
    wasPending.current = isPending
  }, [isPending, state, editing])

  return (
    <form
      ref={formRef}
      action={formAction}
      key={editing?.id ?? "new"}
      className="space-y-4 rounded-lg border p-4"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Название счёта</Label>
          <Input id="name" name="name" defaultValue={editing?.name} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="accountNumber">Номер счёта</Label>
          <Input
            id="accountNumber"
            name="accountNumber"
            defaultValue={editing?.accountNumber}
            inputMode="numeric"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bankName">Банк</Label>
          <Input id="bankName" name="bankName" defaultValue={editing?.bankName} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bankBic">БИК</Label>
          <Input
            id="bankBic"
            name="bankBic"
            defaultValue={editing?.bankBic}
            inputMode="numeric"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="currency">Валюта</Label>
          <Input id="currency" name="currency" defaultValue={editing?.currency ?? "RUB"} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="organization">Организация</Label>
          <Input
            id="organization"
            name="organization"
            defaultValue={editing?.organization}
            required
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохраняю…" : editing ? "Сохранить" : "Добавить"}
        </Button>
        {editing && (
          <Button type="button" variant="outline" asChild>
            <a href={cancelHref}>Отмена</a>
          </Button>
        )}
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Создать `app/reference/bank-accounts/page.tsx`**

```tsx
import Link from "next/link"
import { prisma } from "@/lib/db"
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
import { BankAccountForm } from "./bank-account-form"
import { setBankAccountActive } from "./actions"

export const dynamic = "force-dynamic"
const BASE = "/reference/bank-accounts"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; edit?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const accounts = await prisma.bankAccount.findMany({
    where: showArchived ? {} : { isActive: true },
    orderBy: { createdAt: "asc" },
  })

  let editing = undefined as (typeof accounts)[number] | undefined
  if (sp.edit) {
    editing =
      accounts.find((a) => a.id === sp.edit) ??
      (await prisma.bankAccount.findUnique({ where: { id: sp.edit } })) ??
      undefined
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Банковские счета</h1>

      <BankAccountForm
        editing={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                accountNumber: editing.accountNumber,
                bankName: editing.bankName,
                bankBic: editing.bankBic,
                currency: editing.currency,
                organization: editing.organization,
              }
            : undefined
        }
        cancelHref={BASE + (showArchived ? "?archived=1" : "")}
      />

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
            <TableHead className="text-right">Действия</TableHead>
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
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`${BASE}?edit=${a.id}${showArchived ? "&archived=1" : ""}`}>
                      Изменить
                    </Link>
                  </Button>
                  <form action={setBankAccountActive}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="active" value={a.isActive ? "" : "1"} />
                    <Button variant="ghost" size="sm" type="submit">
                      {a.isActive ? "В архив" : "Вернуть"}
                    </Button>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
```

- [ ] **Step 4: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add app/reference/bank-accounts
git commit -m "feat: маршрут справочника банковских счетов"
```

---

## Task 9: Витрина раздела и ссылка с главной

**Files:**
- Create: `app/reference/page.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Создать `app/reference/page.tsx`**

```tsx
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const items = [
  { href: "/reference/cashflow-items", title: "Статьи ДДС", desc: "Движение денежных средств" },
  { href: "/reference/pnl-items", title: "Статьи БДР", desc: "Бюджет доходов и расходов" },
  { href: "/reference/bank-accounts", title: "Банковские счета", desc: "Счета организаций" },
]

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Справочники</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{i.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{i.desc}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Добавить ссылку на раздел в `app/page.tsx`**

Найти блок со ссылкой на транзакции:

```tsx
        <div>
          <Link
            href="/transactions"
            className="text-primary underline underline-offset-4"
          >
            Транзакции
          </Link>
        </div>
```

Сразу после этого `</div>` (внутри внешнего контейнера, перед его закрытием) добавить:

```tsx
        <div>
          <Link
            href="/reference"
            className="text-primary underline underline-offset-4"
          >
            Справочники
          </Link>
        </div>
```

- [ ] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add app/reference/page.tsx app/page.tsx
git commit -m "feat: витрина раздела «Справочники» и ссылка с главной"
```

---

## Task 10: Seed тестовыми данными

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Дополнить `prisma/seed.ts`**

В функции `main()`, сразу после блока создания транзакций и перед комментарием `// Демо-заявки — через реальный конвейер синка ...`, вставить:

```ts
  // --- Справочники ---
  await prisma.article.deleteMany()
  await prisma.bankAccount.deleteMany()

  const opGroup = await prisma.article.create({
    data: { kind: "CASHFLOW", name: "Операционная деятельность", code: "1", isGroup: true },
  })
  await prisma.article.createMany({
    data: [
      { kind: "CASHFLOW", name: "Поступления от покупателей", code: "1.1", flow: "INFLOW", parentId: opGroup.id },
      { kind: "CASHFLOW", name: "Оплата поставщикам", code: "1.2", flow: "OUTFLOW", parentId: opGroup.id },
    ],
  })
  const finGroup = await prisma.article.create({
    data: { kind: "CASHFLOW", name: "Финансовая деятельность", code: "2", isGroup: true },
  })
  await prisma.article.create({
    data: { kind: "CASHFLOW", name: "Кредиты и займы", code: "2.1", flow: "INFLOW", parentId: finGroup.id },
  })

  const incGroup = await prisma.article.create({
    data: { kind: "PNL", name: "Доходы", code: "1", isGroup: true },
  })
  await prisma.article.create({
    data: { kind: "PNL", name: "Выручка", code: "1.1", flow: "INFLOW", parentId: incGroup.id },
  })
  const expGroup = await prisma.article.create({
    data: { kind: "PNL", name: "Расходы", code: "2", isGroup: true },
  })
  await prisma.article.createMany({
    data: [
      { kind: "PNL", name: "Зарплата", code: "2.1", flow: "OUTFLOW", parentId: expGroup.id },
      { kind: "PNL", name: "Аренда", code: "2.2", flow: "OUTFLOW", parentId: expGroup.id },
    ],
  })

  await prisma.bankAccount.createMany({
    data: [
      { name: "Расчётный (Сбербанк)", accountNumber: "40702810900000001234", bankName: "ПАО Сбербанк", bankBic: "044525225", currency: "RUB", organization: "ООО «Ромашка»" },
      { name: "Расчётный (Т-Банк)", accountNumber: "40702810400000005678", bankName: "АО «Т-Банк»", bankBic: "044525974", currency: "RUB", organization: "ООО «Василёк»" },
    ],
  })
  console.log("Seed: справочники наполнены")
```

- [ ] **Step 2: Запустить seed**

Run: `npx prisma db seed`
Expected: в выводе строка `Seed: справочники наполнены` и синк заявок отрабатывает как прежде (без ошибок).

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: seed справочников тестовыми данными"
```

---

## Task 11: E2e-смоук раздела

**Files:**
- Create: `tests/e2e/reference.spec.ts`

- [ ] **Step 1: Создать `tests/e2e/reference.spec.ts`**

```ts
import { expect, test } from "@playwright/test"

test("витрина справочников открывается", async ({ page }) => {
  await page.goto("/reference")
  await expect(page.getByRole("heading", { name: "Справочники" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Статьи ДДС" })).toBeVisible()
})

test("ДДС: группа и вложенная статья появляются деревом", async ({ page }) => {
  await page.goto("/reference/cashflow-items")

  const group = `Группа-${Date.now()}`
  await page.getByLabel("Наименование").fill(group)
  await page.getByLabel("Это группа").check()
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByRole("cell", { name: group })).toBeVisible()

  const item = `Статья-${Date.now()}`
  await page.getByLabel("Наименование").fill(item)
  await page.getByLabel("Тип").click()
  await page.getByRole("option", { name: "Выбытие" }).click()
  await page.getByLabel("Родитель").click()
  await page.getByRole("option", { name: group }).click()
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByRole("cell", { name: item })).toBeVisible()
})

test("ДДС: конечная статья без типа показывает ошибку", async ({ page }) => {
  await page.goto("/reference/cashflow-items")
  await page.getByLabel("Наименование").fill(`БезТипа-${Date.now()}`)
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByText("Укажите тип статьи")).toBeVisible()
})

test("банковский счёт создаётся и виден в списке", async ({ page }) => {
  await page.goto("/reference/bank-accounts")
  const name = `Счёт-${Date.now()}`
  await page.getByLabel("Название счёта").fill(name)
  await page.getByLabel("Номер счёта").fill("40702810900000009999")
  await page.getByLabel("Банк").fill("ПАО Сбербанк")
  await page.getByLabel("БИК").fill("044525225")
  await page.getByLabel("Валюта").fill("RUB")
  await page.getByLabel("Организация").fill("ООО Тест")
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByRole("cell", { name })).toBeVisible()
})

test("невалидный БИК показывает ошибку", async ({ page }) => {
  await page.goto("/reference/bank-accounts")
  await page.getByLabel("Название счёта").fill(`Счёт-${Date.now()}`)
  await page.getByLabel("Номер счёта").fill("40702810900000009999")
  await page.getByLabel("Банк").fill("Банк")
  await page.getByLabel("БИК").fill("123")
  await page.getByLabel("Валюта").fill("RUB")
  await page.getByLabel("Организация").fill("ООО Тест")
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByText(/БИК/)).toBeVisible()
})
```

- [ ] **Step 2: Запустить смоук**

Run: `npm run test:e2e -- reference.spec.ts`
Expected: 5 тестов PASS.

Если `getByLabel("Тип")`/`getByLabel("Родитель")` не находит триггер (зависит от того, как сгенерированный base-ui `SelectTrigger` пробрасывает `id`/`aria-labelledby`): открыть селект по видимому плейсхолдеру — `page.getByText("Выберите тип").click()` / `page.getByText("— нет —").first().click()` — затем кликнуть опцию по имени. Скорректировать селекторы под фактический DOM.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/reference.spec.ts
git commit -m "test: e2e-смоук раздела «Справочники»"
```

---

## Task 12: Полные проверки и доставка

- [ ] **Step 1: Прогнать полный набор проверок перед коммитом**

Run: `npm run format && npm run lint && npm run typecheck && npm run test`
Expected: format без изменений (или закоммитить их), lint без ошибок, typecheck чист, все unit-тесты зелёные.

- [ ] **Step 2: Прогнать весь e2e**

Run: `npm run test:e2e`
Expected: все спеки (включая существующие transactions/requests) PASS.

- [ ] **Step 3: Если формат что-то поправил — commit**

```bash
git add -A
git commit -m "chore: форматирование раздела справочников"
```

- [ ] **Step 4: Доставка в dev**

Доставить изменения командой `/ship` (проверки → merge в `develop` → контроль автодеплоя). Не пушить в `main` — только через PR `develop → main` (`/request-prod`, разработчик).

---

## Self-Review (выполнено при написании плана)

**Покрытие спеки:**
- §3 маршруты/раскладка → Task 1, 5–9. §4 модель → Task 1. §5 домен → Task 2, 3. §6 мутации → Task 5, 7, 8. §7 UI (select/checkbox/textarea/badge) → Task 4, 6, 8, 9. §9 seed → Task 10. §10 тесты → Task 2, 3, 11. §2 «архив» → мягкое удаление в Task 5/8, кнопки «В архив/Вернуть» в Task 6/8. §8 (синк 1С) осознанно не входит.
- «Изменить» (update) из §2/§6 → режим правки через `?edit=<id>` в Task 6–8.

**Плейсхолдеры:** отсутствуют — во всех шагах реальный код/команды.

**Согласованность типов:** `ArticleNode`/`ArticleFlow`/`ArticleInput` (Task 2) используются в `article-actions.ts` (Task 5) и компонентах (Task 6). `FormState = { error: string | null }` совпадает с возвращаемым типом server actions. Имена server actions (`createArticle`/`updateArticle`/`setArticleActive`, `createBankAccount`/`updateBankAccount`/`setBankAccountActive`) едины между actions.ts и страницами. Значения `flow` (`INFLOW`/`OUTFLOW`) и `kind` (`CASHFLOW`/`PNL`) совпадают со схемой Prisma (Task 1).

**Известное допущение:** отправка значений `flow`/`parentId` идёт через управляемый state + скрытые `<input>` — не зависит от form-интеграции base-ui `Select`. Для `Checkbox` используется `checked`/`onCheckedChange` (управляемо). Если сгенерированные компоненты имеют иной API — применить его в тех же ролях (примечание в Task 4).
