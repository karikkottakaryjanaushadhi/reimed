import { roundBillGrandTotal } from "./bill-round";
import { inventoryLotMarginPercent } from "./inventory-lot-margin";
import { saleDiscountFromMrpRate, lotSalePricingFromPurchaseLine } from "./inventory-lot-pricing";
import { snapProductGstPct } from "./product-gst-slabs";
import { saleLineGrossAmount } from "./sale-line";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function purchaseLinePackSize(line: { pack?: number }): number {
  return Math.max(1, Math.floor(Number(line.pack)) || 1);
}

/** Strip / pack count shown in purchase tables (stored quantity is smallest units). */
export function purchaseLineStripQty(line: { quantity: number; pack?: number }): number {
  const pk = purchaseLinePackSize(line);
  const q = Math.max(0, Math.floor(Number(line.quantity)) || 0);
  if (q <= 0) return 1;
  if (q % pk === 0) return q / pk;
  return Math.max(1, Math.floor(q / pk));
}

/** Free strip / pack count shown in purchase tables. */
export function purchaseLineFreeStripQty(line: { freeQty: number; pack?: number }): number {
  const pk = purchaseLinePackSize(line);
  const fq = Math.max(0, Math.floor(Number(line.freeQty)) || 0);
  if (fq <= 0) return 0;
  if (fq % pk === 0) return fq / pk;
  return Math.floor(fq / pk);
}

export function purchaseLineQuantityFromStrips(strips: number, pack?: number): number {
  const pk = purchaseLinePackSize({ pack });
  const s = Math.max(1, Math.floor(Number(strips)) || 1);
  return s * pk;
}

export function purchaseLineFreeQtyFromStrips(strips: number, pack?: number): number {
  const pk = purchaseLinePackSize({ pack });
  const s = Math.max(0, Math.floor(Number(strips)) || 0);
  return s * pk;
}

/** Keep strip counts when pack size changes. */
export function resyncPurchaseLineQuantityForPackChange<
  L extends { quantity: number; freeQty: number; pack: number },
>(line: L, newPack: number): Pick<L, "quantity" | "freeQty" | "pack"> {
  const pk = Math.max(1, Math.floor(Number(newPack)) || 1);
  const strips = purchaseLineStripQty(line);
  const freeStrips = purchaseLineFreeStripQty(line);
  return {
    pack: pk,
    quantity: purchaseLineQuantityFromStrips(strips, pk),
    freeQty: purchaseLineFreeQtyFromStrips(freeStrips, pk),
  } as Pick<L, "quantity" | "freeQty" | "pack">;
}

export function patchPurchaseLinePack<
  L extends {
    quantity: number;
    freeQty: number;
    pack: number;
    costPrice: number;
    mrp: number;
    schemeDiscountPct: number;
    schemeDiscountRs: number;
    purchaseDiscountPct: number;
    purchaseDiscountRs: number;
    salesDiscountPct: number;
    salesDiscountRs: number;
  },
>(line: L, newPack: number): Partial<L> {
  const qtyPatch = resyncPurchaseLineQuantityForPackChange(line, newPack);
  return resyncPurchaseLineDiscountPatches(line, qtyPatch as Partial<L>);
}

/** Line gross from trade rate (qty × rate ÷ pack), before purchase discount. */
export function purchaseLineCostGross(line: { quantity: number; costPrice: number; pack?: number }): number {
  const pk = Math.max(1, Math.floor(Number(line.pack)) || 1);
  const q = Number(line.quantity) || 0;
  const rate = Number.isFinite(line.costPrice) ? line.costPrice : 0;
  return saleLineGrossAmount(q, rate, pk);
}

function purchaseLineTradeDiscountAmount(
  gross: number,
  pct?: number,
  rs?: number,
): number {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const r = Math.max(0, Number(rs) || 0);
  const fromPct = round2((gross * p) / 100);
  return p > 0 ? fromPct : Math.min(gross, r);
}

/** Scheme discount amount on trade line gross. */
export function purchaseLineSchemeDiscountAmount(line: {
  quantity: number;
  costPrice: number;
  pack?: number;
  schemeDiscountPct?: number;
  schemeDiscountRs?: number;
}): number {
  return purchaseLineTradeDiscountAmount(
    purchaseLineCostGross(line),
    Number(line.schemeDiscountPct) || 0,
    Number(line.schemeDiscountRs) || 0,
  );
}

/** Trade line gross after scheme discount — base for purchase discount. */
export function purchaseLineTradeGrossAfterScheme(line: {
  quantity: number;
  costPrice: number;
  pack?: number;
  schemeDiscountPct?: number;
  schemeDiscountRs?: number;
}): number {
  const g = purchaseLineCostGross(line);
  const scheme = purchaseLineTradeDiscountAmount(
    g,
    Number(line.schemeDiscountPct) || 0,
    Number(line.schemeDiscountRs) || 0,
  );
  return Math.max(0, round2(g - scheme));
}

/** Purchase / trade discount amount on trade gross after scheme discount. */
export function purchaseLinePurchaseDiscountAmount(line: {
  quantity: number;
  costPrice: number;
  pack?: number;
  schemeDiscountPct?: number;
  schemeDiscountRs?: number;
  purchaseDiscountPct?: number;
  purchaseDiscountRs?: number;
}): number {
  return purchaseLineTradeDiscountAmount(
    purchaseLineTradeGrossAfterScheme(line),
    Number(line.purchaseDiscountPct) || 0,
    Number(line.purchaseDiscountRs) || 0,
  );
}

function resyncPurchaseDiscountAfterSchemeChange<
  L extends {
    quantity: number;
    costPrice: number;
    pack?: number;
    schemeDiscountPct?: number;
    schemeDiscountRs?: number;
    purchaseDiscountPct?: number;
    purchaseDiscountRs?: number;
  },
>(line: L): Partial<Pick<L, "purchaseDiscountPct" | "purchaseDiscountRs">> {
  if ((line.purchaseDiscountPct ?? 0) > 0) {
    return syncPurchaseDiscountFromPct(line, line.purchaseDiscountPct ?? 0) as Partial<
      Pick<L, "purchaseDiscountPct" | "purchaseDiscountRs">
    >;
  }
  if ((line.purchaseDiscountRs ?? 0) > 0) {
    return syncPurchaseDiscountFromRs(line, line.purchaseDiscountRs ?? 0) as Partial<
      Pick<L, "purchaseDiscountPct" | "purchaseDiscountRs">
    >;
  }
  return {};
}

/** Editing Sch% — fills Sch₹ from trade line gross (scheme discount). */
export function syncSchemeDiscountFromPct(
  line: {
    quantity: number;
    costPrice: number;
    pack?: number;
    purchaseDiscountPct?: number;
    purchaseDiscountRs?: number;
  },
  rawPct: number,
): {
  schemeDiscountPct: number;
  schemeDiscountRs: number;
  purchaseDiscountPct?: number;
  purchaseDiscountRs?: number;
} {
  let p = Number(rawPct);
  if (!Number.isFinite(p) || p < 0) p = 0;
  p = Math.min(100, p);
  const g = purchaseLineCostGross(line);
  const rs = p > 0 ? round2(g * (p / 100)) : 0;
  const scheme = { schemeDiscountPct: round2(p), schemeDiscountRs: rs };
  return { ...scheme, ...resyncPurchaseDiscountAfterSchemeChange({ ...line, ...scheme }) };
}

/** Editing Sch₹ — fills Sch% from rupee scheme discount on trade gross (capped at gross). */
export function syncSchemeDiscountFromRs(
  line: {
    quantity: number;
    costPrice: number;
    pack?: number;
    purchaseDiscountPct?: number;
    purchaseDiscountRs?: number;
  },
  rawRs: number,
): {
  schemeDiscountPct: number;
  schemeDiscountRs: number;
  purchaseDiscountPct?: number;
  purchaseDiscountRs?: number;
} {
  let rs = Number(rawRs);
  if (!Number.isFinite(rs) || rs < 0) rs = 0;
  const g = purchaseLineCostGross(line);
  rs = Math.min(g, rs);
  const p = g > 0 && rs > 0 ? Math.min(100, Math.max(0, round2((rs / g) * 100))) : 0;
  const scheme = { schemeDiscountPct: p, schemeDiscountRs: rs };
  return { ...scheme, ...resyncPurchaseDiscountAfterSchemeChange({ ...line, ...scheme }) };
}

/** Line gross from printed MRP (qty × MRP ÷ pack). Unused for S.Disc — retail discount is per pack. */
export function purchaseLineMrpGross(line: { quantity: number; mrp: number; pack?: number }): number {
  const pk = Math.max(1, Math.floor(Number(line.pack)) || 1);
  const q = Number(line.quantity) || 0;
  const rate = Number.isFinite(line.mrp) ? line.mrp : 0;
  return saleLineGrossAmount(q, rate, pk);
}

/** Editing P.Disc% — fills P.Disc₹ with the rupee equivalent of that % after scheme discount. */
export function syncPurchaseDiscountFromPct(
  line: {
    quantity: number;
    costPrice: number;
    pack?: number;
    schemeDiscountPct?: number;
    schemeDiscountRs?: number;
  },
  rawPct: number,
): { purchaseDiscountPct: number; purchaseDiscountRs: number } {
  let p = Number(rawPct);
  if (!Number.isFinite(p) || p < 0) p = 0;
  p = Math.min(100, p);
  const g = purchaseLineTradeGrossAfterScheme(line);
  const rs = p > 0 ? round2(g * (p / 100)) : 0;
  return { purchaseDiscountPct: round2(p), purchaseDiscountRs: rs };
}

/** Editing P.Disc₹ — fills P.Disc% from rupee discount after scheme discount (capped at that base). */
export function syncPurchaseDiscountFromRs(
  line: {
    quantity: number;
    costPrice: number;
    pack?: number;
    schemeDiscountPct?: number;
    schemeDiscountRs?: number;
  },
  rawRs: number,
): { purchaseDiscountPct: number; purchaseDiscountRs: number } {
  let rs = Number(rawRs);
  if (!Number.isFinite(rs) || rs < 0) rs = 0;
  const g = purchaseLineTradeGrossAfterScheme(line);
  rs = Math.min(g, rs);
  const p = g > 0 && rs > 0 ? Math.min(100, Math.max(0, round2((rs / g) * 100))) : 0;
  return { purchaseDiscountPct: p, purchaseDiscountRs: rs };
}

/** Editing S.Disc% — fills S.Disc₹ from % of printed MRP per pack (retail / POS pricing). */
export function syncSalesDiscountFromPct(
  line: { mrp: number },
  rawPct: number,
): { salesDiscountPct: number; salesDiscountRs: number } {
  let p = Number(rawPct);
  if (!Number.isFinite(p) || p < 0) p = 0;
  p = Math.min(100, p);
  const mrp = Number.isFinite(line.mrp) ? line.mrp : 0;
  const rs = p > 0 && mrp > 0 ? round2(mrp * (p / 100)) : 0;
  return { salesDiscountPct: round2(p), salesDiscountRs: rs };
}

/** Editing S.Disc₹ — fills S.Disc% from rupee discount per pack vs printed MRP. */
export function syncSalesDiscountFromRs(
  line: { mrp: number },
  rawRs: number,
): { salesDiscountPct: number; salesDiscountRs: number } {
  let rs = Number(rawRs);
  if (!Number.isFinite(rs) || rs < 0) rs = 0;
  const mrp = Number.isFinite(line.mrp) ? line.mrp : 0;
  rs = Math.min(mrp, rs);
  const p = mrp > 0 && rs > 0 ? Math.min(100, Math.max(0, round2((rs / mrp) * 100))) : 0;
  return { salesDiscountPct: p, salesDiscountRs: rs };
}

/** Projected margin % for one pack at the line sale rate — same as Batches & expiry / POS Mrg%. */
export function purchaseLineMarginPercent(line: {
  costPrice: number;
  mrp: number;
  pack?: number;
  salesDiscountPct?: number;
  salesDiscountRs?: number;
  gstPct?: number;
}): number | null {
  return inventoryLotMarginPercent(
    Number(line.costPrice),
    Number(line.mrp),
    purchaseLineSaleRatePerPack({
      mrp: Number(line.mrp),
      salesDiscountPct: Number(line.salesDiscountPct) || 0,
      salesDiscountRs: Number(line.salesDiscountRs) || 0,
    }),
    purchaseLinePackSize(line),
    snapProductGstPct(line.gstPct),
  );
}

/** Per-pack selling rate implied by MRP + S.Disc (same basis as {@link lotSalePricingFromPurchaseLine}). */
export function purchaseLineSaleRatePerPack(line: {
  mrp: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
}): number {
  const { saleRate } = lotSalePricingFromPurchaseLine({
    mrpPerPack: Number(line.mrp),
    salesDiscountPct: Number(line.salesDiscountPct) || 0,
    salesDiscountRs: Number(line.salesDiscountRs) || 0,
  });
  return saleRate;
}

/** Editing sale rate per pack — fills S.Disc% / S.Disc₹ like inventory batches (vs printed MRP). */
export function syncSalesDiscountFromRate(
  line: { mrp: number },
  rawRate: number,
): { salesDiscountPct: number; salesDiscountRs: number } {
  const mrp = Number(line.mrp);
  if (!Number.isFinite(mrp) || mrp <= 0) {
    return { salesDiscountPct: 0, salesDiscountRs: 0 };
  }
  const r = Number(rawRate);
  if (!Number.isFinite(r) || r < 0) {
    return { salesDiscountPct: 0, salesDiscountRs: 0 };
  }
  const capped = Math.min(mrp, r);
  const d = saleDiscountFromMrpRate(mrp, capped);
  return { salesDiscountPct: d.pct, salesDiscountRs: d.rs };
}

/** After qty / pack / cost / MRP change, keep linked % / ₹ columns consistent. */
export function resyncPurchaseLineDiscountPatches<
  L extends {
    quantity: number;
    costPrice: number;
    mrp: number;
    pack: number;
    schemeDiscountPct: number;
    schemeDiscountRs: number;
    purchaseDiscountPct: number;
    purchaseDiscountRs: number;
    salesDiscountPct: number;
    salesDiscountRs: number;
  },
>(line: L, patch: Partial<L>): Partial<L> {
  const next = { ...line, ...patch };
  let out: Partial<L> = { ...patch };
  let merged = next;
  if (patch.quantity !== undefined || patch.costPrice !== undefined || patch.pack !== undefined) {
    if ((merged.schemeDiscountPct ?? 0) > 0) {
      const schemePatch = syncSchemeDiscountFromPct(merged, merged.schemeDiscountPct);
      out = { ...out, ...schemePatch } as Partial<L>;
      merged = { ...merged, ...schemePatch };
    } else if ((merged.schemeDiscountRs ?? 0) > 0) {
      const schemePatch = syncSchemeDiscountFromRs(merged, merged.schemeDiscountRs);
      out = { ...out, ...schemePatch } as Partial<L>;
      merged = { ...merged, ...schemePatch };
    }
    if ((merged.purchaseDiscountPct ?? 0) > 0) {
      const purchasePatch = syncPurchaseDiscountFromPct(merged, merged.purchaseDiscountPct);
      out = { ...out, ...purchasePatch } as Partial<L>;
    } else if ((merged.purchaseDiscountRs ?? 0) > 0) {
      const purchasePatch = syncPurchaseDiscountFromRs(merged, merged.purchaseDiscountRs);
      out = { ...out, ...purchasePatch } as Partial<L>;
    }
  }
  if (patch.mrp !== undefined) {
    if ((next.salesDiscountPct ?? 0) > 0) {
      out = { ...out, ...syncSalesDiscountFromPct(next, next.salesDiscountPct) } as Partial<L>;
    } else if ((next.salesDiscountRs ?? 0) > 0) {
      out = { ...out, ...syncSalesDiscountFromRs(next, next.salesDiscountRs) } as Partial<L>;
    }
  }
  return out;
}

/**
 * Taxable purchase line value (ex-GST): scheme discount on trade gross, then purchase discount on the remainder.
 */
export function purchaseLineNetAmount(line: {
  quantity: number;
  costPrice: number;
  pack?: number;
  schemeDiscountPct?: number;
  schemeDiscountRs?: number;
  purchaseDiscountPct?: number;
  purchaseDiscountRs?: number;
}): number {
  const afterScheme = purchaseLineTradeGrossAfterScheme(line);
  const purchase = purchaseLineTradeDiscountAmount(
    afterScheme,
    Number(line.purchaseDiscountPct) || 0,
    Number(line.purchaseDiscountRs) || 0,
  );
  return Math.round(Math.max(0, afterScheme - purchase) * 100) / 100;
}

/** GST on the taxable line: taxable × gst% / 100 (added on top of trade value). */
export function purchaseLineGstAmount(line: {
  quantity: number;
  costPrice: number;
  pack?: number;
  schemeDiscountPct?: number;
  schemeDiscountRs?: number;
  purchaseDiscountPct?: number;
  purchaseDiscountRs?: number;
  gstPct?: number;
}): number {
  const taxable = purchaseLineNetAmount(line);
  const g = snapProductGstPct(line.gstPct);
  if (g <= 0 || taxable <= 0) return 0;
  return Math.round(taxable * (g / 100) * 100) / 100;
}

/** Payable line total = taxable (after purchase discounts) + GST. */
export function purchaseLineTotalWithGst(line: {
  quantity: number;
  costPrice: number;
  pack?: number;
  schemeDiscountPct?: number;
  schemeDiscountRs?: number;
  purchaseDiscountPct?: number;
  purchaseDiscountRs?: number;
  gstPct?: number;
}): number {
  return Math.round((purchaseLineNetAmount(line) + purchaseLineGstAmount(line)) * 100) / 100;
}

/** Bill footer aggregates (Net / Discount / GST / Grand) — same logic as new-purchase table `tfoot`. */
export function purchaseBillTotalsFromLines(
  lines: ReadonlyArray<{
    quantity: number;
    costPrice: number;
    pack?: number;
    schemeDiscountPct?: number;
    schemeDiscountRs?: number;
    purchaseDiscountPct?: number;
    purchaseDiscountRs?: number;
    gstPct?: number;
  }>,
): {
  netTotal: number;
  schemeDiscountTotal: number;
  purchaseDiscountTotal: number;
  gstTotal: number;
  payable: number;
  roundOff: number;
  grandTotal: number;
} {
  let netTotal = 0;
  let schemeDiscountTotal = 0;
  let purchaseDiscountTotal = 0;
  let gstTotal = 0;
  let payable = 0;
  for (const l of lines) {
    const net = purchaseLineNetAmount(l);
    netTotal += net;
    schemeDiscountTotal += purchaseLineSchemeDiscountAmount(l);
    purchaseDiscountTotal += purchaseLinePurchaseDiscountAmount(l);
    gstTotal += purchaseLineGstAmount(l);
    payable += purchaseLineTotalWithGst(l);
  }
  const rounded = roundBillGrandTotal(Math.round(payable * 100) / 100);
  return {
    netTotal: Math.round(netTotal * 100) / 100,
    schemeDiscountTotal: Math.round(schemeDiscountTotal * 100) / 100,
    purchaseDiscountTotal: Math.round(purchaseDiscountTotal * 100) / 100,
    gstTotal: Math.round(gstTotal * 100) / 100,
    payable: rounded.payable,
    roundOff: rounded.roundOff,
    grandTotal: rounded.total,
  };
}
