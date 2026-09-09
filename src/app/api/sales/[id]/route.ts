import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { type PaymentMode } from "@/lib/constants";
import { canEditSale } from "@/lib/sale-editable";
import { netSaleTotal } from "@/lib/sale-return-aggregates";
import {
  randomPlaceholderCustomerName,
  randomPlaceholderDoctorName,
} from "@/lib/sale-placeholders";
import { saleLinePackSize } from "@/lib/inventory-lot-pack-size";
import { posSaleLineInputSchema, resolvePosSaleLinesInTransaction } from "@/lib/sale-checkout-resolve";
import { defaultSalePaid, resolveSaleCashReceived } from "@/lib/sale-paid";
import { prisma } from "@/lib/prisma";
import { storeUpper, storeUpperOpt } from "@/lib/store-text";

const patchBodySchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  doctorName: z.string().optional(),
  paymentMode: z.enum(["CASH", "CARD", "UPI", "CREDIT"]).optional(),
  paid: z.boolean().optional(),
  cashReceived: z.number().nonnegative().nullable().optional(),
  lines: z.array(posSaleLineInputSchema).min(1),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = ctx.activeStoreId;

  const [sale, returnedAgg, returnTotalsAgg] = await Promise.all([
    prisma.sale.findFirst({
      where: { id, storeId },
      include: {
        store: { select: { name: true, phone: true, address: true, gstin: true } },
        createdBy: { select: { name: true } },
        lines: {
          include: {
            product: { select: { sku: true, name: true, packSize: true } },
            lot: { select: { batchNo: true, expiryDate: true, mrp: true, costPrice: true, quantity: true } },
          },
        },
      },
    }),
    prisma.saleReturnLine.groupBy({
      by: ["saleLineId"],
      where: { saleReturn: { saleId: id, storeId } },
      _sum: { qty: true },
    }),
    prisma.saleReturn.aggregate({
      where: { saleId: id, storeId },
      _sum: { total: true },
      _count: true,
    }),
  ]);
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const returnedByLine = new Map<string, number>();
  for (const row of returnedAgg) {
    returnedByLine.set(row.saleLineId, row._sum.qty ?? 0);
  }

  const returnCreditsTotal = Number(returnTotalsAgg._sum.total ?? 0);
  const returnCountAll = returnTotalsAgg._count;
  const billGross = Number(sale.total);
  const netTotal = netSaleTotal(billGross, returnCreditsTotal);

  const editable = canEditSale({ createdAt: sale.createdAt, returnCount: returnCountAll });

  return NextResponse.json({
    sale: {
      id: sale.id,
      billNo: sale.billNo,
      createdAt: sale.createdAt.toISOString(),
      editable,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      doctorName: sale.doctorName,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      tax: Number(sale.tax),
      total: billGross,
      returnCreditsTotal,
      returnCount: returnCountAll,
      netTotal,
      paymentMode: sale.paymentMode,
      paid: sale.paid,
      cashReceived: sale.cashReceived != null ? Number(sale.cashReceived) : null,
      store: { name: sale.store.name, phone: sale.store.phone, address: sale.store.address, gstin: sale.store.gstin },
      createdByName: sale.createdBy.name,
      lines: sale.lines.map((l) => {
        const returnedQty = returnedByLine.get(l.id) ?? 0;
        return {
          id: l.id,
          productId: l.productId,
          lotId: l.lotId,
          sku: l.product.sku,
          name: l.product.name,
          packSize: saleLinePackSize(l),
          batchNo: l.lot.batchNo,
          expiryDate: l.lot.expiryDate.toISOString(),
          mrp: Number(l.lot.mrp),
          costPrice: Number(l.lot.costPrice),
          lotQuantity: l.lot.quantity,
          qty: l.qty,
          returnedQty,
          returnableQty: Math.max(0, l.qty - returnedQty),
          rate: Number(l.rate),
          amount: Number(l.amount),
          discountPct: Number(l.discountPct),
          discountAmount: Number(l.discountAmount),
          gstPct: Number(l.gstPct),
          gstAmount: Number(l.gstAmount),
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
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const storeId = ctx.activeStoreId;
  const paymentMode = (parsed.data.paymentMode ?? "CASH") as PaymentMode;
  const paid = parsed.data.paid ?? defaultSalePaid(paymentMode);
  const cashReceived = resolveSaleCashReceived(paymentMode, parsed.data.cashReceived);

  const customerName = storeUpper(
    parsed.data.customerName?.trim() || randomPlaceholderCustomerName(),
  );
  const doctorName = storeUpper(parsed.data.doctorName?.trim() || randomPlaceholderDoctorName());

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id, storeId },
        select: {
          id: true,
          createdAt: true,
          lines: {
            select: {
              lotId: true,
              qty: true,
            },
          },
        },
      });
      if (!sale) throw new Error("not_found");

      const returnCount = await tx.saleReturn.count({
        where: { saleId: id, storeId },
      });
      if (!canEditSale({ createdAt: sale.createdAt, returnCount })) {
        throw new Error("not_editable");
      }

      for (const line of sale.lines) {
        await tx.inventoryLot.update({
          where: { id: line.lotId },
          data: { quantity: { increment: line.qty } },
        });
      }

      await tx.saleLine.deleteMany({ where: { saleId: id } });

      const { resolved, subtotal, discount, tax, total } = await resolvePosSaleLinesInTransaction(
        tx,
        storeId,
        parsed.data.lines,
      );

      const updated = await tx.sale.update({
        where: { id },
        data: {
          customerName,
          customerPhone: storeUpperOpt(parsed.data.customerPhone),
          doctorName,
          subtotal,
          discount,
          tax,
          total,
          paymentMode,
          paid,
          cashReceived,
          lines: {
            create: resolved.map((r) => ({
              productId: r.productId,
              lotId: r.lotId,
              qty: r.qty,
              packSize: r.packSize,
              rate: r.rate,
              amount: r.amount,
              discountPct: r.discountPct,
              discountAmount: r.discountAmount,
              gstPct: r.gstPct,
              gstAmount: r.gstAmount,
            })),
          },
        },
      });

      for (const r of resolved) {
        await tx.inventoryLot.update({
          where: { id: r.lotId },
          data: { quantity: { decrement: r.qty } },
        });
      }

      return updated;
    });

    return NextResponse.json({ sale: { id: result.id, billNo: result.billNo } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (msg === "not_editable") {
      return NextResponse.json(
        { error: "Only today's bills with no returns can be edited" },
        { status: 403 },
      );
    }
    if (msg === "short_stock") {
      return NextResponse.json({ error: "Insufficient stock for one or more lines" }, { status: 409 });
    }
    if (msg === "invalid_lot") {
      return NextResponse.json({ error: "Invalid batch line" }, { status: 400 });
    }
    if (msg === "expired_lot") {
      return NextResponse.json({ error: "Cannot bill expired batches" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not update sale" }, { status: 400 });
  }
}
