import Link from "next/link"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ExecutionStatus, Prisma } from "@prisma/client"
import { STATUS_CLASSES, STATUS_LABELS } from "./status"
import { refreshData } from "./actions"

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

function buildQuery(sp: Search, overrides: Record<string, string>): string {
  const q = new URLSearchParams()
  for (const key of ["status", "org", "fund", "from", "to"]) {
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

  const where: Prisma.PaymentRequestWhereInput = {
    isDeletedIn1c: false,
    ...(status ? { executionStatus: status as ExecutionStatus } : {}),
    ...(org ? { orgName: org } : {}),
    ...(fund ? { fund } : {}),
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

  const [requests, lastSync, orgs, funds] = await Promise.all([
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
  ])

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
          <form action={refreshData}>
            <Button type="submit" variant="outline" size="sm">
              Обновить
            </Button>
          </form>
        </div>
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Номер</TableHead>
            <TableHead>Юрлицо</TableHead>
            <TableHead>Контрагент</TableHead>
            <TableHead>Фонд</TableHead>
            <TableHead>Дата оплаты</TableHead>
            <TableHead className="text-right">Сумма</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                Заявок нет. Нажмите «Обновить», чтобы загрузить данные.
              </TableCell>
            </TableRow>
          )}
          {requests.map((r) => (
            <TableRow key={r.uid}>
              <TableCell>
                <Link
                  href={`/requests/${r.uid}`}
                  className="text-primary underline underline-offset-4"
                >
                  {r.number}
                </Link>
                {r.importance === 1 && (
                  <span className="ml-1 text-destructive" title="Срочная">
                    !
                  </span>
                )}
              </TableCell>
              <TableCell>{r.orgName}</TableCell>
              <TableCell>{r.partnerName}</TableCell>
              <TableCell>{r.fund}</TableCell>
              <TableCell>{formatDate(r.payDate)}</TableCell>
              <TableCell className="text-right">
                {formatMoneyBig(r.amountMinor, r.currency)}
              </TableCell>
              <TableCell>
                <Badge className={STATUS_CLASSES[r.executionStatus]}>
                  {STATUS_LABELS[r.executionStatus]}
                </Badge>
                {r.executionStatus === "overdue" &&
                  r._count.executionComments > 0 && (
                    <span
                      className="ml-1 text-xs text-muted-foreground"
                      title="Есть объяснение бухгалтера"
                    >
                      💬
                    </span>
                  )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
