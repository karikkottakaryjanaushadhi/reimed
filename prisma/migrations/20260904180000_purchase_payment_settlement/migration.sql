-- Purchase supplier-bill settlement (payment mode, amount paid, paid date, UPI/card last-4)
ALTER TABLE "Purchase" ADD COLUMN "paymentMode" TEXT NOT NULL DEFAULT 'CASH';
ALTER TABLE "Purchase" ADD COLUMN "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Purchase" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "paymentRefLast4" VARCHAR(4);

CREATE INDEX "Purchase_storeId_paid_idx" ON "Purchase"("storeId", "paid");
