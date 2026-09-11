-- Batches page search: compact batch-no matching (same expression as inventoryLotSearchIncludingBatchAndClause).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "InventoryLot_batchNo_compact_trgm_idx"
  ON "InventoryLot" USING GIN (replace(lower("batchNo"), ' ', '') gin_trgm_ops);
