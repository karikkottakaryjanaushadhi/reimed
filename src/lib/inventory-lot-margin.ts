import { computePosSaleLineMoney } from "@/lib/sale-checkout-resolve";
import { saleLineMarginPercent } from "@/lib/sale-line";

/** Margin % for one pack at lot sale rate — same as Batches & expiry / POS Mrg%. */
export function inventoryLotMarginPercent(
  costPrice: number,
  mrp: number,
  saleRate: number,
  packSize: number,
  gstPct: number,
): number | null {
  const ps = Math.max(1, Math.trunc(packSize) || 1);
  if (!Number.isFinite(costPrice) || !Number.isFinite(mrp) || !Number.isFinite(saleRate) || ps < 1) {
    return null;
  }
  const m = computePosSaleLineMoney({
    qty: ps,
    rate: saleRate,
    mrp,
    packSize: ps,
    discountPctOffRate: 0,
    gstPct,
  });
  return saleLineMarginPercent(m.amount, m.discountAmount, m.gstAmount, ps, costPrice, ps);
}
