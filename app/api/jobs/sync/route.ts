// Запуск синка планировщиком (cron на сервере, план 04):
//   curl -X POST -H "x-sync-secret: $SYNC_CRON_SECRET" <host>/api/jobs/sync
import { NextRequest, NextResponse } from "next/server"
import { getDwhGateway } from "@/lib/integrations/dwh"
import { runSync } from "@/lib/sync/run-sync"

export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_CRON_SECRET
  if (!secret || req.headers.get("x-sync-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const result = await runSync(getDwhGateway(), "cron")
  return NextResponse.json(result)
}
