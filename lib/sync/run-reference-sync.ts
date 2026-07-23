// Синк справочников из 1С: получить полный снимок → сравнить → применить
// одной транзакцией → записать в журнал. Источник истины — 1С.
import { prisma } from "@/lib/db"
import {
  buildSyncPlan,
  resolveParentLinks,
} from "@/lib/domain/reference/sync-diff"
import type {
  OneCArticle,
  OneCArticleKind,
  OneCBankAccount,
  OneCGateway,
} from "@/lib/integrations/one-c-odata"
import type { ReferenceSyncTrigger } from "@prisma/client"

const RUNNING_STALE_MS = 10 * 60 * 1000

export type ReferenceSyncResult =
  | { skipped: true }
  | {
      skipped: false
      runId: string
      status: "ok" | "error"
      created: number
      updated: number
      archived: number
      unchanged: number
      warnings: number
      error?: string
    }

type Totals = {
  created: number
  updated: number
  archived: number
  unchanged: number
  warnings: number
}

type LocalArticle = {
  id: string
  externalUid: string | null
  isActive: boolean
  name: string
  code: string | null
  flow: "INFLOW" | "OUTFLOW" | null
  isGroup: boolean
  description: string | null
  parent: { externalUid: string | null } | null
}

function articleEquals(r: OneCArticle, l: LocalArticle): boolean {
  return (
    r.name === l.name &&
    r.code === l.code &&
    r.flow === l.flow &&
    r.isGroup === l.isGroup &&
    r.description === l.description &&
    r.parentUid === (l.parent?.externalUid ?? null)
  )
}

type LocalAccount = {
  id: string
  externalUid: string | null
  isActive: boolean
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
}

function accountEquals(r: OneCBankAccount, l: LocalAccount): boolean {
  return (
    r.name === l.name &&
    r.accountNumber === l.accountNumber &&
    r.bankName === l.bankName &&
    r.bankBic === l.bankBic &&
    r.currency === l.currency &&
    r.organization === l.organization
  )
}

export async function runReferenceSync(
  gateway: OneCGateway,
  trigger: ReferenceSyncTrigger
): Promise<ReferenceSyncResult> {
  // Не более одного синка одновременно; зависший running старше 10 минут
  // не блокирует новый запуск.
  const running = await prisma.referenceSyncRun.findFirst({
    where: {
      status: "running",
      startedAt: { gt: new Date(Date.now() - RUNNING_STALE_MS) },
    },
  })
  if (running) return { skipped: true }

  const run = await prisma.referenceSyncRun.create({
    data: { status: "running", trigger },
  })

  const totals: Totals = {
    created: 0,
    updated: 0,
    archived: 0,
    unchanged: 0,
    warnings: 0,
  }

  try {
    const [cashflow, pnl, accounts] = await Promise.all([
      gateway.fetchArticles("CASHFLOW"),
      gateway.fetchArticles("PNL"),
      gateway.fetchBankAccounts(),
    ])

    // Нераспознанный вид движения у конечной статьи ДДС — предупреждение,
    // не сбой. У статей БДР вида движения нет вовсе (решение 2026-07-22) —
    // для них это не предупреждение.
    for (const a of cashflow) {
      if (!a.isGroup && a.flow === null && !a.isDeletedIn1c) totals.warnings++
    }

    const syncedAt = new Date()

    await prisma.$transaction(async (tx) => {
      await applyArticles(tx, "CASHFLOW", cashflow, syncedAt, totals)
      await applyArticles(tx, "PNL", pnl, syncedAt, totals)
      await applyAccounts(tx, accounts, syncedAt, totals)
    })

    await prisma.referenceSyncRun.update({
      where: { id: run.id },
      data: { status: "ok", finishedAt: new Date(), ...totals },
    })
    return { skipped: false, runId: run.id, status: "ok", ...totals }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await prisma.referenceSyncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: new Date(), error: message },
    })
    return {
      skipped: false,
      runId: run.id,
      status: "error",
      error: message,
      ...totals,
    }
  }
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

async function applyArticles(
  tx: Tx,
  kind: OneCArticleKind,
  remote: OneCArticle[],
  syncedAt: Date,
  totals: Totals
) {
  const local: LocalArticle[] = await tx.article.findMany({
    where: { kind },
    select: {
      id: true,
      externalUid: true,
      isActive: true,
      name: true,
      code: true,
      flow: true,
      isGroup: true,
      description: true,
      parent: { select: { externalUid: true } },
    },
  })

  const plan = buildSyncPlan(remote, local, articleEquals)
  const idByUid = new Map<string, string>()
  for (const l of local) {
    if (l.externalUid) idByUid.set(l.externalUid, l.id)
  }

  for (const r of plan.toCreate) {
    const created = await tx.article.create({
      data: {
        kind,
        externalUid: r.uid,
        name: r.name,
        code: r.code,
        flow: r.flow,
        isGroup: r.isGroup,
        description: r.description,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
      select: { id: true },
    })
    idByUid.set(r.uid, created.id)
    totals.created++
  }

  for (const { localId, remote: r } of plan.toUpdate) {
    await tx.article.update({
      where: { id: localId },
      data: {
        name: r.name,
        code: r.code,
        flow: r.flow,
        isGroup: r.isGroup,
        description: r.description,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
    })
    totals.updated++
  }

  if (plan.toArchive.length > 0) {
    const archived = await tx.article.updateMany({
      where: { id: { in: plan.toArchive } },
      data: { isActive: false, isDeletedIn1c: true, syncedAt },
    })
    totals.archived += archived.count
  }

  totals.unchanged += plan.unchanged

  // Второй проход: связи «родитель — потомок» по карте UID → локальный id.
  const links = resolveParentLinks(
    remote.filter((r) => !r.isDeletedIn1c),
    idByUid
  )
  for (const link of links) {
    await tx.article.update({
      where: { id: link.localId },
      data: { parentId: link.parentId },
    })
  }
}

async function applyAccounts(
  tx: Tx,
  remote: OneCBankAccount[],
  syncedAt: Date,
  totals: Totals
) {
  const local: LocalAccount[] = await tx.bankAccount.findMany({
    select: {
      id: true,
      externalUid: true,
      isActive: true,
      name: true,
      accountNumber: true,
      bankName: true,
      bankBic: true,
      currency: true,
      organization: true,
    },
  })

  const plan = buildSyncPlan(remote, local, accountEquals)

  for (const r of plan.toCreate) {
    await tx.bankAccount.create({
      data: {
        externalUid: r.uid,
        name: r.name,
        accountNumber: r.accountNumber,
        bankName: r.bankName,
        bankBic: r.bankBic,
        currency: r.currency,
        organization: r.organization,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
    })
    totals.created++
  }

  for (const { localId, remote: r } of plan.toUpdate) {
    await tx.bankAccount.update({
      where: { id: localId },
      data: {
        name: r.name,
        accountNumber: r.accountNumber,
        bankName: r.bankName,
        bankBic: r.bankBic,
        currency: r.currency,
        organization: r.organization,
        isActive: true,
        isDeletedIn1c: false,
        syncedAt,
      },
    })
    totals.updated++
  }

  if (plan.toArchive.length > 0) {
    const archived = await tx.bankAccount.updateMany({
      where: { id: { in: plan.toArchive } },
      data: { isActive: false, isDeletedIn1c: true, syncedAt },
    })
    totals.archived += archived.count
  }

  totals.unchanged += plan.unchanged
}
