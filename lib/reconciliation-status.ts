import { prisma } from "@/lib/db"
import type { VerifiedState } from "@/components/reconciliation/verified-badge"

// Последний результат сверки по номеру счёта: состояние + дата + число расхождений.
export async function latestAccountStatuses(): Promise<
  Map<string, { state: VerifiedState; runAt: Date; discrepancies: number }>
> {
  const rows = await prisma.reconciliationAccountResult.findMany({
    orderBy: { run: { runAt: "desc" } },
    select: {
      accountNumber: true,
      status: true,
      run: { select: { runAt: true } },
      _count: { select: { discrepancies: true } },
    },
  })
  const map = new Map<
    string,
    { state: VerifiedState; runAt: Date; discrepancies: number }
  >()
  for (const r of rows) {
    // findMany уже отсортирован по убыванию — берём первое (самое свежее).
    if (!map.has(r.accountNumber)) {
      map.set(r.accountNumber, {
        state: r.status as VerifiedState,
        runAt: r.run.runAt,
        discrepancies: r._count.discrepancies,
      })
    }
  }
  return map
}
