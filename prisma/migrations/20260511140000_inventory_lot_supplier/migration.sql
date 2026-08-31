-- Optional distributor per batch (purchase / EasyTab scode).
ALTER TABLE "InventoryLot" ADD COLUMN "supplierId" TEXT;

CREATE INDEX "InventoryLot_supplierId_idx" ON "InventoryLot"("supplierId");

ALTER TABLE "InventoryLot"
  ADD CONSTRAINT "InventoryLot_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
