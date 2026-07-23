// app/requests/[uid]/verdict-panel.tsx
// Server component: вердикт + чек-лист проверок. Данные готовит lib/verdicts.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Verdict, VerdictLevel } from "@/lib/domain/verdict"
import { CHECK_DOT_CLASSES, VERDICT_PANEL_CLASSES } from "../status"

export function VerdictPanel({
  verdict,
  syncedAtText,
}: {
  verdict: Verdict
  syncedAtText: string | null
}) {
  const level = verdict.level as Exclude<VerdictLevel, "block">
  return (
    <Card className={`border-2 ${VERDICT_PANEL_CLASSES[level]}`}>
      <CardHeader>
        <CardTitle className="text-base">
          Авто-проверка: {verdict.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{verdict.description}</p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {verdict.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${CHECK_DOT_CLASSES[c.status]}`}
                aria-hidden
              />
              <span
                className={c.status === "info" ? "text-muted-foreground" : ""}
              >
                <span className="font-medium">{c.label}</span>
                {c.sublabel && (
                  <span className="text-muted-foreground"> — {c.sublabel}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        {syncedAtText && (
          <p className="mt-4 text-xs text-muted-foreground">
            Срезы данных на {syncedAtText}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
