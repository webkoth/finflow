// app/requests/[uid]/page.tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePageUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/domain/dates"
import { executionDeadline } from "@/lib/domain/execution-status"
import { formatMoneyBig } from "@/lib/domain/money"
import { can, type Role } from "@/lib/domain/permissions"
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
import { loadRequestContext } from "@/lib/verdicts"
import { STATUS_CLASSES, STATUS_LABELS } from "../status"
import { ApprovalControls } from "./approval-controls"
import { CommentForm } from "./comment-form"
import {
  AttachmentsSection,
  FundSection,
  LiquiditySection,
  OrderSection,
  PartnerSection,
  RelatedSection,
} from "./context-sections"
import { VerdictPanel } from "./verdict-panel"

export const dynamic = "force-dynamic"

export default async function RequestPage({
  params,
}: {
  params: Promise<{ uid: string }>
}) {
  const user = await requirePageUser()
  const role = user.role as Role

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
  const ctx = await loadRequestContext(request)
  const syncedAtText = ctx.oldestSyncedAt
    ? ctx.oldestSyncedAt.toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        dateStyle: "short",
        timeStyle: "short",
      })
    : null

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
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
        {ctx.verdict.checks
          .filter((c) => c.status === "warn" || c.status === "bad")
          .map((c) => (
            <Badge key={c.id} variant="outline">
              {c.label}
            </Badge>
          ))}
      </div>

      {request.isDeletedIn1c && (
        <p className="text-sm text-destructive">
          Заявка удалена в 1С — данные могли устареть.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
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
                  <dt className="text-muted-foreground">Руководитель отдела</dt>
                  <dd>{request.initiatorHead ?? "—"}</dd>
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

          <LiquiditySection request={request} ctx={ctx} />
          <FundSection request={request} ctx={ctx} />
          <PartnerSection request={request} ctx={ctx} />
          <OrderSection request={request} ctx={ctx} />
          <AttachmentsSection ctx={ctx} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Исполнение</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {request.executionStatus === "executed" && request.executedAt ? (
                <p>Исполнена: списание {formatDate(request.executedAt)}.</p>
              ) : request.approvalStatus === "approved" ? (
                request.executionStatus === "overdue" ? (
                  <p>
                    Ожидалось списание до {formatDate(deadline)} 11:00 МСК.
                    Списания нет — заявка просрочена.
                  </p>
                ) : (
                  <p>Ожидается списание до {formatDate(deadline)} 11:00 МСК.</p>
                )
              ) : request.executionStatus === "declined" ? (
                <p className="text-muted-foreground">
                  Заявка отклонена — исполнение не контролируется.
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Комментарии бухгалтера
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.executionComments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Комментариев нет.
                </p>
              )}
              <ul className="space-y-3">
                {request.executionComments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium">{c.author}</span>{" "}
                    <span className="text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </span>
                    <p>{c.text}</p>
                  </li>
                ))}
              </ul>
              {can(role, "comment_execution") && (
                <CommentForm uid={request.uid} />
              )}
            </CardContent>
          </Card>

          <RelatedSection ctx={ctx} />
        </div>

        <div className="space-y-6">
          <VerdictPanel verdict={ctx.verdict} syncedAtText={syncedAtText} />

          {can(role, "approve_requests") &&
            request.approvalStatus === "on_approval" &&
            !request.isDeletedIn1c && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Согласование</CardTitle>
                </CardHeader>
                <CardContent>
                  <ApprovalControls uid={request.uid} />
                </CardContent>
              </Card>
            )}
        </div>
      </div>
    </main>
  )
}
