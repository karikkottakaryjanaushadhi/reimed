-- Product catalog category (generic medicines, stationery, ethical brands).
ALTER TABLE "Product" ADD COLUMN "productCategory" TEXT NOT NULL DEFAULT 'GENERIC';
