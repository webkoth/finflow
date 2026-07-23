import { Badge } from "@/components/ui/badge"
import { CircleAlert, CircleCheck, CircleHelp, CircleX } from "lucide-react"

export type VerifiedState =
  | "matched"
  | "discrepancy"
  | "source_error"
  | "no_data"

export function VerifiedBadge({
  state,
  date,
  count,
}: {
  state: VerifiedState
  date?: string
  count?: number
}) {
  if (state === "matched") {
    return (
      <Badge variant="outline" className="gap-1">
        <CircleCheck className="size-3" />
        Проверено{date ? ` ${date}` : ""}
      </Badge>
    )
  }
  if (state === "discrepancy") {
    return (
      <Badge variant="destructive" className="gap-1">
        <CircleAlert className="size-3" />
        Расхождения{count ? `: ${count}` : ""}
      </Badge>
    )
  }
  if (state === "source_error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <CircleX className="size-3" />
        Выписка не получена
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <CircleHelp className="size-3" />
      Нет сверки
    </Badge>
  )
}
