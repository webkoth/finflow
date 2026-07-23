import Link from "next/link"
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
import { RunButton } from "./run-button"

export const dynamic = "force-dynamic"

const RUN_LABEL: Record<string, string> = {
  matched: "Сошлось",
  discrepancy: "Есть расхождения",
  no_data: "Нет данных",
}

export default async function Page() {
  await requirePageUser()

  const runs = await prisma.reconciliationRun.findMany({
    orderBy: { runAt: "desc" },
    take: 60,
    include: {
      _count: { select: { discrepancies: true, accountResults: true } },
    },
  })

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Сверка счётов</h1>
          <p className="text-sm text-muted-foreground">
            Ежедневная сверка независимой выписки с движениями 1С и заявками.
          </p>
        </div>
        <RunButton />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата прогона</TableHead>
            <TableHead>Период</TableHead>
            <TableHead>Счетов</TableHead>
            <TableHead>Расхождений</TableHead>
            <TableHead>Статус</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link
                  href={`/reconciliation/${r.id}`}
                  className="text-primary underline underline-offset-4"
                >
                  {formatDate(r.runAt)}
                </Link>
              </TableCell>
              <TableCell>{formatDate(r.periodStart)}</TableCell>
              <TableCell>{r._count.accountResults}</TableCell>
              <TableCell>{r._count.discrepancies}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    r.status === "discrepancy" ? "destructive" : "outline"
                  }
                >
                  {RUN_LABEL[r.status] ?? r.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Прогонов ещё не было.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </main>
  )
}
