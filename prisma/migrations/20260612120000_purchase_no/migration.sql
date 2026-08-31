-- Permanent per-store purchase numbers (like Sale.billNo).

ALTER TABLE "Purchase" ADD COLUMN "purchaseNo" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "storeId" ORDER BY "createdAt" ASC, "id" ASC) AS n
  FROM "Purchase"
)
UPDATE "Purchase" p
SET "purchaseNo" = numbered.n
FROM numbered
WHERE p."id" = numbered."id";

ALTER TABLE "Purchase" ALTER COLUMN "purchaseNo" SET NOT NULL;

CREATE UNIQUE INDEX "Purchase_storeId_purchaseNo_key" ON "Purchase"("storeId", "purchaseNo");

ALTER TABLE "StoreSettings" ADD COLUMN "nextPurchaseNo" INTEGER NOT NULL DEFAULT 1;

UPDATE "StoreSettings" ss
SET "nextPurchaseNo" = COALESCE(
  (SELECT MAX("purchaseNo") + 1 FROM "Purchase" p WHERE p."storeId" = ss."storeId"),
  1
);
