import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { roundBillGrandTotal, roundMoney } from "@/lib/bill-round";
import { isInventoryLotExpired } from "@/lib/inventory-lot-expiry";
import { lotPackSize } from "@/lib/inventory-lot-pack-size";
import { saleLineGrossAmount, splitInclusiveGst } from "@/lib/sale-line";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * POS line money: `amount` is GST-inclusive **MRP** line gross (matches bill "Subtotal (MRP lines)").
 * `discountAmount` is MRP gross minus the actual inclusive payable (rate line minus optional % off rate),
 * so batch **sale rate &lt; MRP** shows as discount even when extra `Disc%` is 0 (inventory sale discount).
 */
export function computePosSaleLineMoney(input: {
  qty: number;
  rate: number;
  mrp: number;
  packSize: number;
  discountPctOffRate: number;
  gstPct: number;
}): {
  amount: number;
  discountAmount: number;
  discountPct: number;
  gstAmount: number;
  netExclusive: number;
  lineInclusiveTotal: number;
  /** GST-inclusive gross at selling `rate` (qty × rate ÷ pack), before extra Disc%. */
  grossRate: number;
} {
  const ps = Math.max(1, Math.trunc(input.packSize) || 1);
  const q = input.qty;
  const mrp = Number.isFinite(input.mrp) ? input.mrp : 0;
  const rate = Number.isFinite(input.rate) ? input.rate : 0;
  let p = Number(input.discountPctOffRate);
  if (!Number.isFinite(p) || p < 0) p = 0;
  p = Math.min(100, round2(p));

  const grossMrp = saleLineGrossAmount(q, mrp, ps);
  const grossRate = saleLineGrossAmount(q, rate, ps);
  const extraOffRate = round2((grossRate * p) / 100);
  const lineInclusiveTotal = round2(grossRate - extraOffRate);
  const discountAmount = round2(Math.max(0, grossMrp - lineInclusiveTotal));
  const amount = grossMrp;
  const discountPct =
    amount > 0 && discountAmount > 0 ? Math.min(100, round2((discountAmount / amount) * 100)) : 0;

  const gstPctRaw = input.gstPct;
  const gstPct = Number.isFinite(gstPctRaw) ? gstPctRaw : 0;
  const { gstAmount, netExclusive } = splitInclusiveGst(lineInclusiveTotal, gstPct);

  return {
    amount,
    discountAmount,
    discountPct,
    gstAmount,
    netExclusive,
    lineInclusiveTotal,
    grossRate,
  };
}

/** Same shape as POS / POST /api/sales lines. */
export const posSaleLineInputSchema = z.object({
  productId: z.string().min(1),
  lotId: z.string().min(1),
  qty: z.number().int().positive(),
  rate: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
});

export type PosSaleLineInput = z.infer<typeof posSaleLineInputSchema>;

export type ResolvedPosSaleLineRow = {
  productId: string;
  lotId: string;
  qty: number;
  packSize: number;
  rate: number;
  amount: number;
  discountPct: number;
  discountAmount: number;
  gstPct: number;
  gstAmount: number;
};

/**
 * Validates lots, stock, and GST math for a new bill or a same-day line replacement.
 * Caller is responsible for any prior restocking of the old bill lines.
 */
export async function resolvePosSaleLinesInTransaction(
  tx: Prisma.TransactionClient,
  storeId: string,
  lines: PosSaleLineInput[],
): Promise<{
  resolved: ResolvedPosSaleLineRow[];
  subtotal: number;
  discount: number;
  tax: number;
  payable: number;
  roundOff: number;
  total: number;
}> {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let payableSum = 0;
  const resolved: ResolvedPosSaleLineRow[] = [];

  for (const line of lines) {
    const lot = await tx.inventoryLot.findUnique({
      where: { id: line.lotId },
      include: { product: { select: { packSize: true, gstPct: true } } },
    });
    if (!lot || lot.storeId !== storeId || lot.productId !== line.productId) {
      throw new Error("invalid_lot");
    }
    if (isInventoryLotExpired(lot.expiryDate)) throw new Error("expired_lot");
    if (lot.quantity < line.qty) throw new Error("short_stock");
    const packSize = lotPackSize(lot);
    const mrp = Number(lot.mrp);
    const gstPctRaw = Number(lot.product.gstPct);
    const gstPct = Number.isFinite(gstPctRaw) ? gstPctRaw : 0;
    const discountPctOffRate = line.discountPct ?? 0;
    const { amount, discountAmount, discountPct, gstAmount, lineInclusiveTotal } = computePosSaleLineMoney({
      qty: line.qty,
      rate: line.rate,
      mrp,
      packSize,
      discountPctOffRate,
      gstPct,
    });
    subtotal += amount;
    discount += discountAmount;
    tax += gstAmount;
    payableSum += lineInclusiveTotal;
    resolved.push({
      productId: line.productId,
      lotId: line.lotId,
      qty: line.qty,
      packSize,
      rate: line.rate,
      amount,
      discountPct,
      discountAmount,
      gstPct,
      gstAmount,
    });
  }

  const payable = roundMoney(payableSum);
  const { roundOff, total } = roundBillGrandTotal(payable);
  if (total < 0) throw new Error("negative_total");

  return {
    resolved,
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    tax: roundMoney(tax),
    payable,
    roundOff,
    total,
  };
}
