import Link from "next/link"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { toRub } from "@/lib/domain/verdict"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ExecutionStatus, Prisma } from "@prisma/client"
import {
  RequestsTable,
  type AccountRow,
  type FundCardRow,
  type RequestRow,
} from "./requests-table"
import { STATUS_CLASSES, STATUS_LABELS, VERDICT_DOT_CLASSES } from "./status"
import { refreshData } from "./actions"
import { computeVerdicts } from "@/lib/verdicts"
import type { VerdictLevel } from "@/lib/domain/verdict"

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

// Битые параметры URL (сохранённые ссылки) молча игнорируем, а не роняем страницу.
function validDate(value: string): string {
  // Строго YYYY-MM-DD: where-условия композируют `${value}T00:00:00+03:00`,
  // и парсабельная, но не-ISO строка дала бы там Invalid Date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  return Number.isNaN(new Date(value).getTime()) ? "" : value
}

// Обёрнуто в helper: react-hooks/purity не считает импуры внутри обычной
// функции (не компонента/хука) нарушением чистоты рендера.
function in7DaysFromNow(): Date {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
}

function buildQuery(sp: Search, overrides: Record<string, string>): string {
  const q = new URLSearchParams()
  for (const key of [
    "status",
    "org",
    "fund",
    "from",
    "to",
    "partner",
    "problems",
  ]) {
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
  const rawStatus = param(sp, "status")
  const status = Object.hasOwn(STATUS_LABELS, rawStatus) ? rawStatus : ""
  const org = param(sp, "org")
  const fund = param(sp, "fund")
  const from = validDate(param(sp, "from"))
  const to = validDate(param(sp, "to"))
  const partner = param(sp, "partner")
  const problems = param(sp, "problems") === "1"

  const where: Prisma.PaymentRequestWhereInput = {
    isDeletedIn1c: false,
    ...(status ? { executionStatus: status as ExecutionStatus } : {}),
    ...(org ? { orgName: org } : {}),
    ...(fund ? { fund } : {}),
    ...(partner ? { partnerName: partner } : {}),
    ...(from || to
      ? {
          // Обе границы диапазона — по московской полуночи.
          payDate: {
            ...(from ? { gte: new Date(`${from}T00:00:00+03:00`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59+03:00`) } : {}),
          },
        }
      : {}),
  }

  const [
    requests,
    lastSync,
    orgs,
    funds,
    partners,
    accountBalances,
    fundSnapshots,
  ] = await Promise.all([
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
    prisma.paymentRequest.findMany({
      where: { isDeletedIn1c: false, partnerName: { not: null } },
      distinct: ["partnerName"],
      select: { partnerName: true },
      orderBy: { partnerName: "asc" },
    }),
    prisma.accountBalance.findMany({
      orderBy: [{ orgName: "asc" }, { accountName: "asc" }],
    }),
    prisma.fundSnapshot.findMany({ orderBy: { name: "asc" } }),
  ])

  // Вердикт нужен только заявкам на согласовании (решение ещё не принято).
  const onApproval = requests.filter((r) => r.approvalStatus === "on_approval")
  const { verdicts, rates } = await computeVerdicts(onApproval)

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
      verdictLevel: (verdict?.level ?? null) as Exclude<
        VerdictLevel,
        "block"
      > | null,
      verdictTitle: verdict?.title ?? "",
      verdictDotClass: verdict
        ? VERDICT_DOT_CLASSES[verdict.level as Exclude<VerdictLevel, "block">]
        : "",
      // Массово — только 🟢 (ТЗ §6.4): чекбокс есть только у зелёных.
      canSelect: r.approvalStatus === "on_approval" && verdict?.level === "ok",
      debitAccountUid: r.debitAccountUid,
      currency: r.currency,
      amountMinorNum: Number(r.amountMinor),
      amountRubNum: toRub(r.amountMinor, r.currency, rates) ?? 0,
    }
  })

  const fmtRub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`
  const in7Days = in7DaysFromNow()

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

  const metrics: Array<{ label: string; value: string; href?: string }> = [
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
      href: buildQuery(sp, { problems: "1" }),
    },
    {
      label: "Остаток группы",
      value: accountBalances.length ? fmtRub(groupBalanceRub) : "нет данных",
    },
  ]

  const accounts: AccountRow[] = accountBalances.map((b) => ({
    accountUid: b.accountUid,
    label: `${b.orgName} · ${b.accountName}`,
    currency: b.currency,
    balanceMinorNum: Number(b.balanceMinor),
    balanceRubNum: toRub(b.balanceMinor, b.currency, rates) ?? 0,
  }))
  const fundCards: FundCardRow[] = fundSnapshots.map((f) => ({
    name: f.name,
    planText: formatMoneyBig(f.planWeekMinor),
    factText: formatMoneyBig(f.factWeekMinor),
    balanceText: formatMoneyBig(f.balanceMinor),
    negative: f.balanceMinor < 0n,
    href: buildQuery(sp, { fund: f.name }),
  }))

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
          <Link
            href="/settings/verdict"
            className="underline underline-offset-4"
          >
            Настройки светофора
          </Link>
          <form action={refreshData}>
            <Button type="submit" variant="outline" size="sm">
              Обновить
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              {m.href ? (
                <Link
                  href={m.href}
                  className="text-lg font-semibold underline-offset-4 hover:underline"
                >
                  {m.value}
                </Link>
              ) : (
                <p className="text-lg font-semibold">{m.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
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
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
          <label htmlFor="partner" className="text-sm font-medium">
            Контрагент
          </label>
          <select
            id="partner"
            name="partner"
            defaultValue={partner}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
            defaultChecked={problems}
            className="size-4 accent-primary"
          />
          Только красные флаги
        </label>
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

      <RequestsTable rows={rows} accounts={accounts} funds={fundCards} />
    </main>
  )
}
