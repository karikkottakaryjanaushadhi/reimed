-- Per-product GST % (EasyTab GST_MASTER.GSTRATE via product.GSTID); POS extracts tax from inclusive MRP.
ALTER TABLE "Product" ADD COLUMN "gstPct" DECIMAL(9, 3) NOT NULL DEFAULT 12;
