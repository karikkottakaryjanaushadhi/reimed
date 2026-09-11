-- Sales history filters: category/type/schedule on catalog lines, payment/unpaid/cashier on bills.
CREATE INDEX IF NOT EXISTS "Product_productCategory_idx" ON "Product" ("productCategory");
CREATE INDEX IF NOT EXISTS "Product_productType_idx" ON "Product" ("productType");
CREATE INDEX IF NOT EXISTS "Product_productSchedule_idx" ON "Product" ("productSchedule");
CREATE INDEX IF NOT EXISTS "Sale_storeId_paid_idx" ON "Sale" ("storeId", "paid");
CREATE INDEX IF NOT EXISTS "Sale_storeId_paymentMode_idx" ON "Sale" ("storeId", "paymentMode");
CREATE INDEX IF NOT EXISTS "Sale_createdById_idx" ON "Sale" ("createdById");
