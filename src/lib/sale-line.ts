/**
 * Line gross when `qty` is in smallest units (e.g. tablets) and `rate` is the pack/strip MRP
 * for `packSize` units per pack. Value is **GST-inclusive** (printed MRP convention).
 *
 * Purchase taxable line uses the same fraction: see `purchaseLineNetAmount` (ex-GST cost/MRP per pack ÷ pack size).
 */
export function saleLineGrossAmount(qty: number, rate: number, packSize: number): number {
  const ps = Math.max(1, Math.trunc(packSize) || 1);
  return Math.round(((qty * rate) / ps) * 100) / 100;
}

export function saleLineCostAmount(qty: number, costPrice: number, packSize: number): number {
  return saleLineGrossAmount(qty, costPrice, packSize);
}

export function saleLineMarginAmount(amount: number, discountAmount: number, taxAmount: number, costAmount: number): number {
  return Math.round((amount - discountAmount - taxAmount - costAmount) * 100) / 100;
}

/** Margin % vs net revenue (gross − discount), same as Margin details report. */
export function saleLineMarginPercent(
  amount: number,
  discountAmount: number,
  taxAmount: number,
  qty: number,
  costPrice: number,
  packSize: number,
): number {
  const costAmount = saleLineCostAmount(qty, costPrice, packSize);
  const margin = saleLineMarginAmount(amount, discountAmount, taxAmount, costAmount);
  const netRevenue = Math.round(Math.max(0, amount - discountAmount) * 100) / 100;
  return netRevenue > 0 ? Math.round((margin / netRevenue) * 10000) / 100 : 0;
}

/**
 * Split a GST-**inclusive** rupee amount into extracted tax and net (excluding GST).
 * gst = inclusive × pct / (100 + pct)
 */
export function splitInclusiveGst(
  inclusiveAmount: number,
  gstPct: number,
): { gstAmount: number; netExclusive: number } {
  const inc = Math.round(inclusiveAmount * 100) / 100;
  if (inc <= 0 || gstPct <= 0) {
    return { gstAmount: 0, netExclusive: Math.max(0, inc) };
  }
  const gstAmount = Math.round(((inc * gstPct) / (100 + gstPct)) * 100) / 100;
  const netExclusive = Math.round((inc - gstAmount) * 100) / 100;
  return { gstAmount, netExclusive };
}

/** Recompute POS line money fields when only qty / discount % change (rate & GST % fixed). */
export function recalcSaleLineMoney(input: {
  qty: number;
  rate: number;
  packSize: number;
  discountPct: number;
  gstPct: number;
}): { amount: number; discountPct: number; discountAmount: number; gstPct: number; gstAmount: number } {
  const amount = saleLineGrossAmount(input.qty, input.rate, input.packSize);
  const discountPct = input.discountPct;
  const discountAmount = Math.round((amount * discountPct) / 100 * 100) / 100;
  const inclusiveAfterDiscount = Math.round((amount - discountAmount) * 100) / 100;
  const gstPctRaw = input.gstPct;
  const gstPct = Number.isFinite(gstPctRaw) ? gstPctRaw : 0;
  const { gstAmount } = splitInclusiveGst(inclusiveAfterDiscount, gstPct);
  return { amount, discountPct, discountAmount, gstPct, gstAmount };
}
