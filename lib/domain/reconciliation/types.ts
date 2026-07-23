// Нормализованные типы сверки. Не зависят ни от Prisma, ни от формата выписки —
// адаптеры (парсер, gateway 1С, репозиторий) приводят данные к ним.

export type Direction = "debit" | "credit" // debit — списание, credit — приход

// Одна строка независимой выписки (эталон).
export type StatementLine = {
  direction: Direction
  amountMinor: bigint
  counterpartyName: string
  counterpartyInn: string | null
  counterpartyAccount: string | null
  purpose: string
}

// Разобранная выписка по одному счёту за период.
export type BankStatement = {
  accountNumber: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  openingMinor: bigint
  closingMinor: bigint
  lines: StatementLine[]
}

// Движение по счёту из 1С (Document_РасходСоСчета / Document_ПоступлениеНаСчет).
export type OneCMovement = {
  direction: Direction
  amountMinor: bigint
  counterpartyName: string
  counterpartyInn: string | null
  counterpartyAccount: string | null
  purpose: string
  basisRequestUid: string | null // ДокументОснование → заявка, null если нет
}

// Заявка на оплату для проверки исполнения (снапшот из finflow PaymentRequest).
export type RequestForCheck = {
  uid: string
  amountMinor: bigint
  partnerName: string
  partnerInn: string | null
  payDate: string // YYYY-MM-DD, плановая дата оплаты
  approved: boolean // одобрена к оплате
  executedIn1c: boolean // executionStatus говорит, что исполнена
}

export type ReconAccountStatus =
  "matched" | "discrepancy" | "no_data" | "source_error"

export type DiscrepancyType =
  | "closing_balance"
  | "debit_turnover"
  | "credit_turnover"
  | "balance_identity"
  | "recipient_mismatch"
  | "request_not_executed"
  | "payment_without_request"
  | "amount_mismatch"

export type Discrepancy = {
  type: DiscrepancyType
  expected: string
  actual: string
  amountMinor: bigint | null
  detail: string
  requestUid: string | null
}

// Вход сверки по одному счёту.
export type AccountReconInput = {
  currency: string
  sourceError: boolean // источник выписки вернул ошибку (не absent)
  statement: BankStatement | null // null — выписки нет
  onecClosingMinor: bigint | null // остаток из AccountBalance, null — нет данных
  movements: OneCMovement[] | null // null — движения из 1С недоступны
  requests: RequestForCheck[]
}

// Итог сверки по одному счёту.
export type AccountReconResult = {
  status: ReconAccountStatus
  stmtOpeningMinor: bigint | null
  stmtClosingMinor: bigint | null
  stmtDebitMinor: bigint | null
  stmtCreditMinor: bigint | null
  onecClosingMinor: bigint | null
  onecDebitMinor: bigint | null
  onecCreditMinor: bigint | null
  discrepancies: Discrepancy[]
}
