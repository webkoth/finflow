-- CreateEnum
CREATE TYPE "ReconRunStatus" AS ENUM ('matched', 'discrepancy', 'no_data');

-- CreateEnum
CREATE TYPE "ReconAccountStatus" AS ENUM ('matched', 'discrepancy', 'no_data', 'source_error');

-- CreateEnum
CREATE TYPE "ReconSourceType" AS ENUM ('bank_api', 'manual_file');

-- CreateEnum
CREATE TYPE "ReconSourceStatus" AS ENUM ('ok', 'error');

-- CreateEnum
CREATE TYPE "ReconResolution" AS ENUM ('new', 'reviewed', 'accepted');

-- CreateEnum
CREATE TYPE "ReconTrigger" AS ENUM ('cron', 'manual');

-- CreateEnum
CREATE TYPE "ReconDiscrepancyType" AS ENUM ('closing_balance', 'debit_turnover', 'credit_turnover', 'balance_identity', 'recipient_mismatch', 'request_not_executed', 'payment_without_request', 'amount_mismatch');

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "status" "ReconRunStatus" NOT NULL,
    "trigger" "ReconTrigger" NOT NULL,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_account_results" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "accountUid" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "stmtOpeningMinor" BIGINT,
    "stmtClosingMinor" BIGINT,
    "stmtDebitMinor" BIGINT,
    "stmtCreditMinor" BIGINT,
    "onecClosingMinor" BIGINT,
    "onecDebitMinor" BIGINT,
    "onecCreditMinor" BIGINT,
    "status" "ReconAccountStatus" NOT NULL,
    "sourceType" "ReconSourceType" NOT NULL,
    "sourceStatus" "ReconSourceStatus" NOT NULL,
    "sourceError" TEXT,
    "statementFileName" TEXT,
    "statementSha256" TEXT,

    CONSTRAINT "reconciliation_account_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_discrepancies" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "accountResultId" TEXT,
    "requestUid" TEXT,
    "type" "ReconDiscrepancyType" NOT NULL,
    "expected" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "amountMinor" BIGINT,
    "detail" TEXT NOT NULL,
    "resolutionStatus" "ReconResolution" NOT NULL DEFAULT 'new',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "note" TEXT,

    CONSTRAINT "reconciliation_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_runs_runAt_idx" ON "reconciliation_runs"("runAt");

-- CreateIndex
CREATE INDEX "reconciliation_account_results_runId_idx" ON "reconciliation_account_results"("runId");

-- CreateIndex
CREATE INDEX "reconciliation_account_results_accountNumber_idx" ON "reconciliation_account_results"("accountNumber");

-- CreateIndex
CREATE INDEX "reconciliation_discrepancies_runId_idx" ON "reconciliation_discrepancies"("runId");

-- CreateIndex
CREATE INDEX "reconciliation_discrepancies_resolutionStatus_idx" ON "reconciliation_discrepancies"("resolutionStatus");

-- AddForeignKey
ALTER TABLE "reconciliation_account_results" ADD CONSTRAINT "reconciliation_account_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_runId_fkey" FOREIGN KEY ("runId") REFERENCES "reconciliation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_accountResultId_fkey" FOREIGN KEY ("accountResultId") REFERENCES "reconciliation_account_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_discrepancies" ADD CONSTRAINT "reconciliation_discrepancies_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
