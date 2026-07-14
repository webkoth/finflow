-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('on_approval', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('on_approval', 'declined', 'awaiting', 'executed', 'overdue');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('running', 'ok', 'error');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('cron', 'manual', 'seed');

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "orgName" TEXT NOT NULL,
    "orgInn" TEXT,
    "orgUid" TEXT,
    "initiator" TEXT,
    "department" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "cashFlowItem" TEXT,
    "fund" TEXT,
    "partnerName" TEXT,
    "partnerInn" TEXT,
    "partnerUid" TEXT,
    "payDate" TIMESTAMPTZ(3) NOT NULL,
    "approvalStatus" "ApprovalStatus" NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "executionStatus" "ExecutionStatus" NOT NULL,
    "executedAt" TIMESTAMPTZ(3),
    "isDeletedIn1c" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debits" (
    "id" TEXT NOT NULL,
    "docUid" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "requestUid" TEXT NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "debits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_comments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "status" "SyncRunStatus" NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "requestsUpserted" INTEGER NOT NULL DEFAULT 0,
    "debitsUpserted" INTEGER NOT NULL DEFAULT 0,
    "debitsSkipped" INTEGER NOT NULL DEFAULT 0,
    "requestsMarkedDeleted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_requests_uid_key" ON "payment_requests"("uid");

-- CreateIndex
CREATE INDEX "payment_requests_executionStatus_idx" ON "payment_requests"("executionStatus");

-- CreateIndex
CREATE INDEX "payment_requests_payDate_idx" ON "payment_requests"("payDate");

-- CreateIndex
CREATE UNIQUE INDEX "debits_docUid_key" ON "debits"("docUid");

-- CreateIndex
CREATE INDEX "debits_requestUid_idx" ON "debits"("requestUid");

-- CreateIndex
CREATE INDEX "execution_comments_requestId_idx" ON "execution_comments"("requestId");

-- CreateIndex
CREATE INDEX "sync_runs_status_startedAt_idx" ON "sync_runs"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "debits" ADD CONSTRAINT "debits_requestUid_fkey" FOREIGN KEY ("requestUid") REFERENCES "payment_requests"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_comments" ADD CONSTRAINT "execution_comments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
