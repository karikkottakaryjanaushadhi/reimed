-- Post-dedupe / data hygiene: normalize expiry keys and find purchase lines without a lot.
-- Safe to re-run. Review orphan rows before changing expiry or qty on open purchases.

-- 1) Normalize InventoryLot.expiryDate to noon UTC (matches normalizeInventoryLotExpiryDate).
UPDATE "InventoryLot"
SET "expiryDate" = (
  to_char(("expiryDate" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') || 'T12:00:00Z'
)::timestamptz
WHERE "expiryDate" IS DISTINCT FROM (
  to_char(("expiryDate" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') || 'T12:00:00Z'
)::timestamptz;

-- 2) Normalize PurchaseLine.expiryDate the same way (legacy midnight rows break exact lot lookup).
UPDATE "PurchaseLine"
SET "expiryDate" = (
  to_char(("expiryDate" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') || 'T12:00:00Z'
)::timestamptz
WHERE "expiryDate" IS DISTINCT FROM (
  to_char(("expiryDate" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') || 'T12:00:00Z'
)::timestamptz;

-- 3) Orphan check: open purchase lines with no lot on the same store + product + batch + expiry day.
--    Different expiry days (typo vs import) show up here even when another lot exists for the batch.
SELECT
  pl."id" AS line_id,
  p."id" AS purchase_id,
  p."storeId",
  pl."productId",
  UPPER(TRIM(pl."batchNo")) AS batch_no,
  (pl."expiryDate" AT TIME ZONE 'UTC')::date AS line_expiry_date,
  pl."quantity" + pl."freeQty" AS stock_in,
  il."id" AS lot_id,
  (il."expiryDate" AT TIME ZONE 'UTC')::date AS lot_expiry_date,
  il."quantity" AS lot_qty
FROM "PurchaseLine" pl
JOIN "Purchase" p ON p."id" = pl."purchaseId"
LEFT JOIN "InventoryLot" il
  ON il."storeId" = p."storeId"
 AND il."productId" = pl."productId"
 AND UPPER(TRIM(il."batchNo")) = UPPER(TRIM(pl."batchNo"))
 AND (il."expiryDate" AT TIME ZONE 'UTC')::date = (pl."expiryDate" AT TIME ZONE 'UTC')::date
WHERE p."complete" = false
  AND il."id" IS NULL
ORDER BY p."storeId", pl."productId", batch_no, line_expiry_date;

-- 4) Same batch, different expiry day (line vs any lot) — often a data entry typo, not dedupe.
SELECT
  pl."id" AS line_id,
  p."id" AS purchase_id,
  (pl."expiryDate" AT TIME ZONE 'UTC')::date AS line_expiry,
  il."id" AS other_lot_id,
  (il."expiryDate" AT TIME ZONE 'UTC')::date AS lot_expiry,
  il."quantity" AS lot_qty
FROM "PurchaseLine" pl
JOIN "Purchase" p ON p."id" = pl."purchaseId"
JOIN "InventoryLot" il
  ON il."storeId" = p."storeId"
 AND il."productId" = pl."productId"
 AND UPPER(TRIM(il."batchNo")) = UPPER(TRIM(pl."batchNo"))
 AND (il."expiryDate" AT TIME ZONE 'UTC')::date IS DISTINCT FROM (pl."expiryDate" AT TIME ZONE 'UTC')::date
WHERE p."complete" = false
ORDER BY p."id", pl."id";
