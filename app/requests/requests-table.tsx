"use client"

import Link from "next/link"
import { useActionState } from "react"
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
  canSelect: boolean // approvalStatus === on_approval
}

const initialState: FormState = { error: null }

export function RequestsTable({ rows }: { rows: RequestRow[] }) {
  const [state, formAction, isPending] = useActionState(
    bulkApproveRequests,
    initialState
  )
  const selectable = rows.filter((r) => r.canSelect)

  return (
    <form action={formAction} className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
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
              <TableCell colSpan={8} className="text-muted-foreground">
                Заявок нет. Нажмите «Обновить», чтобы загрузить данные.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.uid}>
              <TableCell>
                {r.canSelect && (
                  // Нативный checkbox: сабмитится формой без JS-состояния
                  <input
                    type="checkbox"
                    name="uids"
                    value={r.uid}
                    aria-label={`Выбрать ${r.number}`}
                    className="size-4 accent-primary"
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
            {isPending ? "Отправляю в 1С…" : "Согласовать выбранные"}
          </Button>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </div>
      )}
    </form>
  )
}
