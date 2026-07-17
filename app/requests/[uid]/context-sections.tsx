// app/requests/[uid]/context-sections.tsx
// Server components: секции контекста карточки. Каждая секция показывает
// индикатор «своей» проверки из вердикта; пустой срез — серое «нет данных».
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/domain/dates"
import { formatMoneyBig } from "@/lib/domain/money"
import { toRub, type Verdict, type CheckId } from "@/lib/domain/verdict"
import type { RequestContext } from "@/lib/verdicts"
import type { PaymentRequest } from "@prisma/client"
import { CHECK_DOT_CLASSES, STATUS_CLASSES, STATUS_LABELS } from "../status"

function Dot({ verdict, id }: { verdict: Verdict; id: CheckId }) {
  const c = verdict.checks.find((x) => x.id === id)
  return (
    <span
      className={`size-2.5 shrink-0 rounded-full ${CHECK_DOT_CLASSES[c?.status ?? "info"]}`}
      aria-hidden
    />
  )
}

function Section({
  title,
  verdict,
  checkId,
  children,
}: {
  title: string
  verdict: Verdict
  checkId: CheckId | null
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {checkId && <Dot verdict={verdict} id={checkId} />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  )
}

const fmtRub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`

export function LiquiditySection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  if (ctx.balances.length === 0)
    return (
      <Section title="Ликвидность" verdict={ctx.verdict} checkId="funds">
        <p className="text-muted-foreground">
          Нет данных — срез остатков пуст.
        </p>
      </Section>
    )
  const amountRub = toRub(request.amountMinor, request.currency, ctx.rates)
  const rows = ctx.balances.map((b) => ({
    ...b,
    rub: toRub(b.balanceMinor, b.currency, ctx.rates) ?? 0,
  }))
  const groupRub = rows.reduce((sum, b) => sum + b.rub, 0)
  return (
    <Section title="Ликвидность" verdict={ctx.verdict} checkId="funds">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((b) => {
            const isDebit = b.accountUid === request.debitAccountUid
            const after =
              isDebit && b.currency === request.currency
                ? b.balanceMinor - request.amountMinor
                : null
            return (
              <tr key={b.accountUid} className={isDebit ? "font-medium" : ""}>
                <td className="py-1">
                  {b.orgName} · {b.accountName}
                  {isDebit && (
                    <Badge variant="outline" className="ml-2">
                      счёт списания
                    </Badge>
                  )}
                </td>
                <td className="py-1 text-right">
                  {formatMoneyBig(b.balanceMinor, b.currency)}
                  {after !== null && (
                    <span className="text-muted-foreground">
                      {" "}
                      → {formatMoneyBig(after, b.currency)}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
          <tr className="border-t font-medium">
            <td className="py-1">Группа, ₽ экв.</td>
            <td className="py-1 text-right">
              {fmtRub(groupRub)}
              {amountRub !== null && (
                <span className="text-muted-foreground">
                  {" "}
                  → {fmtRub(groupRub - amountRub)}
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

export function FundSection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  const fund = ctx.fund
  return (
    <Section
      title={`Фонд${request.fund ? ` «${request.fund}»` : ""}`}
      verdict={ctx.verdict}
      checkId="fund_balance"
    >
      {!fund ? (
        <p className="text-muted-foreground">Нет данных по фонду.</p>
      ) : (
        <div className="space-y-1">
          <p>
            План недели: {formatMoneyBig(fund.planWeekMinor)} · Факт:{" "}
            {formatMoneyBig(fund.factWeekMinor)} · Остаток:{" "}
            {formatMoneyBig(fund.balanceMinor)}
          </p>
          <p className="text-muted-foreground">
            Эта заявка изменит остаток на −
            {formatMoneyBig(request.amountMinor, request.currency)}.
          </p>
        </div>
      )}
    </Section>
  )
}

export function PartnerSection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  const p = ctx.partner
  const payments = p
    ? (p.recentPayments as Array<{
        date: string
        basis: string
        amountMinor: string
      }>)
    : []
  return (
    <Section title="Контрагент" verdict={ctx.verdict} checkId="partner">
      <div className="space-y-2">
        <p className="flex items-center gap-2">
          <span className="font-medium">{request.partnerName}</span>
          {p?.chatUrl && (
            <a
              href={p.chatUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-4"
            >
              💬 чат
            </a>
          )}
        </p>
        {!p ? (
          <p className="text-muted-foreground">
            Истории нет — контрагент отсутствует в срезе взаиморасчётов.
          </p>
        ) : (
          <>
            <p>
              Платежей: {p.paymentCount}
              {p.firstOperationAt &&
                ` · работаем с ${formatDate(p.firstOperationAt)}`}{" "}
              · всего {formatMoneyBig(p.totalPaidMinor)}
            </p>
            <p className="text-muted-foreground">
              Дебиторка: {formatMoneyBig(p.receivableMinor)} · Кредиторка:{" "}
              {formatMoneyBig(p.payableMinor)}
            </p>
            {payments.length > 0 && (
              <ul className="space-y-0.5 text-muted-foreground">
                {payments.map((pay, i) => (
                  <li key={i}>
                    {formatDate(new Date(pay.date))} · {pay.basis} ·{" "}
                    {formatMoneyBig(BigInt(pay.amountMinor))}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

export function OrderSection({
  request,
  ctx,
}: {
  request: PaymentRequest
  ctx: RequestContext
}) {
  const { order, contract } = ctx
  // Процент — в валюте заказа (в данных 1С валюта заявки совпадает с валютой
  // заказа); точный мультивалютный расчёт делает checkOrderContract в домене.
  const percent =
    order && order.amountMinor > 0n
      ? Number(
          ((order.paidMinor + request.amountMinor) * 100n) / order.amountMinor
        )
      : null
  return (
    <Section
      title="Заказ / Основание"
      verdict={ctx.verdict}
      checkId="order_contract"
    >
      <div className="space-y-2">
        {contract && (
          <p className="text-muted-foreground">
            Договор №{contract.number} от {formatDate(contract.date)} ·{" "}
            {contract.isActive ? "действует" : "закрыт"} · задолженность{" "}
            {formatMoneyBig(contract.debtMinor, contract.currency)}
          </p>
        )}
        {order ? (
          <>
            <p className="font-medium">
              Заказ №{order.number}:{" "}
              {formatMoneyBig(order.amountMinor, order.currency)}
            </p>
            <p>
              Оплачено ранее: {formatMoneyBig(order.paidMinor, order.currency)}{" "}
              · с этим платежом: {percent !== null ? `${percent}%` : "—"}
            </p>
            {percent !== null && (
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className={
                    percent > 100 ? "h-2 bg-red-500" : "h-2 bg-green-500"
                  }
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Заказ поставщику не привязан
            {contract ? " (основание — договор)" : ""}.
          </p>
        )}
      </div>
    </Section>
  )
}

export function AttachmentsSection({ ctx }: { ctx: RequestContext }) {
  return (
    <Section title="Вложения" verdict={ctx.verdict} checkId="document">
      {ctx.attachments.length === 0 ? (
        <p className="text-muted-foreground">Вложений нет.</p>
      ) : (
        <ul className="space-y-1">
          {ctx.attachments.map((a) => (
            <li key={a.id}>
              {a.fileName}
              {a.fileType && (
                <span className="text-muted-foreground"> · {a.fileType}</span>
              )}
              <span className="text-muted-foreground">
                {" "}
                · {formatDate(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Метаданные из 1С; скачивание файлов появится с методом API 1С.
      </p>
    </Section>
  )
}

export function RelatedSection({ ctx }: { ctx: RequestContext }) {
  return (
    <Section
      title="Связанные заявки ±30 дней"
      verdict={ctx.verdict}
      checkId={null}
    >
      {ctx.related.length === 0 ? (
        <p className="text-muted-foreground">Связанных заявок нет.</p>
      ) : (
        <ul className="space-y-1">
          {ctx.related.map((r) => (
            <li key={r.uid} className="flex items-center gap-2">
              <Link
                href={`/requests/${r.uid}`}
                className="text-primary underline underline-offset-4"
              >
                {r.number}
              </Link>
              <span>{formatDate(r.payDate)}</span>
              <span>{formatMoneyBig(r.amountMinor, r.currency)}</span>
              <Badge className={STATUS_CLASSES[r.executionStatus]}>
                {STATUS_LABELS[r.executionStatus]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
