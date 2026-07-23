import { notFound } from "next/navigation"
import { requirePageUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { ResolveForm } from "./resolve-form"

export const dynamic = "force-dynamic"

const ACC_STATUS: Record<string, string> = {
  matched: "Сошлось",
  discrepancy: "Расхождения",
  no_data: "Нет данных",
  source_error: "Выписка не получена",
}

const DISC_TYPE: Record<string, string> = {
  closing_balance: "Конечный остаток",
  debit_turnover: "Оборот-дебет",
  credit_turnover: "Оборот-кредит",
  balance_identity: "Тождество остатков",
  recipient_mismatch: "Получатель",
  request_not_executed: "Заявка не исполнена",
  payment_without_request: "Списание без заявки",
  amount_mismatch: "Сумма",
}

function money(v: bigint | null, currency: string): string {
  return v === null ? "—" : formatMoneyBig(v, currency)
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePageUser()
  const { id } = await params

  const run = await prisma.reconciliationRun.findUnique({
    where: { id },
    include: {
      accountResults: { orderBy: { accountNumber: "asc" } },
      discrepancies: { orderBy: { type: "asc" } },
    },
  })
  if (!run) notFound()

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Прогон сверки · {formatDate(run.runAt)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Период: {formatDate(run.periodStart)}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Счета</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Счёт</TableHead>
              <TableHead>Банк</TableHead>
              <TableHead className="text-right">Остаток (выписка)</TableHead>
              <TableHead className="text-right">Остаток (1С)</TableHead>
              <TableHead className="text-right">Дебет в/1С</TableHead>
              <TableHead className="text-right">Кредит в/1С</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Файл</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.accountResults.map((a) => {
              const bad = (x: bigint | null, y: bigint | null) =>
                x !== null && y !== null && x !== y ? "text-destructive" : ""
              return (
                <TableRow key={a.id}>
                  <TableCell>{a.accountNumber}</TableCell>
                  <TableCell>{a.bankName ?? "—"}</TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtClosingMinor, a.onecClosingMinor)}`}
                  >
                    {money(a.stmtClosingMinor, a.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtClosingMinor, a.onecClosingMinor)}`}
                  >
                    {money(a.onecClosingMinor, a.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtDebitMinor, a.onecDebitMinor)}`}
                  >
                    {money(a.stmtDebitMinor, a.currency)} /{" "}
                    {money(a.onecDebitMinor, a.currency)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${bad(a.stmtCreditMinor, a.onecCreditMinor)}`}
                  >
                    {money(a.stmtCreditMinor, a.currency)} /{" "}
                    {money(a.onecCreditMinor, a.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        a.status === "matched" ? "outline" : "destructive"
                      }
                    >
                      {ACC_STATUS[a.status] ?? a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.statementFileName ?? "—"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">
          Расхождения ({run.discrepancies.length})
        </h2>
        {run.discrepancies.length === 0 ? (
          <p className="text-muted-foreground">Расхождений нет.</p>
        ) : (
          <div className="space-y-4">
            {run.discrepancies.map((d) => (
              <div key={d.id} className="rounded-md border border-border p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">
                    {DISC_TYPE[d.type] ?? d.type}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {d.detail}
                  </span>
                  {d.requestUid && (
                    <span className="text-xs text-muted-foreground">
                      заявка: {d.requestUid}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm">
                  Ожидалось: <b>{d.expected}</b> · Факт: <b>{d.actual}</b>
                </p>
                <div className="mt-3">
                  <ResolveForm id={d.id} current={d.resolutionStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
