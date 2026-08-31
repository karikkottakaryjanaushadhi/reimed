-- Clone all InventoryLot rows from source store to target store with quantity = 0.
-- Products/brands/suppliers are global — only lots are copied.
--
-- Before running:
--   1. Register the new store in the app (or note its id from the query below).
--   2. npm run db:backup
--   3. Edit source_store_id and target_store_id below.
--
-- Local:
--   export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql "$DATABASE_URL" -f prisma/clone-store-inventory.sql
--
-- Supabase (direct connection):
--   export $(grep -E '^#DIRECT_URL=.*supabase' .env | sed 's/^#//' | xargs)
--   psql "$DIRECT_URL" -f prisma/clone-store-inventory.sql
--
-- Supabase SQL editor: replace :'source_store_id' / :'target_store_id' with quoted literals.

BEGIN;

-- Source: existing branch (Chelimparamba)
-- Target: new empty branch (paste id after registering store)
\set source_store_id 'cmph2y71p0002ukxg071u1rs5'
\set target_store_id 'cmq5e19330001kr9sxhu6yxp0'

INSERT INTO "InventoryLot" (
  "id",
  "storeId",
  "productId",
  "supplierId",
  "batchNo",
  "expiryDate",
  "quantity",
  "costPrice",
  "mrp",
  "saleRate",
  "salesDiscountPct",
  "salesDiscountRs",
  "stockCorrected",
  "createdAt",
  "updatedAt",
  "pricingUpdatedAt"
)
SELECT
  gen_random_uuid()::text AS "id",
  :'target_store_id' AS "storeId",
  src."productId",
  src."supplierId",
  src."batchNo",
  src."expiryDate",
  0 AS "quantity",
  src."costPrice",
  src."mrp",
  src."saleRate",
  src."salesDiscountPct",
  src."salesDiscountRs",
  false AS "stockCorrected",
  NOW() AS "createdAt",
  NOW() AS "updatedAt",
  src."pricingUpdatedAt"
FROM "InventoryLot" src
WHERE src."storeId" = :'source_store_id'
  AND NOT EXISTS (
    SELECT 1
    FROM "InventoryLot" tgt
    WHERE tgt."storeId" = :'target_store_id'
      AND tgt."productId" = src."productId"
      AND tgt."batchNo" = src."batchNo"
      AND tgt."expiryDate" = src."expiryDate"
  );

COMMIT;
