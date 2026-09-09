import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { normalizeInventoryLotExpiryDate } from "@/lib/inventory-lot-expiry";
import { lotSalePricingFromPurchaseLine } from "@/lib/inventory-lot-pricing";
import {
  decrementInventoryLotStock,
  findInventoryLotByKey,
  findInventoryLotForPurchaseLineUndo,
  updateInventoryLotFromPurchase,
  upsertInventoryLotStockFromPurchase,
} from "@/lib/inventory-lot-upsert";
import { prisma } from "@/lib/prisma";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import { storeUpper } from "@/lib/store-text";

function apiErr(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.message;
  if (err instanceof Prisma.PrismaClientValidationError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not update line";
}

const patchLineSchema = z.object({
  productId: z.string().min(1),
  batchNo: z.string().min(1),
  expiryDate: z.string().min(1),
  quantity: z.number().int().positive(),
  costPrice: z.number().nonnegative(),
  mrp: z.number().nonnegative(),
  pack: z.number().int().min(1),
  purchaseDiscountPct: z.number().nonnegative(),
  purchaseDiscountRs: z.number().nonnegative(),
  schemeDiscountPct: z.number().nonnegative(),
  schemeDiscountRs: z.number().nonnegative(),
  salesDiscountPct: z.number().nonnegative(),
  salesDiscountRs: z.number().nonnegative(),
  freeQty: z.number().int().nonnegative(),
  gstPct: z.number().nonnegative(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id: purchaseId, lineId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = patchLineSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const storeId = ctx.activeStoreId;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const oldLine = await tx.purchaseLine.findFirst({
        where: {
          id: lineId,
          purchase: { id: purchaseId, storeId },
        },
        include: { purchase: { select: { id: true, supplierId: true, complete: true } } },
      });
      if (!oldLine) throw new Error("not_found");
      if (oldLine.purchase.complete) throw new Error("purchase_complete");
      const returnCount = await tx.purchaseReturn.count({
        where: { purchaseId, storeId },
      });
      if (returnCount > 0) throw new Error("purchase_has_returns");

      const productOk = await tx.product.findFirst({
        where: { id: parsed.data.productId },
        select: { id: true },
      });
      if (!productOk) throw new Error("invalid_product");

      let newExpiryDate: Date;
      try {
        newExpiryDate = normalizeInventoryLotExpiryDate(parsed.data.expiryDate);
      } catch {
        throw new Error("invalid_expiry");
      }

      const newBatch = storeUpper(parsed.data.batchNo);
      const oldStockIn = oldLine.quantity + oldLine.freeQty;
      const newStockIn = parsed.data.quantity + parsed.data.freeQty;

      const oldExpiryNorm = normalizeInventoryLotExpiryDate(oldLine.expiryDate);
      const sameLotIdentity =
        oldLine.productId === parsed.data.productId &&
        storeUpper(oldLine.batchNo) === newBatch &&
        oldExpiryNorm.getTime() === newExpiryDate.getTime();

      const oldLineLotKey = {
        storeId,
        productId: oldLine.productId,
        batchNo: oldLine.batchNo,
        expiryDate: oldLine.expiryDate,
      };

      const supplierId = oldLine.purchase.supplierId;
      const cp = new Prisma.Decimal(parsed.data.costPrice);
      const mrp = new Prisma.Decimal(parsed.data.mrp);
      const saleFields = lotSalePricingFromPurchaseLine({
        mrpPerPack: Number(parsed.data.mrp),
        salesDiscountPct: parsed.data.salesDiscountPct,
        salesDiscountRs: parsed.data.salesDiscountRs,
      });
      const lotPricing = {
        costPrice: cp,
        mrp,
        saleRate: new Prisma.Decimal(saleFields.saleRate),
        salesDiscountPct: new Prisma.Decimal(saleFields.salesDiscountPct),
        salesDiscountRs: new Prisma.Decimal(saleFields.salesDiscountRs),
      };

      if (sameLotIdentity) {
        const oldLot = await findInventoryLotByKey(tx, oldLineLotKey);
        if (!oldLot) {
          await upsertInventoryLotStockFromPurchase(tx, {
            storeId,
            productId: parsed.data.productId,
            batchNo: newBatch,
            expiryDate: newExpiryDate,
            supplierId,
            stockIn: newStockIn,
            packSize: Math.max(1, parsed.data.pack),
            pricing: lotPricing,
          });
        } else {
          const nextQty = oldLot.quantity + (newStockIn - oldStockIn);
          if (nextQty < 0) {
            throw new Error("insufficient_stock_for_correction");
          }
          await updateInventoryLotFromPurchase(tx, oldLot.id, {
            supplierId,
            quantity: nextQty,
            packSize: Math.max(1, parsed.data.pack),
            pricing: lotPricing,
          });
        }
      } else {
        const oldLot = await findInventoryLotForPurchaseLineUndo(tx, oldLineLotKey);
        if (!oldLot) throw new Error("inventory_lot_missing");
        if (oldLot.quantity < oldStockIn) {
          throw new Error("cannot_undo_line_stock");
        }
        await decrementInventoryLotStock(tx, {
          storeId,
          productId: oldLine.productId,
          batchNo: oldLot.batchNo,
          expiryDate: oldLot.expiryDate,
        }, oldStockIn);

        await upsertInventoryLotStockFromPurchase(tx, {
          storeId,
          productId: parsed.data.productId,
          batchNo: newBatch,
          expiryDate: newExpiryDate,
          supplierId,
          stockIn: newStockIn,
          packSize: Math.max(1, parsed.data.pack),
          pricing: lotPricing,
        });
      }

      const line = await tx.purchaseLine.update({
        where: { id: lineId },
        data: {
          productId: parsed.data.productId,
          batchNo: newBatch,
          expiryDate: newExpiryDate,
          quantity: parsed.data.quantity,
          freeQty: parsed.data.freeQty,
          pack: parsed.data.pack,
          costPrice: cp,
          mrp,
          purchaseDiscountPct: new Prisma.Decimal(parsed.data.purchaseDiscountPct),
          purchaseDiscountRs: new Prisma.Decimal(parsed.data.purchaseDiscountRs),
          schemeDiscountPct: new Prisma.Decimal(parsed.data.schemeDiscountPct),
          schemeDiscountRs: new Prisma.Decimal(parsed.data.schemeDiscountRs),
          salesDiscountPct: new Prisma.Decimal(parsed.data.salesDiscountPct),
          salesDiscountRs: new Prisma.Decimal(parsed.data.salesDiscountRs),
          gstPct: new Prisma.Decimal(snapProductGstPct(parsed.data.gstPct)),
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });

      await tx.product.update({
        where: { id: parsed.data.productId },
        data: { gstPct: snapProductGstPct(parsed.data.gstPct) },
      });

      return line;
    });

    return NextResponse.json({ line: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (msg === "purchase_complete") {
      return NextResponse.json(
        { error: "This purchase is finalized. Line changes are not allowed (view only)." },
        { status: 403 },
      );
    }
    if (msg === "purchase_has_returns") {
      return NextResponse.json(
        { error: "This purchase has returns. Lines cannot be changed." },
        { status: 403 },
      );
    }
    if (msg === "invalid_product") return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    if (msg === "invalid_expiry") return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    if (msg === "inventory_lot_missing") {
      return NextResponse.json(
        { error: "Stock batch for this line was not found — contact support." },
        { status: 409 },
      );
    }
    if (msg === "insufficient_stock_for_correction") {
      return NextResponse.json(
        {
          error:
            "Cannot reduce this line that far — some units were already sold or adjusted out of this batch.",
        },
        { status: 409 },
      );
    }
    if (msg === "cannot_undo_line_stock") {
      return NextResponse.json(
        {
          error:
            "Cannot move this line to another batch — not enough remaining stock on the original batch (already sold or adjusted).",
        },
        { status: 409 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: apiErr(e) }, { status: 400 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id: purchaseId, lineId } = await params;
  const storeId = ctx.activeStoreId;

  try {
    await prisma.$transaction(async (tx) => {
      const oldLine = await tx.purchaseLine.findFirst({
        where: {
          id: lineId,
          purchase: { id: purchaseId, storeId },
        },
        include: { purchase: { select: { complete: true } } },
      });
      if (!oldLine) throw new Error("not_found");
      if (oldLine.purchase.complete) throw new Error("purchase_complete");
      const returnCount = await tx.purchaseReturn.count({
        where: { purchaseId, storeId },
      });
      if (returnCount > 0) throw new Error("purchase_has_returns");

      const oldStockIn = oldLine.quantity + oldLine.freeQty;
      const oldLot = await findInventoryLotForPurchaseLineUndo(tx, {
        storeId,
        productId: oldLine.productId,
        batchNo: oldLine.batchNo,
        expiryDate: oldLine.expiryDate,
      });
      if (!oldLot) throw new Error("inventory_lot_missing");

      try {
        const undone = await decrementInventoryLotStock(
          tx,
          {
            storeId,
            productId: oldLine.productId,
            batchNo: oldLot.batchNo,
            expiryDate: oldLot.expiryDate,
          },
          oldStockIn,
        );
        if (!undone) throw new Error("inventory_lot_missing");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "insufficient_lot_stock") throw new Error("cannot_undo_line_stock");
        throw e;
      }

      await tx.purchaseLine.delete({ where: { id: lineId } });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (msg === "purchase_complete") {
      return NextResponse.json(
        { error: "This purchase is finalized. Line changes are not allowed (view only)." },
        { status: 403 },
      );
    }
    if (msg === "purchase_has_returns") {
      return NextResponse.json(
        { error: "This purchase has returns. Lines cannot be changed." },
        { status: 403 },
      );
    }
    if (msg === "inventory_lot_missing") {
      return NextResponse.json(
        { error: "Stock batch for this line was not found — contact support." },
        { status: 409 },
      );
    }
    if (msg === "cannot_undo_line_stock") {
      return NextResponse.json(
        {
          error:
            "Cannot remove this line — not enough remaining stock on the batch (already sold or adjusted).",
        },
        { status: 409 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: apiErr(e) }, { status: 400 });
  }
}
