-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "isGoods" BOOLEAN NOT NULL DEFAULT false;

-- Перенос галочек «оплата за товар» из настроек в справочник (по названию).
-- Название, не найденное в справочнике, пропадает — осознанно (см. спеку
-- 2026-07-23-goods-flag-live-reference-sync-design).
UPDATE "articles" AS a
SET "isGoods" = true
FROM "cash_flow_item_settings" AS s
WHERE a."kind" = 'CASHFLOW'
  AND s."isGoods" = true
  AND a."name" = s."name";
