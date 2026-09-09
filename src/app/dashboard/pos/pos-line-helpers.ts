import { formatAppDateShortDmy } from "@/lib/app-timezone";
import { computePosSaleLineMoney } from "@/lib/sale-checkout-resolve";
import { saleDiscountFromMrpRate, saleRateFromMrpDiscountPct } from "@/lib/inventory-lot-pricing";
import { saleLineGrossAmount, splitInclusiveGst } from "@/lib/sale-line";
import type { CartLine, Lot } from "./cart-types";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** POS product search — sellable vs expired on-hand counts. */
export function posStockAvailabilityLabel(sellableQty: number, expiredQty: number): {
  text: string;
  tone: "ok" | "low" | "expired" | "mixed";
} {
  const sell = Math.max(0, Math.trunc(sellableQty) || 0);
  const exp = Math.max(0, Math.trunc(expiredQty) || 0);
  if (sell > 0 && exp > 0) {
    return { text: `${sell} stock · ${exp} expired`, tone: "mixed" };
  }
  if (sell > 0) return { text: `${sell} stock`, tone: "ok" };
  if (exp > 0) return { text: `${exp} expired`, tone: "expired" };
  return { text: "0 stock", tone: "low" };
}

export function posStockAvailabilityClass(tone: ReturnType<typeof posStockAvailabilityLabel>["tone"]): string {
  switch (tone) {
    case "expired":
      return "text-red-700 dark:text-red-400";
    case "mixed":
      return "text-amber-800 dark:text-amber-300";
    case "low":
      return "text-amber-700 dark:text-amber-400";
    default:
      return "text-zinc-700 dark:text-zinc-300";
  }
}

export function formatLotExpiry(iso: string): string {
  try {
    return formatAppDateShortDmy(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function effectiveSaleRatePerPackValues(mrp: number, saleRate?: number | null): number {
  if (saleRate != null && Number.isFinite(saleRate) && saleRate >= 0) return round2(saleRate);
  return round2(mrp);
}

export function effectiveSaleRatePerPack(lot: Lot): number {
  return effectiveSaleRatePerPackValues(lot.mrp, lot.saleRate);
}

function formatRupee(n: number): string {
  return `₹${round2(n).toFixed(2)}`;
}

function rupeeRangeLabel(min: number, max: number): string {
  const lo = round2(min);
  const hi = round2(max);
  if (hi <= lo) return formatRupee(lo);
  return `${formatRupee(lo)}–${formatRupee(hi)}`;
}

/** POS picker price — rate with MRP in parentheses when they differ. */
export function posRateMrpBracketLabel(rate: number, mrp: number): string {
  const r = round2(rate);
  const m = round2(mrp);
  if (r === m) return formatRupee(m);
  return `${formatRupee(r)} (${formatRupee(m)})`;
}

/** Product search — aggregate rate/MRP ranges across in-stock batches. */
export function posRateMrpBracketRangeLabel(
  rateMin: number,
  rateMax: number,
  mrpMin: number,
  mrpMax: number,
): string {
  const ratePart = rupeeRangeLabel(rateMin, rateMax);
  const mrpPart = rupeeRangeLabel(mrpMin, mrpMax);
  if (ratePart === mrpPart) return ratePart;
  return `${ratePart} (${mrpPart})`;
}

export function defaultRateForLot(lot: Lot): number {
  return effectiveSaleRatePerPack(lot);
}

export function nominalDiscountPctFromLot(lot: Lot): number {
  const p = lot.salesDiscountPct;
  if (p != null && Number.isFinite(p) && p > 0) return Math.min(100, Math.max(0, round2(p)));
  const rs = lot.salesDiscountRs;
  if (rs != null && Number.isFinite(rs) && rs > 0) {
    const mrp = round2(lot.mrp);
    if (mrp > 0) return Math.min(100, round2((rs / mrp) * 100));
  }
  return 0;
}

/** Apply sale discount % off printed MRP (same as Batches & expiry). Updates selling rate. */
export function applyMrpDiscountPctToLine(mrp: number, rawPct: number): { rate: number; discountPct: number } {
  let p = Number(rawPct);
  if (!Number.isFinite(p) || p < 0) p = 0;
  if (p > 100) p = 100;
  p = round2(p);
  return { rate: saleRateFromMrpDiscountPct(mrp, p), discountPct: p };
}

/** Apply total line discount amount vs MRP gross (Disc ₹ column). Updates selling rate. */
export function applyMrpDiscountAmountToLine(
  qty: number,
  mrp: number,
  packSize: number,
  lineDiscountAmount: number,
): { rate: number; discountPct: number } {
  const ps = Math.max(1, Math.trunc(packSize) || 1);
  const q = Math.max(1, qty);
  const grossMrp = saleLineGrossAmount(q, mrp, ps);
  let amt = Number(lineDiscountAmount);
  if (!Number.isFinite(amt) || amt < 0) amt = 0;
  const cap = round2(grossMrp);
  if (amt > cap) amt = cap;
  const lineInclusive = round2(grossMrp - amt);
  const rate = round2((lineInclusive * ps) / q);
  const { pct } = saleDiscountFromMrpRate(mrp, rate);
  return { rate, discountPct: pct };
}

/** Keep Disc% aligned when selling rate is edited directly (e.g. Amount column). */
export function syncMrpDiscountFields(mrp: number, rate: number): { rate: number; discountPct: number } {
  const r = round2(rate);
  return { rate: r, discountPct: saleDiscountFromMrpRate(mrp, r).pct };
}

export function effectiveLineDiscountPct(
  rate: number,
  mrp: number,
  nominalPct: number,
  discountFromLotOnly: boolean | undefined,
): number {
  let p = nominalPct;
  if (!Number.isFinite(p) || p < 0) p = 0;
  if (p > 100) p = 100;
  p = round2(p);
  if (discountFromLotOnly && round2(rate) < round2(mrp)) return 0;
  return p;
}

export function lineFinancials(
  qty: number,
  rate: number,
  packSize: number,
  discountPct: number,
  gstPct: number,
) {
  const gross = saleLineGrossAmount(qty, rate, packSize);
  const discountAmount = round2((gross * discountPct) / 100);
  const inclusiveAfterDiscount = round2(gross - discountAmount);
  const { gstAmount, netExclusive } = splitInclusiveGst(inclusiveAfterDiscount, gstPct);
  return {
    gross,
    discountAmount,
    taxable: netExclusive,
    gstAmount,
    lineInclusiveTotal: inclusiveAfterDiscount,
  };
}

export function posDiscountRupeeDisplay(
  qty: number,
  rate: number,
  mrp: number,
  packSize: number,
  discountPct: number,
  discountFromLotOnly: boolean | undefined,
  gstPct: number = 0,
): number {
  const eff = effectiveLineDiscountPct(rate, mrp, discountPct, discountFromLotOnly);
  return computePosSaleLineMoney({
    qty,
    rate,
    mrp,
    packSize,
    discountPctOffRate: eff,
    gstPct,
  }).discountAmount;
}

/** Recover POS Disc% off MRP from a saved sale line for edit mode. */
export function discountPctOffMrpFromSavedLine(input: { rate: number; mrp: number }): number {
  return saleDiscountFromMrpRate(input.mrp, input.rate).pct;
}

/** @deprecated Prefer discountPctOffMrpFromSavedLine — kept for legacy callers. */
export function discountPctOffRateFromSavedLine(input: {
  qty: number;
  rate: number;
  mrp: number;
  packSize: number;
  discountAmount: number;
}): number {
  const ps = Math.max(1, Math.trunc(input.packSize) || 1);
  const grossMrp = saleLineGrossAmount(input.qty, input.mrp, ps);
  const lineInclusive = round2(Math.max(0, grossMrp - input.discountAmount));
  const grossRate = saleLineGrossAmount(input.qty, input.rate, ps);
  if (grossRate <= 0) return 0;
  let p = round2((1 - lineInclusive / grossRate) * 100);
  if (!Number.isFinite(p) || p < 0) p = 0;
  if (p > 100) p = 100;
  return p;
}

export function cartQtyByLotId(cart: readonly CartLine[], lotId: string): number {
  return cart.find((x) => x.lotId === lotId)?.qty ?? 0;
}

export function cartQtyByProductId(cart: readonly CartLine[], productId: string): number {
  let sum = 0;
  for (const line of cart) {
    if (line.productId === productId) sum += line.qty;
  }
  return sum;
}

/** Shelf qty not already on the current bill (per lot). */
export function availableLotQty(shelfQty: number, cart: readonly CartLine[], lotId: string): number {
  return Math.max(0, shelfQty - cartQtyByLotId(cart, lotId));
}

/** Aggregate stock minus qty already on the current bill (all lots). */
export function availableProductStock(stockQty: number, cart: readonly CartLine[], productId: string): number {
  return Math.max(0, stockQty - cartQtyByProductId(cart, productId));
}

export function lotBillingPackSize(lot: Lot): number {
  const ps = lot.packSize ?? lot.product.packSize;
  return Math.max(1, Math.trunc(ps) || 1);
}

export function defaultQtyForLot(lot: Lot): number {
  const pack = lotBillingPackSize(lot);
  return Math.min(pack, Math.max(1, lot.quantity));
}

export function scrollChildIntoViewContainer(container: HTMLElement, child: HTMLElement) {
  const cTop = container.scrollTop;
  const cH = container.clientHeight;
  const top = child.offsetTop;
  const h = child.offsetHeight;
  if (top < cTop) container.scrollTop = top;
  else if (top + h > cTop + cH) container.scrollTop = top + h - cH;
}
