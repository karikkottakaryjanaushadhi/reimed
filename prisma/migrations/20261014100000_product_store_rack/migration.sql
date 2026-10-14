-- Per-shop shelf assignment. Rack codes stay shared.
CREATE TABLE "ProductStoreRack" (
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,

    CONSTRAINT "ProductStoreRack_pkey" PRIMARY KEY ("storeId","productId")
);

-- Today's catalog rack becomes the starting shelf in every shop.
INSERT INTO "ProductStoreRack" ("storeId", "productId", "rackId")
SELECT s."id", p."id", p."rackId"
FROM "Store" s
CROSS JOIN "Product" p
WHERE p."rackId" IS NOT NULL;

CREATE INDEX "ProductStoreRack_rackId_idx" ON "ProductStoreRack"("rackId");
CREATE INDEX "ProductStoreRack_productId_idx" ON "ProductStoreRack"("productId");

ALTER TABLE "ProductStoreRack" ADD CONSTRAINT "ProductStoreRack_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductStoreRack" ADD CONSTRAINT "ProductStoreRack_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductStoreRack" ADD CONSTRAINT "ProductStoreRack_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" DROP CONSTRAINT "Product_rackId_fkey";
DROP INDEX "Product_rackId_idx";
ALTER TABLE "Product" DROP COLUMN "rackId";
