import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { upsertInventoryLotStockFromPurchase, findInventoryLotByKey } from "@/lib/inventory-lot-upsert";
import { lotSalePricingFromPurchaseLine } from "@/lib/inventory-lot-pricing";
import { isInventoryLotExpired } from "@/lib/inventory-lot-expiry";
import { isProductGstSlab, snapProductGstPct } from "@/lib/product-gst-slabs";
import { prisma } from "@/lib/prisma";
import { differenceInCalendarDays, startOfDay } from "date-fns";

const createSchema = z.object({
  productId: z.string().min(1),
  batchNo: z.string().min(1).max(120),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  quantity: z.number().int().positive(),
  freeQty: z.number().int().nonnegative().optional(),
  pack: z.number().int().min(1).optional(),
  costPrice: z.number().nonnegative(),
  mrp: z.number().nonnegative(),
  salesDiscountPct: z.number().nonnegative().max(100).optional(),
  salesDiscountRs: z.number().nonnegative().optional(),
  gstPct: z
    .number()
    .refine((n) => isProductGstSlab(n), { message: "Invalid GST %" })
    .optional(),
  supplierId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const expiringWithinDays = Number(searchParams.get("expiringWithin") ?? "90");
  const productId = searchParams.get("productId")?.trim();
  const inStockOnly = searchParams.get("inStockOnly") === "1";
  const today = startOfDay(new Date());

  const lots = await prisma.inventoryLot.findMany({
    where: {
      storeId: ctx.activeStoreId,
      ...(productId ? { productId } : {}),
      ...(inStockOnly ? { quantity: { gt: 0 } } : {}),
    },
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
      product: {
        select: { id: true, name: true, packSize: true, gstPct: true },
      },
      supplier: { select: { name: true } },
    },
    orderBy: [{ expiryDate: "asc" }, { batchNo: "asc" }],
  });

  const enriched = lots.map((lot) => {
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
      product: {
        id: lot.product.id,
        name: lot.product.name,
        packSize: lot.product.packSize,
        gstPct: Number(lot.product.gstPct),
      },
      daysToExpiry,
      expiringSoon: daysToExpiry >= 0 && daysToExpiry <= expiringWithinDays,
      expired: isInventoryLotExpired(lot.expiryDate),
    };
  });

  return NextResponse.json({ lots: enriched });
}

/** Manual stock entry (opening stock / adjustment without a purchase invoice). */
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const storeId = ctx.activeStoreId;
  const d = parsed.data;

  const product = await prisma.product.findUnique({
    where: { id: d.productId },
    select: { id: true },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  if (d.supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: d.supplierId },
      select: { id: true },
    });
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 400 });
  }

  const saleFields = lotSalePricingFromPurchaseLine({
    mrpPerPack: d.mrp,
    salesDiscountPct: d.salesDiscountPct ?? 0,
    salesDiscountRs: d.salesDiscountRs ?? 0,
  });
  const stockIn = d.quantity + (d.freeQty ?? 0);

  try {
    const lot = await prisma.$transaction(async (tx) => {
      await upsertInventoryLotStockFromPurchase(tx, {
        storeId,
        productId: d.productId,
        batchNo: d.batchNo,
        expiryDate: d.expiryDate,
        supplierId: d.supplierId ?? null,
        stockIn,
        pricing: {
          costPrice: new Prisma.Decimal(d.costPrice),
          mrp: new Prisma.Decimal(d.mrp),
          saleRate: new Prisma.Decimal(saleFields.saleRate),
          salesDiscountPct: new Prisma.Decimal(saleFields.salesDiscountPct),
          salesDiscountRs: new Prisma.Decimal(saleFields.salesDiscountRs),
        },
      });

      await tx.product.update({
        where: { id: d.productId },
        data: {
          ...(d.pack !== undefined ? { packSize: Math.max(1, d.pack) } : {}),
          ...(d.gstPct !== undefined ? { gstPct: snapProductGstPct(d.gstPct) } : {}),
        },
      });

      const lot = await findInventoryLotByKey(tx, {
        storeId,
        productId: d.productId,
        batchNo: d.batchNo,
        expiryDate: d.expiryDate,
      });
      if (!lot) throw new Error("lot_missing");

      return lot;
    });

    return NextResponse.json({
      lot: {
        id: lot.id,
        quantity: lot.quantity,
        batchNo: lot.batchNo,
        expiryDate: lot.expiryDate.toISOString(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "invalid_expiry") {
      return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not add stock" }, { status: 400 });
  }
}
