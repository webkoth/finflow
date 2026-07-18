// app/dispatch/page.tsx
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
import { computeDispatchReadiness } from "@/lib/domain/dispatch"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ConfirmAllButton,
  DispatchQueueRow,
  type QueueRow,
} from "./dispatch-row"

export const dynamic = "force-dynamic"

export default async function DispatchPage() {
  const user = await getCurrentUser()
  // Просмотр — всем; действия внутри требуют confirm_dispatch на сервере.
  if (!user) notFound()
  const canConfirm = can(user.role as Role, "confirm_dispatch")

  const [queue, journal] = await Promise.all([
    prisma.paymentOrderDispatch.findMany({
      where: {
        status: { in: ["not_ready", "awaiting_confirmation", "failed"] },
      },
      include: { request: true, debit: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentOrderDispatch.findMany({
      where: { status: { in: ["sent", "skipped"] } },
      include: { request: true, debit: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

  const rows: QueueRow[] = queue.map((d) => ({
    id: d.id,
    requestUid: d.request.uid,
    requestNumber: d.request.number,
    partnerName: d.request.partnerName ?? "",
    amountText: formatMoneyBig(d.debit.amountMinor, d.request.currency),
    debitDateText: formatDate(d.debit.date),
    status: d.status as QueueRow["status"],
    missing: computeDispatchReadiness({
      hasFile: Boolean(d.filePath),
      hasChatId: Boolean(d.chatId),
    }).missing,
    fileName: d.fileName,
    chatUrl: d.chatUrl,
    chatId: d.chatId,
    error: d.error,
  }))

  const hasReady = rows.some((r) => r.status === "awaiting_confirmation")

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Отправка платёжек</h1>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Очередь</h2>
          {canConfirm && hasReady && <ConfirmAllButton />}
        </div>
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Очередь пуста. Черновики создаёт синк по списаниям заявок со статьёй
            «оплата за товар» (Настройки → Статьи ДДС).
          </p>
        )}
        {canConfirm ? (
          rows.map((row) => <DispatchQueueRow key={row.id} row={row} />)
        ) : (
          <p className="text-sm text-muted-foreground">
            {rows.length > 0 &&
              "Подтверждение отправок доступно бухгалтеру и собственнику."}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Журнал</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Заявка</TableHead>
              <TableHead>Поставщик</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Кто / когда</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Отправок ещё не было.
                </TableCell>
              </TableRow>
            )}
            {journal.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.request.number}</TableCell>
                <TableCell>{d.request.partnerName}</TableCell>
                <TableCell className="text-right">
                  {formatMoneyBig(d.debit.amountMinor, d.request.currency)}
                </TableCell>
                <TableCell>
                  {d.status === "sent" ? (
                    <Badge>отправлено</Badge>
                  ) : (
                    <Badge variant="outline">
                      пропущено{d.skipReason ? `: ${d.skipReason}` : ""}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {d.confirmedBy}
                  {d.sentAt ? ` · ${formatDate(d.sentAt)}` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </main>
  )
}
