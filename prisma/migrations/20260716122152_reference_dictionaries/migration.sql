-- CreateEnum
CREATE TYPE "ArticleKind" AS ENUM ('CASHFLOW', 'PNL');

-- CreateEnum
CREATE TYPE "ArticleFlow" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "kind" "ArticleKind" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "flow" "ArticleFlow",
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankBic" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "organization" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articles_kind_parentId_idx" ON "articles"("kind", "parentId");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
