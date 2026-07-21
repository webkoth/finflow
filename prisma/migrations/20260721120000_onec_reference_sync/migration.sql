-- CreateEnum
CREATE TYPE "ReferenceSyncStatus" AS ENUM ('running', 'ok', 'error');

-- CreateEnum
CREATE TYPE "ReferenceSyncTrigger" AS ENUM ('cron', 'manual');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "externalUid" TEXT,
ADD COLUMN     "isDeletedIn1c" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "externalUid" TEXT,
ADD COLUMN     "isDeletedIn1c" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "syncedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "reference_sync_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "status" "ReferenceSyncStatus" NOT NULL,
    "trigger" "ReferenceSyncTrigger" NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "archived" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "reference_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_sync_runs_status_startedAt_idx" ON "reference_sync_runs"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "articles_externalUid_key" ON "articles"("externalUid");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_externalUid_key" ON "bank_accounts"("externalUid");

