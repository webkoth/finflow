// lib/integrations/slices.ts
// Срезы данных светофора. Интерфейс на срез: источник каждого выбирается
// env SLICE_<ИМЯ>_SOURCE (fixture | 1c | dwh). В этом плане реализован только
// fixture; боевые адаптеры (методы API 1С, вьюхи DWH) — план DWH.
import { fixtureSlices } from "./slices-fixture"

export type BalanceRow = {
  accountUid: string
  orgUid: string | null
  orgName: string
  accountName: string
  bankName: string | null
  currency: string
  balanceMinor: bigint
}

export type RateRow = {
  currencyCode: string
  rate: number // ₽ за единицу
  rateDate: Date
}

export type FundRow = {
  fundUid: string
  name: string
  planWeekMinor: bigint
  factWeekMinor: bigint
  balanceMinor: bigint
}

export type PartnerRow = {
  partnerUid: string
  firstOperationAt: Date | null
  lastPaymentAt: Date | null
  paymentCount: number
  totalPaidMinor: bigint
  receivableMinor: bigint
  payableMinor: bigint
  recentPayments: Array<{ date: string; basis: string; amountMinor: string }>
  chatUrl: string | null
}

export type ContractRow = {
  contractUid: string
  partnerUid: string
  number: string
  date: Date
  isActive: boolean
  amountMinor: bigint
  paidMinor: bigint
  debtMinor: bigint
  currency: string
}

export type OrderRow = {
  orderUid: string
  partnerUid: string
  contractUid: string | null
  number: string
  date: Date
  amountMinor: bigint
  paidMinor: bigint
  currency: string
}

export type AttachmentRow = {
  requestUid: string
  fileName: string
  fileType: string | null
  createdAt: Date
}

export interface SliceFetcher<Row> {
  fetch(): Promise<Row[]>
}

export type SliceFetchers = {
  balances: SliceFetcher<BalanceRow>
  rates: SliceFetcher<RateRow>
  funds: SliceFetcher<FundRow>
  partners: SliceFetcher<PartnerRow>
  contracts: SliceFetcher<ContractRow>
  orders: SliceFetcher<OrderRow>
  attachments: SliceFetcher<AttachmentRow>
}

export type SliceName = keyof SliceFetchers

function pick<Row>(
  slice: SliceName,
  fixture: SliceFetcher<Row>
): SliceFetcher<Row> {
  return {
    async fetch() {
      const envVar = `SLICE_${slice.toUpperCase()}_SOURCE`
      const source = process.env[envVar] ?? "fixture"
      if (source === "fixture") return fixture.fetch()
      throw new Error(
        `Срез ${slice}: источник "${source}" (${envVar}) не поддерживается — боевые адаптеры появятся в плане DWH`
      )
    },
  }
}

export function getSliceFetchers(): SliceFetchers {
  return {
    balances: pick("balances", fixtureSlices.balances),
    rates: pick("rates", fixtureSlices.rates),
    funds: pick("funds", fixtureSlices.funds),
    partners: pick("partners", fixtureSlices.partners),
    contracts: pick("contracts", fixtureSlices.contracts),
    orders: pick("orders", fixtureSlices.orders),
    attachments: pick("attachments", fixtureSlices.attachments),
  }
}
