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
