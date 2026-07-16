"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FLOW_LABELS } from "./article-labels"

type Kind = "CASHFLOW" | "PNL"
type FormState = { error: string | null }
export type GroupOption = { id: string; name: string; depth: number }
export type EditingArticle = {
  id: string
  name: string
  code: string | null
  flow: "INFLOW" | "OUTFLOW" | null
  isGroup: boolean
  description: string | null
  parentId: string | null
}

const initial: FormState = { error: null }

export function ArticleForm({
  kind,
  action,
  groups,
  editing,
  cancelHref,
}: {
  kind: Kind
  action: (prev: FormState, fd: FormData) => Promise<FormState>
  groups: GroupOption[]
  editing?: EditingArticle
  cancelHref: string
}) {
  const [state, formAction, isPending] = useActionState(action, initial)
  const [isGroup, setIsGroup] = useState(editing?.isGroup ?? false)
  const [flow, setFlow] = useState<string | null>(editing?.flow ?? null)
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? "__none__")
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)
  const labels = FLOW_LABELS[kind]

  // base-ui Select.Value показывает label из items[value], иначе — сырое значение.
  const flowItems: Record<string, string> = { INFLOW: labels.INFLOW, OUTFLOW: labels.OUTFLOW }
  const parentItems: Record<string, string> = { __none__: "— нет —" }
  for (const g of groups) parentItems[g.id] = " ".repeat(g.depth * 2) + g.name

  // Сброс формы после успешного создания (в режиме правки не сбрасываем).
  useEffect(() => {
    if (wasPending.current && !isPending && state.error === null && !editing) {
      setIsGroup(false)
      setFlow(null)
      setParentId("__none__")
      formRef.current?.reset()
    }
    wasPending.current = isPending
  }, [isPending, state, editing])

  return (
    <form
      ref={formRef}
      action={formAction}
      key={editing?.id ?? "new"}
      className="space-y-4 rounded-lg border p-4"
    >
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <input type="hidden" name="isGroup" value={isGroup ? "1" : ""} />
      <input type="hidden" name="flow" value={isGroup ? "" : (flow ?? "")} />
      <input type="hidden" name="parentId" value={parentId} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Наименование</Label>
          <Input id="name" name="name" defaultValue={editing?.name} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="code">Код</Label>
          <Input id="code" name="code" defaultValue={editing?.code ?? ""} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="isGroup"
            checked={isGroup}
            onCheckedChange={(v) => setIsGroup(v === true)}
          />
          <Label htmlFor="isGroup">Это группа</Label>
        </div>
      </div>

      {!isGroup && (
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="flow">Тип</Label>
          <Select
            items={flowItems}
            value={flow}
            onValueChange={(v) => setFlow(v as string | null)}
          >
            <SelectTrigger id="flow">
              <SelectValue placeholder="Выберите тип" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INFLOW">{labels.INFLOW}</SelectItem>
              <SelectItem value="OUTFLOW">{labels.OUTFLOW}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="parentId">Родитель</Label>
        <Select
          items={parentItems}
          value={parentId}
          onValueChange={(v) => setParentId(v as string)}
        >
          <SelectTrigger id="parentId">
            <SelectValue placeholder="— нет —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— нет —</SelectItem>
            {groups
              .filter((g) => g.id !== editing?.id)
              .map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {" ".repeat(g.depth * 2) + g.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Описание</Label>
        <Textarea id="description" name="description" defaultValue={editing?.description ?? ""} />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохраняю…" : editing ? "Сохранить" : "Добавить"}
        </Button>
        {editing && (
          <a href={cancelHref} className={buttonVariants({ variant: "outline" })}>
            Отмена
          </a>
        )}
      </div>
    </form>
  )
}
