-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT true;

-- Credit bills were unpaid until marked otherwise.
UPDATE "Sale" SET "paid" = false WHERE "paymentMode" = 'CREDIT';
