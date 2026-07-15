// app/requests/[uid]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/domain/dates"
import { executionDeadline } from "@/lib/domain/execution-status"
import { formatMoneyBig } from "@/lib/domain/money"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { STATUS_CLASSES, STATUS_LABELS } from "../status"

export const dynamic = "force-dynamic"

export default async function RequestPage({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const { uid } = await params
  const request = await prisma.paymentRequest.findUnique({
    where: { uid },
    include: {
      debits: { orderBy: { date: "asc" } },
      executionComments: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!request) notFound()

  const deadline = executionDeadline(request.payDate)

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <Link
          href="/requests"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← К реестру
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Заявка {request.number}</h1>
        <Badge className={STATUS_CLASSES[request.executionStatus]}>
          {STATUS_LABELS[request.executionStatus]}
        </Badge>
        {request.importance === 1 && (
          <Badge variant="destructive">Срочная</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Реквизиты</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Сумма</dt>
              <dd className="font-medium">
                {formatMoneyBig(request.amountMinor, request.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Дата оплаты</dt>
              <dd>{formatDate(request.payDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Юрлицо</dt>
              <dd>{request.orgName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Контрагент</dt>
              <dd>{request.partnerName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Статья ДДС</dt>
              <dd>{request.cashFlowItem}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Фонд</dt>
              <dd>{request.fund}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Инициатор</dt>
              <dd>{request.initiator}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Дата заявки</dt>
              <dd>{formatDate(request.date)}</dd>
            </div>
          </dl>
          {request.comment && (
            <p className="mt-4 text-sm text-muted-foreground">
              {request.comment}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Исполнение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {request.executionStatus === "executed" && request.executedAt ? (
            <p>Исполнена: списание {formatDate(request.executedAt)}.</p>
          ) : request.approvalStatus === "approved" ? (
            <p>
              Ожидалось списание до {formatDate(deadline)} 11:00 МСК.
              {request.executionStatus === "overdue" &&
                " Списания нет — заявка просрочена."}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Контроль исполнения начнётся после согласования.
            </p>
          )}

          {request.debits.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Банк</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {request.debits.map((d) => (
                  <TableRow key={d.docUid}>
                    <TableCell>{formatDate(d.date)}</TableCell>
                    <TableCell>{d.bankName}</TableCell>
                    <TableCell className="text-right">
                      {formatMoneyBig(d.amountMinor, request.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
