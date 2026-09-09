-- Pack size per inventory batch; snapshot on sale lines for historical bills.
ALTER TABLE "InventoryLot" ADD COLUMN "packSize" INTEGER NOT NULL DEFAULT 1;
UPDATE "InventoryLot" il
SET "packSize" = GREATEST(1, p."packSize")
FROM "Product" p
WHERE p."id" = il."productId";

ALTER TABLE "SaleLine" ADD COLUMN "packSize" INTEGER NOT NULL DEFAULT 1;
UPDATE "SaleLine" sl
SET "packSize" = GREATEST(1, p."packSize")
FROM "Product" p
WHERE p."id" = sl."productId";
