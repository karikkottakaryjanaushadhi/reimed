import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { decrementInventoryLotStock } from "@/lib/inventory-lot-upsert";
import { prisma } from "@/lib/prisma";
import { purchaseBillTotalsFromLines, purchaseLineTotalWithGst } from "@/lib/purchase-line";
import { returnLinePurchaseCreditInclusive } from "@/lib/purchase-return";
import { paidFlagAfterNetChange } from "@/lib/purchase-paid";
import { netPurchaseTotal } from "@/lib/purchase-return-aggregates";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import { storeUpperOpt } from "@/lib/store-text";

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
  creditNoteNo: z.string().max(120).optional(),
  /** yyyy-mm-dd */
  creditNoteDate: z.string().optional(),
  lines: z
    .array(
      z.object({
        purchaseLineId: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id: purchaseId } = await params;
  const storeId = ctx.activeStoreId;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const linesInput = parsed.data.lines.filter((l) => l.qty > 0);
  if (linesInput.length === 0) {
    return NextResponse.json({ error: "At least one line with qty is required" }, { status: 400 });
  }

  const byLineId = new Map<string, number>();
  for (const l of linesInput) {
    byLineId.set(l.purchaseLineId, (byLineId.get(l.purchaseLineId) ?? 0) + l.qty);
  }

  let creditNoteDate: Date | null = null;
  const cnDateRaw = parsed.data.creditNoteDate?.trim();
  if (cnDateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cnDateRaw)) {
      return NextResponse.json({ error: "Invalid credit note date" }, { status: 400 });
    }
    creditNoteDate = new Date(`${cnDateRaw}T12:00:00.000Z`);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, storeId },
        include: { lines: true },
      });
      if (!purchase) throw new Error("not_found");
      if (!purchase.complete) throw new Error("not_complete");

      const returnedAgg = await tx.purchaseReturnLine.groupBy({
        by: ["purchaseLineId"],
        where: { purchaseReturn: { purchaseId, storeId } },
        _sum: { qty: true },
      });
      const alreadyReturned = new Map<string, number>();
      for (const row of returnedAgg) {
        alreadyReturned.set(row.purchaseLineId, row._sum.qty ?? 0);
      }

      type Resolved = {
        purchaseLineId: string;
        productId: string;
        batchNo: string;
        expiryDate: Date;
        qty: number;
        creditTotal: number;
      };
      const resolved: Resolved[] = [];

      for (const [purchaseLineId, qty] of byLineId) {
        const line = purchase.lines.find((pl) => pl.id === purchaseLineId);
        if (!line) throw new Error("bad_line");

        const prev = alreadyReturned.get(purchaseLineId) ?? 0;
        const maxReturn = line.quantity - prev;
        if (qty > maxReturn) throw new Error("qty_exceeded");

        const linePayable = purchaseLineTotalWithGst({
          quantity: line.quantity,
          costPrice: Number(line.costPrice),
          pack: line.pack,
          schemeDiscountPct: Number(line.schemeDiscountPct),
          schemeDiscountRs: Number(line.schemeDiscountRs),
          purchaseDiscountPct: Number(line.purchaseDiscountPct),
          purchaseDiscountRs: Number(line.purchaseDiscountRs),
          gstPct: Number(line.gstPct),
        });
        const creditTotal = returnLinePurchaseCreditInclusive(line.quantity, qty, linePayable);
        resolved.push({
          purchaseLineId,
          productId: line.productId,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          qty,
          creditTotal,
        });
      }

      const totalNum = Math.round(resolved.reduce((s, r) => s + r.creditTotal, 0) * 100) / 100;
      if (totalNum <= 0) throw new Error("zero_total");

      for (const r of resolved) {
        const dec = await decrementInventoryLotStock(
          tx,
          {
            storeId,
            productId: r.productId,
            batchNo: r.batchNo,
            expiryDate: r.expiryDate,
          },
          r.qty,
        );
        if (!dec) throw new Error("lot_not_found");
      }

      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          storeId,
          purchaseId,
          createdById: ctx.user.id,
          note: parsed.data.note?.trim() || null,
          creditNoteNo: storeUpperOpt(parsed.data.creditNoteNo) ?? null,
          creditNoteDate,
          total: new Prisma.Decimal(totalNum.toFixed(2)),
          lines: {
            create: resolved.map((r) => ({
              purchaseLineId: r.purchaseLineId,
              qty: r.qty,
              creditTotal: new Prisma.Decimal(r.creditTotal.toFixed(2)),
            })),
          },
        },
      });

      const returnCreditsAgg = await tx.purchaseReturn.aggregate({
        where: { purchaseId, storeId },
        _sum: { total: true },
      });
      const billTotals = purchaseBillTotalsFromLines(
        purchase.lines.map((line) => ({
          quantity: line.quantity,
          costPrice: Number(line.costPrice),
          pack: line.pack,
          purchaseDiscountPct: Number(line.purchaseDiscountPct),
          purchaseDiscountRs: Number(line.purchaseDiscountRs),
          schemeDiscountPct: Number(line.schemeDiscountPct),
          schemeDiscountRs: Number(line.schemeDiscountRs),
          gstPct: snapProductGstPct(line.gstPct),
        })),
      );
      const newNet = netPurchaseTotal(
        billTotals.grandTotal,
        Number(returnCreditsAgg._sum.total ?? 0),
      );
      const nextPaid = paidFlagAfterNetChange(
        Number(purchase.amountPaid),
        newNet,
        purchase.paid,
      );
      if (nextPaid !== purchase.paid) {
        await tx.purchase.update({
          where: { id: purchaseId },
          data: { paid: nextPaid },
        });
      }

      return purchaseReturn;
    });

    return NextResponse.json({
      purchaseReturn: {
        id: result.id,
        total: Number(result.total),
        createdAt: result.createdAt.toISOString(),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (msg === "not_complete") {
      return NextResponse.json(
        { error: "Finalize the purchase before recording a return" },
        { status: 400 },
      );
    }
    if (msg === "bad_line") {
      return NextResponse.json({ error: "Line does not belong to this purchase" }, { status: 400 });
    }
    if (msg === "qty_exceeded") {
      return NextResponse.json(
        { error: "Return quantity exceeds what is left on one or more lines" },
        { status: 400 },
      );
    }
    if (msg === "zero_total") {
      return NextResponse.json({ error: "Computed credit total is zero" }, { status: 400 });
    }
    if (msg === "lot_not_found") {
      return NextResponse.json(
        { error: "Batch not found in stock for one or more lines" },
        { status: 409 },
      );
    }
    if (msg === "insufficient_lot_stock") {
      return NextResponse.json(
        { error: "Not enough stock on hand to return one or more lines" },
        { status: 409 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: "Could not record purchase return" }, { status: 400 });
  }
}
