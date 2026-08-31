-- One lot per store + product + batch + expiry. Run prisma/dedupe-inventory-lots.sql first if duplicates exist.

CREATE UNIQUE INDEX "InventoryLot_storeId_productId_batchNo_expiryDate_key"
ON "InventoryLot" ("storeId", "productId", "batchNo", "expiryDate");
