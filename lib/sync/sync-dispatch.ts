// lib/sync/sync-dispatch.ts
// После синка списаний: создаёт черновики отправок платёжек для оплат
// «за товар» (спека §8, шаг 1 пайплайна). «Товарные» статьи — статьи
// справочника ДДС с локальным флагом isGoods (страница «Статьи ДДС»).
// Авто-подбор файла в v1 отключён (процесс выкладки не настроен, §11.2) —
// файл прикрепляет бухгалтер на /dispatch.
import { prisma } from "@/lib/db"
import { computeDispatchReadiness } from "@/lib/domain/dispatch"

export async function syncDispatch(): Promise<number> {
  // «Товарные» статьи — из справочника ДДС (источник истины — 1С),
  // флаг isGoods — локальный (страница «Статьи ДДС»). Сопоставление
  // с заявкой — по названию: в заявках из DWH статья приходит строкой,
  // UID статьи 1С в них нет.
  const goods = await prisma.article.findMany({
    where: { kind: "CASHFLOW", isGoods: true, isActive: true },
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
