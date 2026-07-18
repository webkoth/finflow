// lib/sync/sync-slices.ts
// Синк срезов светофора. Каждый срез — независимый шаг: ошибка одного
// не мешает остальным (проверки по нему деградируют в «нет данных»).
import { prisma } from "@/lib/db"
import type { SliceFetchers } from "@/lib/integrations/slices"
import type { Prisma } from "@prisma/client"

export type SliceReport = Record<
  string,
  { upserted: number } | { error: string }
>

async function step(
  fn: () => Promise<number>
): Promise<{ upserted: number } | { error: string }> {
  try {
    return { upserted: await fn() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function syncSlices(
  fetchers: SliceFetchers
): Promise<SliceReport> {
  const syncedAt = new Date()
  const report: SliceReport = {}

  report.balances = await step(async () => {
    const rows = await fetchers.balances.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.accountBalance.upsert({
        where: { accountUid: r.accountUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.rates = await step(async () => {
    const rows = await fetchers.rates.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.currencyRate.upsert({
        where: { currencyCode: r.currencyCode },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.funds = await step(async () => {
    const rows = await fetchers.funds.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.fundSnapshot.upsert({
        where: { fundUid: r.fundUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.partners = await step(async () => {
    const rows = await fetchers.partners.fetch()
    for (const r of rows) {
      const data = {
        ...r,
        recentPayments: r.recentPayments as Prisma.InputJsonValue,
        syncedAt,
      }
      await prisma.partnerStats.upsert({
        where: { partnerUid: r.partnerUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.contracts = await step(async () => {
    const rows = await fetchers.contracts.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.partnerContract.upsert({
        where: { contractUid: r.contractUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.orders = await step(async () => {
    const rows = await fetchers.orders.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.supplierOrder.upsert({
        where: { orderUid: r.orderUid },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  report.attachments = await step(async () => {
    const rows = await fetchers.attachments.fetch()
    for (const r of rows) {
      const data = { ...r, syncedAt }
      await prisma.attachmentMeta.upsert({
        where: {
          requestUid_fileName: {
            requestUid: r.requestUid,
            fileName: r.fileName,
          },
        },
        update: data,
        create: data,
      })
    }
    return rows.length
  })

  return report
}
