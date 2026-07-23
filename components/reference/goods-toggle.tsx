// Переключатель локального признака «оплата за товар» у статьи ДДС.
// Без права manage_cash_flow_items кнопка видна, но недоступна.
"use client"

import { useActionState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  toggleIsGoods,
  type FormState,
} from "@/app/reference/cashflow-items/actions"

const initialState: FormState = { error: null }

export function GoodsToggle({
  articleId,
  isGoods,
  canEdit,
}: {
  articleId: string
  isGoods: boolean
  canEdit: boolean
}) {
  const [state, formAction, isPending] = useActionState(
    toggleIsGoods,
    initialState
  )
  return (
    <div className="flex items-center gap-2">
      {isGoods ? (
        <Badge>оплата за товар</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <form action={formAction}>
        <input type="hidden" name="id" value={articleId} />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isPending || !canEdit}
        >
          {isGoods ? "Снять флаг" : "Пометить «за товар»"}
        </Button>
      </form>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </div>
  )
}
