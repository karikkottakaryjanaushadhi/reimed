/** Rupee / percent helpers for MRP vs default sale rate on inventory lots. */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sale discount vs printed MRP when selling at `rate` per pack (before extra line tweaks). */
export function saleDiscountFromMrpRate(mrp: number, rate: number): { pct: number; rs: number } {
  if (!Number.isFinite(mrp) || mrp <= 0 || !Number.isFinite(rate) || rate < 0) return { pct: 0, rs: 0 };
  const rs = round2(Math.max(0, mrp - rate));
  const pct = round2(Math.min(100, (rs / mrp) * 100));
  return { pct, rs };
}

/** Implied rate per pack from MRP and sale discount %. */
export function saleRateFromMrpDiscountPct(mrp: number, pct: number): number {
  if (!Number.isFinite(mrp) || mrp <= 0 || !Number.isFinite(pct)) return 0;
  const p = Math.min(100, Math.max(0, pct));
  return round2(mrp * (1 - p / 100));
}

/**
 * Map purchase-line S.Disc (% / ₹ per pack) to inventory-lot sale pricing,
 * matching the inventory batch / POS model.
 */
export function lotSalePricingFromPurchaseLine(input: {
  mrpPerPack: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
}): { saleRate: number; salesDiscountPct: number; salesDiscountRs: number } {
  const mrp = Number(input.mrpPerPack);
  const pctIn = Math.min(100, Math.max(0, Number(input.salesDiscountPct) || 0));
  const rsPerPack = Math.max(0, Number(input.salesDiscountRs) || 0);

  if (!Number.isFinite(mrp) || mrp <= 0) {
    return { saleRate: 0, salesDiscountPct: 0, salesDiscountRs: 0 };
  }

  // Prefer ₹ discount over % — rounded % (e.g. 30/1330 → 2.26%) would drift rate (1299.94 vs 1300).
  if (rsPerPack > 0) {
    const rs = round2(Math.min(mrp, rsPerPack));
    const rate = round2(Math.max(0, mrp - rs));
    const d = saleDiscountFromMrpRate(mrp, rate);
    return { saleRate: rate, salesDiscountPct: d.pct, salesDiscountRs: d.rs };
  }

  if (pctIn > 0) {
    const rate = saleRateFromMrpDiscountPct(mrp, pctIn);
    const d = saleDiscountFromMrpRate(mrp, rate);
    return { saleRate: rate, salesDiscountPct: d.pct, salesDiscountRs: d.rs };
  }

  return { saleRate: mrp, salesDiscountPct: 0, salesDiscountRs: 0 };
}
