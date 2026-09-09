import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { purchaseBillTotalsFromLines, purchaseLineTotalWithGst } from "@/lib/purchase-line";
import { netPurchaseTotal } from "@/lib/purchase-return-aggregates";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import { storeUpperOpt } from "@/lib/store-text";

const patchSchema = z
  .object({
    supplierId: z.string().min(1).optional(),
    invoiceRef: z.union([z.string(), z.null()]).optional(),
    /** yyyy-mm-dd or null to clear */
    invoiceDate: z.union([z.string(), z.null()]).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
    /** true = finalize purchase (view only); cannot be set back to false via API */
    complete: z.boolean().optional(),
  })
  .strict()
  .refine(
    (o) =>
      o.supplierId !== undefined ||
      o.invoiceRef !== undefined ||
      o.invoiceDate !== undefined ||
      o.notes !== undefined ||
      o.complete !== undefined,
    { message: "no_fields" },
  );

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id } = await params;
  const storeId = ctx.activeStoreId;
  const [purchase, returnedAgg, returnTotalsAgg] = await Promise.all([
    prisma.purchase.findFirst({
      where: { id, storeId },
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { name: true, email: true } },
        lines: {
          include: { product: { select: { id: true, name: true, sku: true } } },
          orderBy: { id: "asc" },
        },
      },
    }),
    prisma.purchaseReturnLine.groupBy({
      by: ["purchaseLineId"],
      where: { purchaseReturn: { purchaseId: id, storeId } },
      _sum: { qty: true },
    }),
    prisma.purchaseReturn.aggregate({
      where: { purchaseId: id, storeId },
      _sum: { total: true },
      _count: true,
    }),
  ]);
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const returnedByLine = new Map<string, number>();
  for (const row of returnedAgg) {
    returnedByLine.set(row.purchaseLineId, row._sum.qty ?? 0);
  }

  const returnCreditsTotal = Number(returnTotalsAgg._sum.total ?? 0);
  const returnCount = returnTotalsAgg._count;

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
  const netTotal = netPurchaseTotal(billTotals.grandTotal, returnCreditsTotal);

  return NextResponse.json({
    purchase: {
      ...purchase,
      returnCreditsTotal,
      returnCount,
      billGrandTotal: billTotals.grandTotal,
      netTotal,
      lines: purchase.lines.map((line) => {
        const returnedQty = returnedByLine.get(line.id) ?? 0;
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
        return {
          ...line,
          returnedQty,
          returnableQty: Math.max(0, line.quantity - returnedQty),
          linePayable,
        };
      }),
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.purchase.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    select: { id: true, complete: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;

  if (existing.complete) {
    return NextResponse.json(
      { error: "This purchase is finalized. No further changes are allowed (view only)." },
      { status: 403 },
    );
  }

  const returnCount = await prisma.purchaseReturn.count({
    where: { purchaseId: id, storeId: ctx.activeStoreId },
  });
  if (returnCount > 0) {
    return NextResponse.json(
      { error: "This purchase has returns and can no longer be edited." },
      { status: 403 },
    );
  }

  const supplierOk =
    d.supplierId === undefined
      ? true
      : !!(await prisma.supplier.findFirst({ where: { id: d.supplierId }, select: { id: true } }));
  if (!supplierOk) return NextResponse.json({ error: "Invalid supplier" }, { status: 400 });

  const purchase = await prisma.purchase.update({
    where: { id },
    data: {
      ...(d.supplierId !== undefined ? { supplierId: d.supplierId } : {}),
      ...(d.invoiceRef !== undefined
        ? { invoiceRef: d.invoiceRef === null ? null : storeUpperOpt(d.invoiceRef) ?? null }
        : {}),
      ...(d.invoiceDate !== undefined
        ? {
            invoiceDate:
              d.invoiceDate === null || d.invoiceDate === ""
                ? null
                : new Date(`${d.invoiceDate.trim()}T12:00:00.000Z`),
          }
        : {}),
      ...(d.notes !== undefined
        ? { notes: d.notes === null ? null : storeUpperOpt(d.notes) ?? null }
        : {}),
      ...(d.complete !== undefined ? { complete: d.complete } : {}),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      lines: {
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { id: "asc" },
      },
    },
  });

  return NextResponse.json({ purchase });
}
