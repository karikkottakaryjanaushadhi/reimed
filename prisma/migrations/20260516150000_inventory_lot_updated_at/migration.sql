-- Track lot row changes; pricingUpdatedAt backfilled from createdAt for purchase-default ordering.
ALTER TABLE "InventoryLot" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "InventoryLot" SET "updatedAt" = "createdAt";

ALTER TABLE "InventoryLot" ADD COLUMN "pricingUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "InventoryLot" SET "pricingUpdatedAt" = "createdAt";
