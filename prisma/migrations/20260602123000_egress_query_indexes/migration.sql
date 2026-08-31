-- Reduce Supabase egress and query latency for high-frequency search/filter paths.
-- Safe, additive indexes only.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Product search endpoints: compact name/generic matching and SKU fuzzy lookup.
CREATE INDEX IF NOT EXISTS "Product_name_compact_trgm_idx"
  ON "Product" USING GIN (replace(lower("name"), ' ', '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_genericName_compact_trgm_idx"
  ON "Product" USING GIN (replace(lower(COALESCE("genericName", '')), ' ', '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_sku_lower_trgm_idx"
  ON "Product" USING GIN (lower("sku") gin_trgm_ops);

-- Brand search endpoint.
CREATE INDEX IF NOT EXISTS "Brand_name_compact_trgm_idx"
  ON "Brand" USING GIN (replace(lower("name"), ' ', '') gin_trgm_ops);

-- Supplier search endpoint.
CREATE INDEX IF NOT EXISTS "Supplier_name_compact_trgm_idx"
  ON "Supplier" USING GIN (replace(lower("name"), ' ', '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Supplier_company_compact_trgm_idx"
  ON "Supplier" USING GIN (replace(lower(COALESCE("company", '')), ' ', '') gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Supplier_gstin_compact_trgm_idx"
  ON "Supplier" USING GIN (replace(lower(COALESCE("gstin", '')), ' ', '') gin_trgm_ops);

-- Sales/Purchases filter-option endpoints that use "contains/ILIKE".
CREATE INDEX IF NOT EXISTS "Sale_doctorName_lower_trgm_idx"
  ON "Sale" USING GIN (lower(COALESCE("doctorName", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Sale_customerName_lower_trgm_idx"
  ON "Sale" USING GIN (lower(COALESCE("customerName", '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Purchase_invoiceRef_lower_trgm_idx"
  ON "Purchase" USING GIN (lower(COALESCE("invoiceRef", '')) gin_trgm_ops);
