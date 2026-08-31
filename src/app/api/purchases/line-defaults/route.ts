import { NextResponse } from "next/server";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { formatAppDateYmd, parseAppYmdStart } from "@/lib/app-timezone";
import { purchaseLineDefaultGstPct } from "@/lib/product-gst-slabs";
import { prisma } from "@/lib/prisma";

/** Latest batch / MRP / cost from inventory; S.Disc from lot with most recent sale-pricing edit (`pricingUpdatedAt`), else last purchase line. */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId")?.trim();
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const storeId = ctx.activeStoreId;
  const todayStart = parseAppYmdStart(formatAppDateYmd());
  if (!todayStart) return NextResponse.json({ error: "Invalid date" }, { status: 500 });

  const [product, lastLine, latestLot, latestValidLot, lastValidLine] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { packSize: true, gstPct: true },
    }),
    prisma.purchaseLine.findFirst({
      where: {
        productId,
        purchase: { storeId },
      },
      orderBy: { purchase: { createdAt: "desc" } },
    }),
    prisma.inventoryLot.findFirst({
      where: { storeId, productId },
      orderBy: [{ pricingUpdatedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.inventoryLot.findFirst({
      where: { storeId, productId, expiryDate: { gte: todayStart } },
      orderBy: [{ pricingUpdatedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.purchaseLine.findFirst({
      where: {
        productId,
        purchase: { storeId },
        expiryDate: { gte: todayStart },
      },
      orderBy: { purchase: { createdAt: "desc" } },
    }),
  ]);

  const batchNo = latestLot?.batchNo ?? lastLine?.batchNo ?? "";
  const expiryRaw = latestValidLot?.expiryDate ?? lastValidLine?.expiryDate;
  const expiryDate = expiryRaw ? formatAppDateYmd(expiryRaw) : "";
  const mrp = Number(latestLot?.mrp ?? lastLine?.mrp ?? 0);
  const costPrice = Number(latestLot?.costPrice ?? lastLine?.costPrice ?? 0);
  const lotSaleRate = latestLot != null ? Number(latestLot.saleRate) : NaN;
  const saleRate = Number.isFinite(lotSaleRate) && lotSaleRate > 0 ? lotSaleRate : undefined;

  return NextResponse.json({
    defaults: {
      batchNo,
      expiryDate,
      mrp,
      costPrice,
      pack: product?.packSize ?? lastLine?.pack ?? 1,
      purchaseDiscountPct: lastLine ? Number(lastLine.purchaseDiscountPct) : 0,
      purchaseDiscountRs: lastLine ? Number(lastLine.purchaseDiscountRs) : 0,
      schemeDiscountPct: lastLine ? Number(lastLine.schemeDiscountPct) : 0,
      schemeDiscountRs: lastLine ? Number(lastLine.schemeDiscountRs) : 0,
      salesDiscountPct: latestLot != null ? Number(latestLot.salesDiscountPct) : lastLine ? Number(lastLine.salesDiscountPct) : 0,
      salesDiscountRs: latestLot != null ? Number(latestLot.salesDiscountRs) : lastLine ? Number(lastLine.salesDiscountRs) : 0,
      saleRate,
      gstPct: purchaseLineDefaultGstPct({
        lastLineGst: lastLine?.gstPct,
        productGst: product?.gstPct,
      }),
      freeQty: 0,
    },
  });
}
