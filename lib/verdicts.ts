// lib/verdicts.ts
// Read-path светофора: настройки и срезы из PostgreSQL → вердикты.
// Вердикт не хранится — вычисляется при каждом рендере (server components).
import { prisma } from "@/lib/db"
import {
  computeVerdict,
  DEFAULT_INCLUDE,
  DEFAULT_THRESHOLDS,
  type CheckId,
  type RatesSlice,
  type Verdict,
  type VerdictInput,
  type VerdictSettings,
} from "@/lib/domain/verdict"
import type {
  AccountBalance,
  AttachmentMeta,
  FundSnapshot,
  PartnerContract,
  PartnerStats,
  PaymentRequest,
  SupplierOrder,
} from "@prisma/client"

export async function loadVerdictSettings(): Promise<VerdictSettings> {
  const [thresholdRows, checkRows] = await Promise.all([
    prisma.verdictThreshold.findMany(),
    prisma.verdictCheckSetting.findMany(),
  ])
  const thresholds = { ...DEFAULT_THRESHOLDS }
  for (const row of thresholdRows) {
    if (row.key in thresholds)
      thresholds[row.key as keyof typeof thresholds] = Number(row.value)
  }
  const include = { ...DEFAULT_INCLUDE }
  for (const row of checkRows) {
    if (row.checkId in include)
      include[row.checkId as CheckId] = row.includeInVerdict
  }
  return { thresholds, include }
}

type SliceData = {
  balances: AccountBalance[]
  rates: RatesSlice
  ratesAvailable: boolean
  funds: Map<string, FundSnapshot>
  fundsAvailable: boolean
  partners: Map<string, PartnerStats>
  partnersAvailable: boolean
  contracts: Map<string, PartnerContract>
  orders: Map<string, SupplierOrder>
  orderContractAvailable: boolean
  attachmentCounts: Map<string, number>
  attachmentsAvailable: boolean
  oldestSyncedAt: Date | null
}

async function loadSlices(requests: PaymentRequest[]): Promise<SliceData> {
  const partnerUids = requests
    .map((r) => r.partnerUid)
    .filter((v): v is string => v !== null)
  const contractUids = requests
    .map((r) => r.contractUid)
    .filter((v): v is string => v !== null)
  const orderUids = requests
    .map((r) => r.orderUid)
    .filter((v): v is string => v !== null)
  const requestUids = requests.map((r) => r.uid)

  const [
    balances,
    rateRows,
    fundRows,
    partnerRows,
    contractRows,
    orderRows,
    attachmentGroups,
    partnersTotal,
    contractsTotal,
    ordersTotal,
    attachmentsTotal,
  ] = await Promise.all([
    prisma.accountBalance.findMany(),
    prisma.currencyRate.findMany(),
    prisma.fundSnapshot.findMany(),
    prisma.partnerStats.findMany({
      where: { partnerUid: { in: partnerUids } },
    }),
    prisma.partnerContract.findMany({
      where: { contractUid: { in: contractUids } },
    }),
    prisma.supplierOrder.findMany({ where: { orderUid: { in: orderUids } } }),
    prisma.attachmentMeta.groupBy({
      by: ["requestUid"],
      where: { requestUid: { in: requestUids } },
      _count: { _all: true },
    }),
    prisma.partnerStats.count(),
    prisma.partnerContract.count(),
    prisma.supplierOrder.count(),
    prisma.attachmentMeta.count(),
  ])

  const rates: RatesSlice = {}
  for (const r of rateRows) rates[r.currencyCode] = Number(r.rate)

  // Свежесть — худший (старейший) из максимумов syncedAt непустых срезов.
  const syncedMaxes: Array<Date | null> = [
    balances.length
      ? balances.reduce(
          (m, b) => (b.syncedAt > m ? b.syncedAt : m),
          balances[0].syncedAt
        )
      : null,
    rateRows.length
      ? rateRows.reduce(
          (m, b) => (b.syncedAt > m ? b.syncedAt : m),
          rateRows[0].syncedAt
        )
      : null,
    fundRows.length
      ? fundRows.reduce(
          (m, b) => (b.syncedAt > m ? b.syncedAt : m),
          fundRows[0].syncedAt
        )
      : null,
  ]
  const present = syncedMaxes.filter((d): d is Date => d !== null)
  const oldestSyncedAt = present.length
    ? present.reduce((m, d) => (d < m ? d : m))
    : null

  return {
    balances,
    rates,
    ratesAvailable: rateRows.length > 0,
    funds: new Map(fundRows.map((f) => [f.name, f])),
    fundsAvailable: fundRows.length > 0,
    partners: new Map(partnerRows.map((p) => [p.partnerUid, p])),
    partnersAvailable: partnersTotal > 0,
    contracts: new Map(contractRows.map((c) => [c.contractUid, c])),
    orders: new Map(orderRows.map((o) => [o.orderUid, o])),
    orderContractAvailable: contractsTotal + ordersTotal > 0,
    attachmentCounts: new Map(
      attachmentGroups.map((g) => [g.requestUid, g._count._all])
    ),
    attachmentsAvailable: attachmentsTotal > 0,
    oldestSyncedAt,
  }
}

function toVerdictInput(
  request: PaymentRequest,
  s: SliceData,
  now: Date
): VerdictInput {
  const fund = request.fund ? (s.funds.get(request.fund) ?? null) : null
  const partnerRow = request.partnerUid
    ? (s.partners.get(request.partnerUid) ?? null)
    : null
  const order = request.orderUid
    ? (s.orders.get(request.orderUid) ?? null)
    : null
  const contract = request.contractUid
    ? (s.contracts.get(request.contractUid) ?? null)
    : null
  return {
    request: {
      amountMinor: request.amountMinor,
      currency: request.currency,
      debitAccountUid: request.debitAccountUid,
      orgName: request.orgName,
      comment: request.comment,
    },
    now,
    balances: s.balances.length > 0 ? s.balances : null,
    rates: s.ratesAvailable ? s.rates : null,
    fund:
      s.fundsAvailable && fund
        ? {
            name: fund.name,
            planWeekMinor: fund.planWeekMinor,
            factWeekMinor: fund.factWeekMinor,
            balanceMinor: fund.balanceMinor,
          }
        : null,
    attachmentsCount: s.attachmentsAvailable
      ? (s.attachmentCounts.get(request.uid) ?? 0)
      : null,
    // Срез непуст, записи нет → контрагент без истории = «новый» (0 платежей).
    partner: !s.partnersAvailable
      ? null
      : partnerRow
        ? {
            paymentCount: partnerRow.paymentCount,
            firstOperationAt: partnerRow.firstOperationAt,
            lastPaymentAt: partnerRow.lastPaymentAt,
          }
        : request.partnerUid
          ? { paymentCount: 0, firstOperationAt: null, lastPaymentAt: null }
          : null,
    order: order
      ? {
          number: order.number,
          amountMinor: order.amountMinor,
          paidMinor: order.paidMinor,
          currency: order.currency,
        }
      : null,
    contract: contract
      ? {
          number: contract.number,
          date: contract.date,
          isActive: contract.isActive,
          amountMinor: contract.amountMinor,
          paidMinor: contract.paidMinor,
          currency: contract.currency,
        }
      : null,
    orderContractAvailable: s.orderContractAvailable,
  }
}

export type VerdictsBundle = {
  verdicts: Map<string, Verdict> // uid → вердикт
  rates: RatesSlice
  oldestSyncedAt: Date | null
}

// Вердикты пачкой — для реестра (заявки на согласовании: десятки, дёшево).
export async function computeVerdicts(
  requests: PaymentRequest[]
): Promise<VerdictsBundle> {
  const [settings, slices] = await Promise.all([
    loadVerdictSettings(),
    loadSlices(requests),
  ])
  const now = new Date()
  const verdicts = new Map(
    requests.map((r) => [
      r.uid,
      computeVerdict(toVerdictInput(r, slices, now), settings),
    ])
  )
  return {
    verdicts,
    rates: slices.rates,
    oldestSyncedAt: slices.oldestSyncedAt,
  }
}

export type RequestContext = {
  verdict: Verdict
  balances: AccountBalance[]
  rates: RatesSlice
  fund: FundSnapshot | null
  partner: PartnerStats | null
  contract: PartnerContract | null
  order: SupplierOrder | null
  attachments: AttachmentMeta[]
  related: PaymentRequest[]
  oldestSyncedAt: Date | null
}

// Полный контекст одной заявки — для карточки (секции + панель).
export async function loadRequestContext(
  request: PaymentRequest
): Promise<RequestContext> {
  const [settings, slices, attachments, related] = await Promise.all([
    loadVerdictSettings(),
    loadSlices([request]),
    prisma.attachmentMeta.findMany({
      where: { requestUid: request.uid },
      orderBy: { fileName: "asc" },
    }),
    // Связанные: тот же контрагент или заказ, ±30 дней от даты оплаты.
    prisma.paymentRequest.findMany({
      where: {
        uid: { not: request.uid },
        isDeletedIn1c: false,
        payDate: {
          gte: new Date(request.payDate.getTime() - 30 * 24 * 60 * 60 * 1000),
          lte: new Date(request.payDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        OR: [
          ...(request.partnerUid ? [{ partnerUid: request.partnerUid }] : []),
          ...(request.orderUid ? [{ orderUid: request.orderUid }] : []),
          ...(request.partnerName
            ? [{ partnerName: request.partnerName }]
            : []),
        ],
      },
      orderBy: { payDate: "asc" },
    }),
  ])
  const verdict = computeVerdict(
    toVerdictInput(request, slices, new Date()),
    settings
  )
  return {
    verdict,
    balances: slices.balances,
    rates: slices.rates,
    fund: request.fund ? (slices.funds.get(request.fund) ?? null) : null,
    partner: request.partnerUid
      ? (slices.partners.get(request.partnerUid) ?? null)
      : null,
    contract: request.contractUid
      ? (slices.contracts.get(request.contractUid) ?? null)
      : null,
    order: request.orderUid
      ? (slices.orders.get(request.orderUid) ?? null)
      : null,
    attachments,
    related,
    oldestSyncedAt: slices.oldestSyncedAt,
  }
}
