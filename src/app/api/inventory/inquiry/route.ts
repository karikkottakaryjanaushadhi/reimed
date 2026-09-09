import { NextResponse } from "next/server";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { getAuthContext } from "@/lib/auth-context";
import { lotPackSize } from "@/lib/inventory-lot-pack-size";
import { isInventoryLotExpired } from "@/lib/inventory-lot-expiry";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";
import type { ProductInquiry } from "@/lib/inventory-product-inquiry";

/** Product master + all batches at the active store (including zero qty / expired). */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = new URL(req.url).searchParams.get("productId")?.trim();
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const body = await withServerTimedCache(
    "inventory-inquiry",
    { storeId: ctx.activeStoreId, productId },
    5_000,
    async (): Promise<ProductInquiry | { error: "not_found" }> => {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          sku: true,
          genericName: true,
          hsn: true,
          gstPct: true,
          packSize: true,
          productCategory: true,
          productType: true,
          productSchedule: true,
          reorderMin: true,
          unit: true,
          brand: { select: { name: true } },
          lots: {
            where: { storeId: ctx.activeStoreId },
            select: {
              id: true,
              batchNo: true,
              expiryDate: true,
              quantity: true,
              costPrice: true,
              mrp: true,
              saleRate: true,
              salesDiscountPct: true,
              salesDiscountRs: true,
              packSize: true,
              supplier: { select: { name: true } },
            },
            orderBy: [{ expiryDate: "asc" }, { batchNo: "asc" }],
          },
        },
      });
      if (!product) return { error: "not_found" };

      const today = startOfDay(new Date());
      const productPack = { packSize: product.packSize };
      return {
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          genericName: product.genericName,
          brand: product.brand?.name ?? null,
          hsn: product.hsn,
          gstPct: Number(product.gstPct),
          packSize: product.packSize,
          productCategory: product.productCategory,
          productType: product.productType,
          productSchedule: product.productSchedule,
          reorderMin: product.reorderMin,
          unit: product.unit,
        },
        lots: product.lots.map((lot) => {
          const daysToExpiry = differenceInCalendarDays(lot.expiryDate, today);
          return {
            id: lot.id,
            batchNo: lot.batchNo,
            expiryDate: lot.expiryDate.toISOString(),
            quantity: lot.quantity,
            costPrice: Number(lot.costPrice),
            mrp: Number(lot.mrp),
            saleRate: Number(lot.saleRate),
            salesDiscountPct: Number(lot.salesDiscountPct),
            salesDiscountRs: Number(lot.salesDiscountRs),
            supplierName: lot.supplier?.name ?? null,
            packSize: lotPackSize({ packSize: lot.packSize, product: productPack }),
            daysToExpiry,
            expired: isInventoryLotExpired(lot.expiryDate),
          };
        }),
      };
    },
  );

  if ("error" in body) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, max-age=5, stale-while-revalidate=10",
    },
  });
}
