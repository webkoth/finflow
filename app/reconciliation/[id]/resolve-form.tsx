"use client"

import { useActionState } from "react"
import { resolveDiscrepancy, type FormState } from "../actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const initial: FormState = { error: null }

const STATUS_ITEMS: Record<string, string> = {
  new: "Новое",
  reviewed: "Проверено",
  accepted: "Принято",
}

export function ResolveForm({ id, current }: { id: string; current: string }) {
  const [state, action, pending] = useActionState(resolveDiscrepancy, initial)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Select name="status" defaultValue={current} items={STATUS_ITEMS}>
        <SelectTrigger className="w-40" aria-label="Статус разбора">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_ITEMS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input name="note" placeholder="Примечание" className="w-64" />
      <Button type="submit" disabled={pending}>
        Сохранить
      </Button>
      {state.error && (
        <span className="text-sm text-destructive">{state.error}</span>
      )}
    </form>
  )
}
