// Один прогон сверки: по каждому активному счёту собрать выписку, движения 1С,
// остаток и заявки → прогнать доменное ядро → записать результат append-only.
import { prisma } from "@/lib/db"
import { reconcileAccount } from "@/lib/domain/reconciliation/reconcile"
import type {
  AccountReconInput,
  RequestForCheck,
} from "@/lib/domain/reconciliation/types"
import { startOfMoscowDay } from "@/lib/domain/dates"
import type { OneCGateway } from "@/lib/integrations/one-c-odata"
import { getStatementSource } from "@/lib/integrations/bank-statement/statement-source"
import type { ReconAccountStatus, ReconTrigger } from "@prisma/client"

export type ReconciliationRunResult = {
  runId: string
  status: "matched" | "discrepancy" | "no_data"
  accounts: number
  discrepancies: number
}

// day — строка YYYY-MM-DD; по умолчанию сегодня (МСК).
function moscowToday(): string {
  const now = new Date()
  // Москва = UTC+3; формат YYYY-MM-DD.
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  return msk.toISOString().slice(0, 10)
}

export async function runReconciliation(
  gateway: OneCGateway,
  trigger: ReconTrigger,
  day: string = moscowToday()
): Promise<ReconciliationRunResult> {
  const source = getStatementSource()

  const accounts = await prisma.bankAccount.findMany({
    where: { isActive: true },
    select: {
      externalUid: true,
      accountNumber: true,
      bankName: true,
      currency: true,
    },
  })

  // Прогон охватывает как минимум запрошенный день; итоговый период
  // уточняется по фактической выписке каждого счёта (см. ниже).
  const dayStart = startOfMoscowDay(new Date(`${day}T12:00:00.000Z`))

  const run = await prisma.reconciliationRun.create({
    data: {
      periodStart: dayStart,
      periodEnd: dayStart,
      status: "no_data",
      trigger,
    },
  })

  let anyDiscrepancy = false
  let anyData = false
  let discrepancyCount = 0

  for (const acc of accounts) {
    // 1. Выписка (эталон). Её период задаёт окно сверки.
    const fetch = await source.getStatement(
      { accountNumber: acc.accountNumber, accountUid: acc.externalUid },
      day
    )
    const from = fetch.status === "ok" ? fetch.statement.periodStart : day
    const to = fetch.status === "ok" ? fetch.statement.periodEnd : day
    const winStart = startOfMoscowDay(new Date(`${from}T12:00:00.000Z`))
    const winEnd = startOfMoscowDay(new Date(`${to}T12:00:00.000Z`))

    // 2. Движения и остаток из 1С (только если счёт связан с 1С).
    let movements = null as AccountReconInput["movements"]
    let onecClosingMinor: bigint | null = null
    if (acc.externalUid) {
      try {
        movements = await gateway.fetchAccountMovements(
          acc.externalUid,
          from,
          to
        )
      } catch {
        movements = null
      }
      const bal = await prisma.accountBalance.findUnique({
        where: { accountUid: acc.externalUid },
        select: { balanceMinor: true },
      })
      onecClosingMinor = bal?.balanceMinor ?? null
    }

    // 3. Заявки со сроком оплаты в окне сверки.
    const reqRows = await prisma.paymentRequest.findMany({
      where: {
        debitAccountUid: acc.externalUid ?? undefined,
        payDate: { gte: winStart, lte: winEnd },
        isDeletedIn1c: false,
      },
      select: {
        uid: true,
        amountMinor: true,
        partnerName: true,
        partnerInn: true,
        payDate: true,
        approvalStatus: true,
        executionStatus: true,
      },
    })
    const isoMoscow = (d: Date) =>
      new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const requests: RequestForCheck[] = reqRows.map((r) => ({
      uid: r.uid,
      amountMinor: r.amountMinor,
      partnerName: r.partnerName ?? "",
      partnerInn: r.partnerInn,
      payDate: isoMoscow(r.payDate),
      approved: r.approvalStatus === "approved",
      executedIn1c: r.executionStatus === "executed",
    }))

    // 4. Доменная сверка.
    const input: AccountReconInput = {
      currency: acc.currency,
      sourceError: fetch.status === "error",
      statement: fetch.status === "ok" ? fetch.statement : null,
      onecClosingMinor,
      movements,
      requests,
    }
    const result = reconcileAccount(input)

    if (result.status === "discrepancy") anyDiscrepancy = true
    if (result.status !== "no_data") anyData = true

    // 5. Запись итога по счёту + расхождений.
    const accountResult = await prisma.reconciliationAccountResult.create({
      data: {
        runId: run.id,
        accountUid: acc.externalUid,
        bankName: acc.bankName,
        accountNumber: acc.accountNumber,
        currency: acc.currency,
        stmtOpeningMinor: result.stmtOpeningMinor,
        stmtClosingMinor: result.stmtClosingMinor,
        stmtDebitMinor: result.stmtDebitMinor,
        stmtCreditMinor: result.stmtCreditMinor,
        onecClosingMinor: result.onecClosingMinor,
        onecDebitMinor: result.onecDebitMinor,
        onecCreditMinor: result.onecCreditMinor,
        status: result.status as ReconAccountStatus,
        sourceType: "manual_file",
        sourceStatus: fetch.status === "error" ? "error" : "ok",
        sourceError: fetch.status === "error" ? fetch.error : null,
        statementFileName: fetch.status === "ok" ? fetch.fileName : null,
        statementSha256: fetch.status === "ok" ? fetch.sha256 : null,
      },
      select: { id: true },
    })

    for (const d of result.discrepancies) {
      discrepancyCount++
      await prisma.reconciliationDiscrepancy.create({
        data: {
          runId: run.id,
          accountResultId: accountResult.id,
          requestUid: d.requestUid,
          type: d.type,
          expected: d.expected,
          actual: d.actual,
          amountMinor: d.amountMinor,
          detail: d.detail,
        },
      })
    }
  }

  const status = anyDiscrepancy
    ? "discrepancy"
    : anyData
      ? "matched"
      : "no_data"

  await prisma.reconciliationRun.update({
    where: { id: run.id },
    data: { status },
  })

  return {
    runId: run.id,
    status,
    accounts: accounts.length,
    discrepancies: discrepancyCount,
  }
}
