import Link from "next/link"
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
import { SyncStatus } from "@/components/reference/sync-status"
import { VerifiedBadge } from "@/components/reconciliation/verified-badge"
import { latestAccountStatuses } from "@/lib/reconciliation-status"
import { formatDate } from "@/lib/domain/dates"

export const dynamic = "force-dynamic"
const BASE = "/reference/bank-accounts"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const accounts = await prisma.bankAccount.findMany({
    where: showArchived ? {} : { isActive: true },
    orderBy: { createdAt: "asc" },
  })
  const statuses = await latestAccountStatuses()

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Банковские счета</h1>
      <SyncStatus />

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
            <TableHead>Сверка</TableHead>
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
              <TableCell>
                {(() => {
                  const s = statuses.get(a.accountNumber)
                  return (
                    <VerifiedBadge
                      state={s?.state ?? "no_data"}
                      date={s ? formatDate(s.runAt) : undefined}
                      count={s?.discrepancies}
                    />
                  )
                })()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
