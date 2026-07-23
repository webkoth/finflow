// Контракт чтения справочников из 1С. Синк работает только через OneCGateway —
// реализацию выбирает фабрика по env ONEC_ODATA_MODE.
import type { OneCMovement } from "@/lib/domain/reconciliation/types"
import { fixtureOneCGateway } from "./one-c-odata-fixture"
import { httpOneCGateway } from "./one-c-odata-http"

export type OneCArticleKind = "CASHFLOW" | "PNL"
export type OneCFlow = "INFLOW" | "OUTFLOW"

export type OneCArticle = {
  uid: string
  code: string | null
  name: string
  parentUid: string | null // null — статья лежит в корне справочника
  isGroup: boolean
  flow: OneCFlow | null // null у групп и у нераспознанного вида
  description: string | null
  isDeletedIn1c: boolean
}

export type OneCBankAccount = {
  uid: string
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
  isDeletedIn1c: boolean
}

export interface OneCGateway {
  fetchArticles(kind: OneCArticleKind): Promise<OneCArticle[]>
  fetchBankAccounts(): Promise<OneCBankAccount[]>
  // Движения по счёту за период [from, to] (YYYY-MM-DD включительно): расход + приход.
  fetchAccountMovements(
    accountUid: string,
    from: string,
    to: string
  ): Promise<OneCMovement[]>
}

// ONEC_ODATA_MODE: "fixture" (по умолчанию — демо-данные, dev/e2e) | "real".
// Незаданный режим не даёт молчаливый mock в prod — только явная ошибка.
export function getOneCGateway(): OneCGateway {
  const mode = process.env.ONEC_ODATA_MODE ?? "fixture"
  if (mode === "fixture") return fixtureOneCGateway
  if (mode === "real") return httpOneCGateway
  throw new Error(`ONEC_ODATA_MODE="${mode}" не поддерживается`)
}
