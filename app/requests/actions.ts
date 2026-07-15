"use server"

import { revalidatePath } from "next/cache"
import { getDwhGateway } from "@/lib/integrations/dwh"
import { runSync } from "@/lib/sync/run-sync"

// Ручной запуск синка кнопкой «Обновить». Ошибки синка не бросаются —
// они журналируются в SyncRun и видны в строке свежести данных.
export async function refreshData(): Promise<void> {
  await runSync(getDwhGateway(), "manual")
  revalidatePath("/requests")
}
