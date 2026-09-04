import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import type { PaymentMode } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { purchaseBillTotalsFromLines } from "@/lib/purchase-line";
import {
  isPurchasePaymentMode,
  resolvePurchaseSettlement,
} from "@/lib/purchase-paid";
import { netPurchaseTotal } from "@/lib/purchase-return-aggregates";
import { snapProductGstPct } from "@/lib/product-gst-slabs";

const bodySchema = z.object({
  paid: z.boolean(),
  paymentMode: z.enum(["CASH", "CARD", "UPI", "CREDIT"]).optional(),
  /** yyyy-mm-dd when marking paid */
  paidAt: z.string().optional(),
  paymentRefLast4: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const storeId = ctx.activeStoreId;
  const purchase = await prisma.purchase.findFirst({
    where: { id, storeId },
    include: {
      lines: {
        select: {
          quantity: true,
          costPrice: true,
          pack: true,
          purchaseDiscountPct: true,
          purchaseDiscountRs: true,
          schemeDiscountPct: true,
          schemeDiscountRs: true,
          gstPct: true,
        },
      },
    },
  });
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const returnCredits = await prisma.purchaseReturn.aggregate({
    where: { purchaseId: id, storeId },
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
  const netTotal = netPurchaseTotal(billTotals.grandTotal, Number(returnCredits._sum.total ?? 0));

  const paymentMode: PaymentMode =
    parsed.data.paymentMode && isPurchasePaymentMode(parsed.data.paymentMode)
      ? parsed.data.paymentMode
      : isPurchasePaymentMode(purchase.paymentMode)
        ? (purchase.paymentMode as PaymentMode)
        : "CASH";

  const settlement = resolvePurchaseSettlement({
    paymentMode,
    paid: parsed.data.paid,
    netTotal,
    paidAtYmd: parsed.data.paidAt,
    paymentRefLast4: parsed.data.paymentRefLast4,
  });

  const updated = await prisma.purchase.update({
    where: { id: purchase.id },
    data: {
      paymentMode: settlement.paymentMode,
      paid: settlement.paid,
      amountPaid: new Prisma.Decimal(settlement.amountPaid.toFixed(2)),
      paidAt: settlement.paidAt,
      paymentRefLast4: settlement.paymentRefLast4,
    },
    select: {
      id: true,
      purchaseNo: true,
      paymentMode: true,
      paid: true,
      amountPaid: true,
      paidAt: true,
      paymentRefLast4: true,
    },
  });

  return NextResponse.json({
    purchase: {
      ...updated,
      amountPaid: Number(updated.amountPaid),
      paidAt: updated.paidAt?.toISOString() ?? null,
    },
  });
}
