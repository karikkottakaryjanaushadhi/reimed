import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { storeUpper } from "@/lib/store-text";

const patchSchema = z
  .object({
    quantity: z.number().int().nonnegative().optional(),
    stockCorrected: z.boolean().optional(),
    batchNo: z.string().min(1).max(120).optional(),
    expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
    mrp: z.number().nonnegative().optional(),
    costPrice: z.number().nonnegative().optional(),
    salesDiscountPct: z.number().nonnegative().max(100).optional(),
    salesDiscountRs: z.number().nonnegative().optional(),
    saleRate: z.number().nonnegative().optional(),
    productName: z.string().min(1).max(500).optional(),
    packSize: z.number().int().min(1).optional(),
    reorderMin: z.number().int().nonnegative().optional(),
  })
  .refine(
    (d) =>
      d.quantity !== undefined ||
      d.stockCorrected !== undefined ||
      d.batchNo !== undefined ||
      d.expiryDate !== undefined ||
      d.mrp !== undefined ||
      d.costPrice !== undefined ||
      d.salesDiscountPct !== undefined ||
      d.salesDiscountRs !== undefined ||
      d.saleRate !== undefined ||
      d.productName !== undefined ||
      d.packSize !== undefined ||
      d.reorderMin !== undefined,
    { message: "Provide at least one field to update" },
  );

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const existing = await prisma.inventoryLot.findFirst({
    where: { id, storeId: ctx.activeStoreId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;
  const lotData: Prisma.InventoryLotUpdateInput = {};
  if (d.quantity !== undefined) lotData.quantity = d.quantity;
  if (d.stockCorrected !== undefined) lotData.stockCorrected = d.stockCorrected;
  if (d.batchNo !== undefined) lotData.batchNo = storeUpper(d.batchNo).slice(0, 120);
  if (d.expiryDate !== undefined) lotData.expiryDate = new Date(`${d.expiryDate}T12:00:00`);
  if (d.mrp !== undefined) lotData.mrp = new Prisma.Decimal(d.mrp);
  if (d.costPrice !== undefined) lotData.costPrice = new Prisma.Decimal(d.costPrice);
  if (d.salesDiscountPct !== undefined) lotData.salesDiscountPct = new Prisma.Decimal(d.salesDiscountPct);
  if (d.salesDiscountRs !== undefined) lotData.salesDiscountRs = new Prisma.Decimal(d.salesDiscountRs);
  if (d.saleRate !== undefined) lotData.saleRate = new Prisma.Decimal(d.saleRate);

  const pricingTouch =
    d.mrp !== undefined ||
    d.costPrice !== undefined ||
    d.salesDiscountPct !== undefined ||
    d.salesDiscountRs !== undefined ||
    d.saleRate !== undefined;
  if (pricingTouch) lotData.pricingUpdatedAt = new Date();

  const hasLotUpdates = Object.keys(lotData).length > 0;

  const updated = await prisma.$transaction(async (tx) => {
    if (d.productName !== undefined) {
      await tx.product.update({
        where: { id: existing.productId },
        data: { name: storeUpper(d.productName).slice(0, 500) },
      });
    }
    if (d.packSize !== undefined) {
      await tx.product.update({
        where: { id: existing.productId },
        data: { packSize: d.packSize },
      });
    }
    if (d.reorderMin !== undefined) {
      await tx.product.update({
        where: { id: existing.productId },
        data: { reorderMin: d.reorderMin },
      });
    }
    if (hasLotUpdates) {
      return tx.inventoryLot.update({
        where: { id },
        data: lotData,
      });
    }
    return tx.inventoryLot.findUniqueOrThrow({ where: { id } });
  });

  return NextResponse.json({
    lot: {
      id: updated.id,
      quantity: updated.quantity,
      stockCorrected: updated.stockCorrected,
      batchNo: updated.batchNo,
      expiryDate: updated.expiryDate.toISOString(),
      mrp: Number(updated.mrp),
      costPrice: Number(updated.costPrice),
      salesDiscountPct: Number(updated.salesDiscountPct),
      salesDiscountRs: Number(updated.salesDiscountRs),
      saleRate: Number(updated.saleRate),
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.inventoryLot.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    include: { _count: { select: { saleLines: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing._count.saleLines > 0) {
    return NextResponse.json(
      { error: "This batch is on a past bill and cannot be deleted." },
      { status: 409 },
    );
  }

  await prisma.inventoryLot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
