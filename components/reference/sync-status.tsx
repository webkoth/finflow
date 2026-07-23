// Панель над справочником: когда данные приезжали из 1С, кнопка ручного
// обновления и предупреждение, если последняя попытка не удалась.
import { RefreshCw, TriangleAlert } from "lucide-react"
import { prisma } from "@/lib/db"
import { formatDateTime } from "@/lib/domain/dates"
import { Button } from "@/components/ui/button"
import { syncReferenceNow } from "@/app/reference/actions"

export async function SyncStatus() {
  const [lastOk, lastRun] = await Promise.all([
    prisma.referenceSyncRun.findFirst({
      where: { status: "ok" },
      orderBy: { startedAt: "desc" },
    }),
    prisma.referenceSyncRun.findFirst({
      where: { status: { in: ["ok", "error"] } },
      orderBy: { startedAt: "desc" },
    }),
  ])

  const failed = lastRun?.status === "error"

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {lastOk?.finishedAt
            ? `Данные из 1С, обновлено ${formatDateTime(lastOk.finishedAt)}`
            : "Данные из 1С ещё не загружались"}
        </p>
        <form action={syncReferenceNow}>
          <Button type="submit" variant="outline" size="sm">
            <RefreshCw />
            Обновить из 1С
          </Button>
        </form>
      </div>

      {failed && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Последнее обновление не удалось</p>
            <p className="text-muted-foreground">{lastRun.error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
