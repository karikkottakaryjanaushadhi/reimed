-- One-time: merge duplicate InventoryLot rows before applying inventory_lot_unique_key migration.
-- Run in Supabase SQL editor, verify 0 duplicate groups, then deploy migrations.
--
-- Groups duplicates by store + product + batch + expiry calendar DATE (UTC ::date).
-- Does NOT merge lots that differ by expiry day (e.g. 2027-08-03 vs 2027-08-30 stay separate).
-- Does NOT touch PurchaseLine rows (they have no lotId); purchase edits look up lots by batch+expiry.
--
-- After this script, run repair-inventory-lot-keys.sql to normalize expiry timestamps and list
-- purchase lines on open purchases that still have no matching lot.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    WITH dup_groups AS (
      SELECT
        il."storeId",
        il."productId",
        UPPER(TRIM(il."batchNo")) AS batch_no,
        il."expiryDate"::date AS expiry_date
      FROM "InventoryLot" il
      GROUP BY il."storeId", il."productId", UPPER(TRIM(il."batchNo")), il."expiryDate"::date
      HAVING COUNT(*) > 1
    ),
    ranked AS (
      SELECT
        il."id",
        il."storeId",
        il."productId",
        UPPER(TRIM(il."batchNo")) AS batch_no,
        il."expiryDate"::date AS expiry_date,
        il."quantity",
        ROW_NUMBER() OVER (
          PARTITION BY il."storeId", il."productId", UPPER(TRIM(il."batchNo")), il."expiryDate"::date
          ORDER BY il."quantity" DESC, il."createdAt" ASC, il."id" ASC
        ) AS rn
      FROM "InventoryLot" il
      JOIN dup_groups dg
        ON dg."storeId" = il."storeId"
       AND dg."productId" = il."productId"
       AND dg.batch_no = UPPER(TRIM(il."batchNo"))
       AND dg.expiry_date = il."expiryDate"::date
    ),
    keepers AS (
      SELECT "storeId", "productId", batch_no, expiry_date, "id" AS keep_id
      FROM ranked
      WHERE rn = 1
    ),
    drops AS (
      SELECT "id" AS drop_id, "storeId", "productId", batch_no, expiry_date, "quantity" AS drop_qty
      FROM ranked
      WHERE rn > 1
    )
    SELECT k.keep_id, d.drop_id, d.drop_qty
    FROM keepers k
    JOIN drops d
      ON d."storeId" = k."storeId"
     AND d."productId" = k."productId"
     AND d.batch_no = k.batch_no
     AND d.expiry_date = k.expiry_date
  LOOP
    UPDATE "SaleLine"
    SET "lotId" = rec.keep_id
    WHERE "lotId" = rec.drop_id;

    UPDATE "InventoryLot"
    SET "quantity" = "quantity" + rec.drop_qty
    WHERE "id" = rec.keep_id;

    DELETE FROM "InventoryLot"
    WHERE "id" = rec.drop_id;
  END LOOP;
END $$;

-- Align keeper timestamps with app convention (calendar yyyy-mm-dd at 12:00:00 UTC).
UPDATE "InventoryLot"
SET "expiryDate" = (
  to_char(("expiryDate" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') || 'T12:00:00Z'
)::timestamptz
WHERE "expiryDate" IS DISTINCT FROM (
  to_char(("expiryDate" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') || 'T12:00:00Z'
)::timestamptz;
