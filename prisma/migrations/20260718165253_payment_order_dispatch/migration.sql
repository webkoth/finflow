-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('not_ready', 'awaiting_confirmation', 'sent', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "sync_runs" ADD COLUMN     "dispatchesCreated" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payment_order_dispatches" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "debitId" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "chatId" TEXT,
    "chatUrl" TEXT,
    "confirmedById" TEXT,
    "confirmedBy" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "skipReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_order_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_item_settings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isGoods" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cash_flow_item_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_order_dispatches_status_idx" ON "payment_order_dispatches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_order_dispatches_requestId_debitId_key" ON "payment_order_dispatches"("requestId", "debitId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_flow_item_settings_name_key" ON "cash_flow_item_settings"("name");

-- AddForeignKey
ALTER TABLE "payment_order_dispatches" ADD CONSTRAINT "payment_order_dispatches_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_order_dispatches" ADD CONSTRAINT "payment_order_dispatches_debitId_fkey" FOREIGN KEY ("debitId") REFERENCES "debits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_order_dispatches" ADD CONSTRAINT "payment_order_dispatches_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
