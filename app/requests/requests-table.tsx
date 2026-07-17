"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { bulkApproveRequests, type FormState } from "./actions"

export type RequestRow = {
  uid: string
  number: string
  urgent: boolean
  orgName: string
  partnerName: string
  fund: string
  payDateText: string
  amountText: string
  statusLabel: string
  statusClass: string
  hasExplanation: boolean
  verdictLevel: "ok" | "warn" | "bad" | null
  verdictTitle: string
  verdictDotClass: string
  canSelect: boolean // approvalStatus === on_approval && verdict === ok
  debitAccountUid: string | null
  currency: string
  amountMinorNum: number
  amountRubNum: number
}

export type AccountRow = {
  accountUid: string
  label: string
  currency: string
  balanceMinorNum: number
  balanceRubNum: number
}

export type FundCardRow = {
  name: string
  planText: string
  factText: string
  balanceText: string
  negative: boolean
  href: string
}

const initialState: FormState = { error: null }

export function RequestsTable({
  rows,
  accounts,
  funds,
}: {
  rows: RequestRow[]
  accounts: AccountRow[]
  funds: FundCardRow[]
}) {
  const [state, formAction, isPending] = useActionState(
    bulkApproveRequests,
    initialState
  )
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const selectable = rows.filter((r) => r.canSelect)

  const fmtMoney = (minor: number, currency: string) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(
      minor / 100
    )
  const fmtRub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`

  // canSelect гаснет после ремоунта строки (фильтр, revalidate) — но uid
  // может остаться в selected; отсеиваем такие «висячие» отметки, чтобы
  // проекция не расходилась с реально видимыми чекбоксами.
  const selectedRows = rows.filter((r) => r.canSelect && selected.has(r.uid))
  const afterByAccount = new Map(
    accounts.map((a) => {
      const debit = selectedRows
        .filter(
          (r) => r.debitAccountUid === a.accountUid && r.currency === a.currency
        )
        .reduce((sum, r) => sum + r.amountMinorNum, 0)
      return [a.accountUid, a.balanceMinorNum - debit] as const
    })
  )
  const groupRub = accounts.reduce((sum, a) => sum + a.balanceRubNum, 0)
  const groupAfterRub =
    groupRub - selectedRows.reduce((sum, r) => sum + r.amountRubNum, 0)

  return (
    <form
      action={formAction}
      className="space-y-3"
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement
        if (t.name !== "uids") return
        setSelected((prev) => {
          const next = new Set(prev)
          if (t.checked) next.add(t.value)
          else next.delete(t.value)
          return next
        })
      }}
    >
      {(accounts.length > 0 || funds.length > 0) && (
        <details className="rounded-md border">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Остатки и фонды
          </summary>
          <div className="grid gap-4 p-4 lg:grid-cols-[3fr_2fr]">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Остатки по счетам — до / после отмеченных
              </p>
              <table className="w-full text-sm">
                <tbody>
                  {accounts.map((a) => {
                    const after =
                      afterByAccount.get(a.accountUid) ?? a.balanceMinorNum
                    return (
                      <tr key={a.accountUid}>
                        <td className="py-0.5">{a.label}</td>
                        <td className="py-0.5 text-right tabular-nums">
                          {fmtMoney(a.balanceMinorNum, a.currency)}
                          <span
                            className={
                              after < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }
                          >
                            {" "}
                            → {fmtMoney(after, a.currency)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="border-t font-medium">
                    <td className="py-0.5">Группа, ₽ экв.</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {fmtRub(groupRub)}
                      <span
                        className={
                          groupAfterRub < 0
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }
                      >
                        {" "}
                        → {fmtRub(groupAfterRub)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Фонды: план недели · факт · остаток (клик — фильтр)
              </p>
              <ul className="space-y-1 text-sm">
                {funds.map((f) => (
                  <li key={f.name}>
                    <Link
                      href={f.href}
                      className="underline-offset-4 hover:underline"
                    >
                      {f.name}
                    </Link>
                    : {f.planText} · {f.factText} ·{" "}
                    <span
                      className={f.negative ? "font-medium text-red-600" : ""}
                    >
                      {f.balanceText}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead className="w-10">Светофор</TableHead>
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
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-muted-foreground">
                Заявок нет. Нажмите «Обновить», чтобы загрузить данные.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.uid}>
              <TableCell>
                {r.canSelect ? (
                  // Нативный checkbox: сабмитится формой без JS-состояния
                  <input
                    type="checkbox"
                    name="uids"
                    value={r.uid}
                    aria-label={`Выбрать ${r.number}`}
                    className="size-4 accent-primary"
                    // Неуправляемый чекбокс ремоунтится при смене фильтра/
                    // revalidate — defaultChecked восстанавливает визуальный
                    // state из selected, чтобы он не разошёлся с проекцией.
                    defaultChecked={selected.has(r.uid)}
                  />
                ) : r.verdictLevel && r.verdictLevel !== "ok" ? (
                  <span
                    className="cursor-not-allowed text-xs text-muted-foreground"
                    title="Только через карточку: вердикт не зелёный"
                  >
                    —
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                {r.verdictLevel && (
                  <span
                    className={`inline-block size-3 rounded-full ${r.verdictDotClass}`}
                    title={r.verdictTitle}
                    aria-label={`Вердикт: ${r.verdictTitle}`}
                  />
                )}
              </TableCell>
              <TableCell>
                <Link
                  href={`/requests/${r.uid}`}
                  className="text-primary underline underline-offset-4"
                >
                  {r.number}
                </Link>
                {r.urgent && (
                  <span className="ml-1 text-destructive" title="Срочная">
                    !
                  </span>
                )}
              </TableCell>
              <TableCell>{r.orgName}</TableCell>
              <TableCell>{r.partnerName}</TableCell>
              <TableCell>{r.fund}</TableCell>
              <TableCell>{r.payDateText}</TableCell>
              <TableCell className="text-right">{r.amountText}</TableCell>
              <TableCell>
                <Badge className={r.statusClass}>{r.statusLabel}</Badge>
                {r.hasExplanation && (
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

      {selectable.length > 0 && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Отправляю в 1С…"
              : "Согласовать выбранные (только 🟢)"}
          </Button>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </div>
      )}
    </form>
  )
}
