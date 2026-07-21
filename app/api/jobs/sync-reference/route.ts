// Запуск синка справочников планировщиком (cron на сервере, раз в сутки ночью):
//   curl -X POST -H "x-sync-secret: $REFERENCE_SYNC_SECRET" <host>/api/jobs/sync-reference
import { NextRequest, NextResponse } from "next/server"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReferenceSync } from "@/lib/sync/run-reference-sync"

export async function POST(req: NextRequest) {
  const secret = process.env.REFERENCE_SYNC_SECRET
  if (!secret || req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runReferenceSync(getOneCGateway(), "cron")
  const status = !result.skipped && result.status === "error" ? 500 : 200
  return NextResponse.json(result, { status })
}
