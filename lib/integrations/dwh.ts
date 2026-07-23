// Контракт чтения из DWH (DEEONE). Синк работает только через DwhGateway —
// реализацию выбирает фабрика по env DWH_MODE.
import { fixtureDwhGateway } from "./dwh-fixture"

export type DwhApprovalStatus = "on_approval" | "approved" | "declined"

export type DwhRequestRow = {
  uid: string
  number: string
  date: Date
  orgName: string
  orgInn: string | null
  orgUid: string | null
  initiator: string | null
  department: string | null
  amountMinor: bigint
  currency: string
  cashFlowItem: string | null
  fund: string | null
  partnerName: string | null
  partnerInn: string | null
  partnerUid: string | null
  payDate: Date
  approvalStatus: DwhApprovalStatus
  importance: number
  comment: string | null
  // Светофор (план 6)
  debitAccountUid: string | null
  contractUid: string | null
  orderUid: string | null
  initiatorHead: string | null
}

export type DwhDebitRow = {
  docUid: string
  date: Date
  amountMinor: bigint
  bankAccount: string | null
  bankName: string | null
  requestUid: string
}

export interface DwhGateway {
  fetchRequests(since: Date): Promise<DwhRequestRow[]>
  fetchDebits(since: Date): Promise<DwhDebitRow[]>
}

// DWH_MODE: "fixture" (по умолчанию — демо-данные) | "mssql" (план 04).
export function getDwhGateway(): DwhGateway {
  const mode = process.env.DWH_MODE ?? "fixture"
  if (mode === "fixture") return fixtureDwhGateway
  throw new Error(
    `DWH_MODE="${mode}" не поддерживается: mssql-адаптер появится в плане 04`
  )
}
