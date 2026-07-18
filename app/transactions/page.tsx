import { requirePageUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/domain/dates"
import { formatMoney } from "@/lib/domain/money"
import { summarizeByCategory } from "@/lib/domain/transactions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TransactionForm } from "./transaction-form"

export const dynamic = "force-dynamic"

export default async function TransactionsPage() {
  await requirePageUser()

  const transactions = await prisma.transaction.findMany({
    orderBy: { occurredAt: "desc" },
  })
  const summary = summarizeByCategory(transactions)

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
              <TableCell>{formatDate(t.occurredAt)}</TableCell>
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
  )
}
