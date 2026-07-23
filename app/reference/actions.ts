"use server"

import { revalidatePath } from "next/cache"
import { getOneCGateway } from "@/lib/integrations/one-c-odata"
import { runReferenceSync } from "@/lib/sync/run-reference-sync"

// Ручной запуск синка. Ошибки не бросаются: неудача записывается в журнал
// и показывается панелью статуса при следующем рендере.
export async function syncReferenceNow(): Promise<void> {
  await runReferenceSync(getOneCGateway(), "manual")
  revalidatePath("/reference/cashflow-items")
  revalidatePath("/reference/pnl-items")
  revalidatePath("/reference/bank-accounts")
}
