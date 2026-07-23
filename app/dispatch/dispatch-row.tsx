// app/dispatch/dispatch-row.tsx
"use client"

import { useActionState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  attachDispatchFile,
  confirmAllReady,
  confirmDispatch,
  setDispatchChat,
  skipDispatch,
  type FormState,
} from "./actions"

export type QueueRow = {
  id: string
  requestUid: string
  requestNumber: string
  partnerName: string
  amountText: string
  debitDateText: string
  status: "not_ready" | "awaiting_confirmation" | "failed"
  missing: string[]
  fileName: string | null
  chatUrl: string | null
  chatId: string | null
  error: string | null
}

const initialState: FormState = { error: null }

export function DispatchQueueRow({ row }: { row: QueueRow }) {
  const [fileState, fileAction, filePending] = useActionState(
    attachDispatchFile,
    initialState
  )
  const [chatState, chatAction, chatPending] = useActionState(
    setDispatchChat,
    initialState
  )
  const [sendState, sendAction, sendPending] = useActionState(
    confirmDispatch,
    initialState
  )
  const [skipState, skipAction, skipPending] = useActionState(
    skipDispatch,
    initialState
  )
  const anyError =
    fileState.error ?? chatState.error ?? sendState.error ?? skipState.error

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`/requests/${row.requestUid}`}
          className="font-medium text-primary underline underline-offset-4"
        >
          {row.requestNumber}
        </a>
        <span>{row.partnerName}</span>
        <span className="font-medium">{row.amountText}</span>
        <span className="text-muted-foreground">
          списание {row.debitDateText}
        </span>
        {row.status === "awaiting_confirmation" && (
          <Badge>готово к отправке</Badge>
        )}
        {row.status === "not_ready" && (
          <Badge variant="outline">не хватает: {row.missing.join(", ")}</Badge>
        )}
        {row.status === "failed" && (
          <Badge variant="destructive">ошибка: {row.error}</Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action={fileAction} className="flex items-center gap-2">
          <input type="hidden" name="dispatchId" value={row.id} />
          {row.fileName ? (
            <span className="text-sm">📄 {row.fileName}</span>
          ) : null}
          <input
            type="file"
            name="file"
            aria-label={`Файл платёжки для ${row.requestNumber}`}
            className="text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={filePending}
          >
            Прикрепить
          </Button>
        </form>

        <form action={chatAction} className="flex items-center gap-2">
          <input type="hidden" name="dispatchId" value={row.id} />
          {row.chatUrl && (
            <a
              href={row.chatUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              💬 чат (ссылка из 1С)
            </a>
          )}
          <Input
            name="chatId"
            defaultValue={row.chatId ?? ""}
            placeholder="chat_id для бота"
            aria-label={`Чат для ${row.requestNumber}`}
            className="h-9 w-48"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={chatPending}
          >
            Сохранить чат
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={sendAction}>
          <input type="hidden" name="dispatchId" value={row.id} />
          <Button
            type="submit"
            size="sm"
            disabled={
              sendPending ||
              (row.status !== "awaiting_confirmation" &&
                row.status !== "failed")
            }
          >
            {sendPending
              ? "Отправляю…"
              : row.status === "failed"
                ? "Повторить"
                : "Отправить"}
          </Button>
        </form>
        <form action={skipAction} className="flex items-center gap-2">
          <input type="hidden" name="dispatchId" value={row.id} />
          <Input
            name="reason"
            placeholder="Причина пропуска"
            aria-label={`Причина пропуска ${row.requestNumber}`}
            className="h-9 w-56"
          />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={skipPending}
          >
            Пропустить
          </Button>
        </form>
      </div>

      {anyError && <p className="text-sm text-destructive">{anyError}</p>}
    </div>
  )
}

export function ConfirmAllButton() {
  const [state, formAction, isPending] = useActionState(
    confirmAllReady,
    initialState
  )
  return (
    <form action={formAction} className="flex items-center gap-3">
      <Button type="submit" disabled={isPending}>
        {isPending ? "Отправляю…" : "Отправить все готовые"}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  )
}
