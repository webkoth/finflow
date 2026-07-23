// Запуск сверки планировщиком (cron на сервере, рабочий день 13:00 МСК):
//   curl -X POST -H "x-sync-secret: $RECONCILE_SECRET" <host>/api/jobs/reconcile
import { NextRequest, NextResponse } from "next/server"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReconciliation } from "@/lib/sync/run-reconciliation"

export async function POST(req: NextRequest) {
  const secret = process.env.RECONCILE_SECRET
  if (!secret || req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runReconciliation(getOneCGateway(), "cron")
  return NextResponse.json(result, { status: 200 })
}
