-- Purchase list filters: pay mode and recorded-by (catalog indexes already on Product).
CREATE INDEX IF NOT EXISTS "Purchase_storeId_paymentMode_idx" ON "Purchase" ("storeId", "paymentMode");
CREATE INDEX IF NOT EXISTS "Purchase_createdById_idx" ON "Purchase" ("createdById");
