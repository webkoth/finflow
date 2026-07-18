// lib/sync/run-sync.ts
// Синк из DWH: upsert заявок и списаний, пометка удалённых, пересчёт
// статусов исполнения. Каждый запуск журналируется в SyncRun.
import { prisma } from "@/lib/db"
import { computeExecutionStatus } from "@/lib/domain/execution-status"
import type { DwhGateway } from "@/lib/integrations/dwh"
import { getSliceFetchers } from "@/lib/integrations/slices"
import { syncDispatch } from "./sync-dispatch"
import { syncSlices } from "./sync-slices"
import type { Prisma, SyncTrigger } from "@prisma/client"

const DEFAULT_WINDOW_DAYS = 90
const RUNNING_STALE_MS = 10 * 60 * 1000

export type SyncResult =
  | { skipped: true }
  | { skipped: false; runId: string; status: "ok" | "error"; error?: string }

export async function runSync(
  gateway: DwhGateway,
  trigger: SyncTrigger
): Promise<SyncResult> {
  // Не более одного синка одновременно; зависший running старше 10 минут
  // не блокирует новый запуск.
  const running = await prisma.syncRun.findFirst({
    where: {
      status: "running",
      startedAt: { gt: new Date(Date.now() - RUNNING_STALE_MS) },
    },
  })
  if (running) return { skipped: true }

  const run = await prisma.syncRun.create({
    data: { status: "running", trigger },
  })

  try {
    const parsed = Number(process.env.DWH_SYNC_WINDOW_DAYS)
    const windowDays =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_DAYS
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    const [requests, debits] = await Promise.all([
      gateway.fetchRequests(since),
      gateway.fetchDebits(since),
    ])
    const syncedAt = new Date()

    for (const r of requests) {
      const data = {
        number: r.number,
        date: r.date,
        orgName: r.orgName,
        orgInn: r.orgInn,
        orgUid: r.orgUid,
        initiator: r.initiator,
        department: r.department,
        amountMinor: r.amountMinor,
        currency: r.currency,
        cashFlowItem: r.cashFlowItem,
        fund: r.fund,
        partnerName: r.partnerName,
        partnerInn: r.partnerInn,
        partnerUid: r.partnerUid,
        payDate: r.payDate,
        approvalStatus: r.approvalStatus,
        importance: r.importance,
        comment: r.comment,
        debitAccountUid: r.debitAccountUid,
        contractUid: r.contractUid,
        orderUid: r.orderUid,
        initiatorHead: r.initiatorHead,
        isDeletedIn1c: false,
        syncedAt,
      }
      await prisma.paymentRequest.upsert({
        where: { uid: r.uid },
        update: data,
        create: {
          ...data,
          uid: r.uid,
          // Плейсхолдер: точный статус ставит пересчёт ниже (нужны списания).
          executionStatus: "on_approval",
        },
      })
    }

    // Заявки из окна, пропавшие из выгрузки, помечаем удалёнными в 1С.
    // Пустая выгрузка — подозрение на сбой DWH: ничего не помечаем
    // (Prisma { notIn: [] } матчит все строки — пометился бы весь реестр).
    let requestsMarkedDeleted = 0
    if (requests.length > 0) {
      const fetchedUids = requests.map((r) => r.uid)
      const marked = await prisma.paymentRequest.updateMany({
        where: {
          date: { gte: since },
          uid: { notIn: fetchedUids },
          isDeletedIn1c: false,
        },
        data: { isDeletedIn1c: true, syncedAt },
      })
      requestsMarkedDeleted = marked.count
    }

    // Списания: пропускаем сироты (заявка вне окна или ещё не приехала).
    const knownUids = new Set(
      (await prisma.paymentRequest.findMany({ select: { uid: true } })).map(
        (r) => r.uid
      )
    )
    let debitsUpserted = 0
    let debitsSkipped = 0
    for (const d of debits) {
      if (!knownUids.has(d.requestUid)) {
        debitsSkipped++
        continue
      }
      const data = {
        date: d.date,
        amountMinor: d.amountMinor,
        bankAccount: d.bankAccount,
        bankName: d.bankName,
        requestUid: d.requestUid,
        syncedAt,
      }
      await prisma.debit.upsert({
        where: { docUid: d.docUid },
        update: data,
        create: { ...data, docUid: d.docUid },
      })
      debitsUpserted++
    }

    // Срезы светофора: независимые шаги, ошибки — в отчёт, не в исключение.
    const slices = await syncSlices(getSliceFetchers())

    // Статьи ДДС и черновики отправок платёжек «за товар» (план 9, §8).
    const dispatchesCreated = await syncDispatch()

    // Пересчёт статусов: авторитетный статус — хранимый, единая точка истины.
    const all = await prisma.paymentRequest.findMany({
      where: { isDeletedIn1c: false },
      select: {
        id: true,
        payDate: true,
        approvalStatus: true,
        executionStatus: true,
        executedAt: true,
        debits: { orderBy: { date: "asc" }, take: 1, select: { date: true } },
      },
    })
    const now = new Date()
    for (const r of all) {
      const hasDebits = r.debits.length > 0
      const status = computeExecutionStatus(
        { approvalStatus: r.approvalStatus, payDate: r.payDate, hasDebits },
        now
      )
      const executedAt = hasDebits ? r.debits[0].date : null
      if (
        status !== r.executionStatus ||
        (executedAt?.getTime() ?? null) !== (r.executedAt?.getTime() ?? null)
      ) {
        await prisma.paymentRequest.update({
          where: { id: r.id },
          data: { executionStatus: status, executedAt },
        })
      }
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "ok",
        finishedAt: new Date(),
        requestsUpserted: requests.length,
        debitsUpserted,
        debitsSkipped,
        requestsMarkedDeleted,
        slices: slices as Prisma.InputJsonValue,
        dispatchesCreated,
      },
    })
    return { skipped: false, runId: run.id, status: "ok" }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error: message },
    })
    return { skipped: false, runId: run.id, status: "error", error: message }
  }
}
