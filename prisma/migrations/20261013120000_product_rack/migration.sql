-- CreateTable
CREATE TABLE "Rack" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rack_code_key" ON "Rack"("code");

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "rackId" TEXT;

-- CreateIndex
CREATE INDEX "Product_rackId_idx" ON "Product"("rackId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
