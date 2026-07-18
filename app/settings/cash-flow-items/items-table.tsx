// app/settings/cash-flow-items/items-table.tsx
"use client"

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
import { toggleIsGoods, type FormState } from "./actions"

export type ItemRow = { id: string; name: string; isGoods: boolean }

const initialState: FormState = { error: null }

function Row({ item }: { item: ItemRow }) {
  const [state, formAction, isPending] = useActionState(
    toggleIsGoods,
    initialState
  )
  return (
    <TableRow>
      <TableCell>{item.name}</TableCell>
      <TableCell>
        {item.isGoods ? (
          <Badge>оплата за товар</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <form action={formAction}>
          <input type="hidden" name="id" value={item.id} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isPending}
          >
            {item.isGoods ? "Снять флаг" : "Пометить «за товар»"}
          </Button>
        </form>
        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
      </TableCell>
    </TableRow>
  )
}

export function ItemsTable({ items }: { items: ItemRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Статья ДДС</TableHead>
          <TableHead>Признак</TableHead>
          <TableHead>Действие</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-muted-foreground">
              Статей нет — они появятся после первого синка заявок.
            </TableCell>
          </TableRow>
        )}
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </TableBody>
    </Table>
  )
}
