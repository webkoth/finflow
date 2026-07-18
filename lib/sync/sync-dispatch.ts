// lib/sync/sync-dispatch.ts
// После синка списаний: пополняет справочник статей ДДС и создаёт черновики
// отправок платёжек для оплат «за товар» (спека §8, шаг 1 пайплайна).
// Авто-подбор файла в v1 отключён (процесс выкладки не настроен, §11.2) —
// файл прикрепляет бухгалтер на /dispatch.
import { prisma } from "@/lib/db"
import { computeDispatchReadiness } from "@/lib/domain/dispatch"

export async function syncDispatch(): Promise<number> {
  // 1. Справочник статей: новые имена из заявок появляются в настройках.
  const items = await prisma.paymentRequest.findMany({
    where: { cashFlowItem: { not: null } },
    distinct: ["cashFlowItem"],
    select: { cashFlowItem: true },
  })
  for (const item of items) {
    const name = item.cashFlowItem
    if (!name) continue
    await prisma.cashFlowItemSetting.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  // 2. Черновики: списания по заявкам со статьёй «за товар» без отправки.
  const goods = await prisma.cashFlowItemSetting.findMany({
    where: { isGoods: true },
    select: { name: true },
  })
  const goodsNames = goods.map((g) => g.name)
  if (goodsNames.length === 0) return 0

  const debits = await prisma.debit.findMany({
    where: {
      request: { cashFlowItem: { in: goodsNames }, isDeletedIn1c: false },
      dispatches: { none: {} },
    },
    include: { request: true },
  })

  let created = 0
  for (const debit of debits) {
    // Чат поставщика — из среза контрагентов (план 6); chat_id для Bot API
    // бухгалтер вводит вручную (§11.4), поэтому черновик всегда not_ready.
    const partnerStats = debit.request.partnerUid
      ? await prisma.partnerStats.findUnique({
          where: { partnerUid: debit.request.partnerUid },
        })
      : null
    const readiness = computeDispatchReadiness({
      hasFile: false,
      hasChatId: false,
    })
    await prisma.paymentOrderDispatch.create({
      data: {
        requestId: debit.request.id,
        debitId: debit.id,
        status: readiness.status,
        chatUrl: partnerStats?.chatUrl ?? null,
      },
    })
    created++
  }
  return created
}
