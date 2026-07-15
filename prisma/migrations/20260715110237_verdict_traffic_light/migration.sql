-- AlterTable
ALTER TABLE "payment_requests" ADD COLUMN     "contractUid" TEXT,
ADD COLUMN     "debitAccountUid" TEXT,
ADD COLUMN     "initiatorHead" TEXT,
ADD COLUMN     "orderUid" TEXT;

-- AlterTable
ALTER TABLE "sync_runs" ADD COLUMN     "slices" JSONB;

-- CreateTable
CREATE TABLE "account_balances" (
    "id" TEXT NOT NULL,
    "accountUid" TEXT NOT NULL,
    "orgUid" TEXT,
    "orgName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT,
    "currency" TEXT NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_rates" (
    "id" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "rateDate" TIMESTAMPTZ(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_snapshots" (
    "id" TEXT NOT NULL,
    "fundUid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planWeekMinor" BIGINT NOT NULL,
    "factWeekMinor" BIGINT NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fund_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_stats" (
    "id" TEXT NOT NULL,
    "partnerUid" TEXT NOT NULL,
    "firstOperationAt" TIMESTAMPTZ(3),
    "lastPaymentAt" TIMESTAMPTZ(3),
    "paymentCount" INTEGER NOT NULL,
    "totalPaidMinor" BIGINT NOT NULL,
    "receivableMinor" BIGINT NOT NULL,
    "payableMinor" BIGINT NOT NULL,
    "recentPayments" JSONB NOT NULL,
    "chatUrl" TEXT,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_contracts" (
    "id" TEXT NOT NULL,
    "contractUid" TEXT NOT NULL,
    "partnerUid" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL,
    "debtMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partner_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_orders" (
    "id" TEXT NOT NULL,
    "orderUid" TEXT NOT NULL,
    "partnerUid" TEXT NOT NULL,
    "contractUid" TEXT,
    "number" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment_meta" (
    "id" TEXT NOT NULL,
    "requestUid" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attachment_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verdict_thresholds" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "verdict_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verdict_check_settings" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "includeInVerdict" BOOLEAN NOT NULL,

    CONSTRAINT "verdict_check_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_balances_accountUid_key" ON "account_balances"("accountUid");

-- CreateIndex
CREATE INDEX "account_balances_orgName_idx" ON "account_balances"("orgName");

-- CreateIndex
CREATE UNIQUE INDEX "currency_rates_currencyCode_key" ON "currency_rates"("currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "fund_snapshots_fundUid_key" ON "fund_snapshots"("fundUid");

-- CreateIndex
CREATE UNIQUE INDEX "fund_snapshots_name_key" ON "fund_snapshots"("name");

-- CreateIndex
CREATE UNIQUE INDEX "partner_stats_partnerUid_key" ON "partner_stats"("partnerUid");

-- CreateIndex
CREATE UNIQUE INDEX "partner_contracts_contractUid_key" ON "partner_contracts"("contractUid");

-- CreateIndex
CREATE INDEX "partner_contracts_partnerUid_idx" ON "partner_contracts"("partnerUid");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_orders_orderUid_key" ON "supplier_orders"("orderUid");

-- CreateIndex
CREATE INDEX "supplier_orders_partnerUid_idx" ON "supplier_orders"("partnerUid");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_meta_requestUid_fileName_key" ON "attachment_meta"("requestUid", "fileName");

-- CreateIndex
CREATE UNIQUE INDEX "verdict_thresholds_key_key" ON "verdict_thresholds"("key");

-- CreateIndex
CREATE UNIQUE INDEX "verdict_check_settings_checkId_key" ON "verdict_check_settings"("checkId");
