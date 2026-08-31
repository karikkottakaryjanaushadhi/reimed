/** Allowed product GST % values (India slabs used in UI). */
export const PRODUCT_GST_SLABS = [0, 5, 18, 40] as const;

export type ProductGstSlab = (typeof PRODUCT_GST_SLABS)[number];

export function isProductGstSlab(n: number): n is ProductGstSlab {
  return (PRODUCT_GST_SLABS as readonly number[]).includes(n);
}

/** Normalize DB Decimal / float for comparison to slab integers. */
export function gstPctNumber(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

/** Default GST % for new purchase lines when product/catalog has no rate. */
export const DEFAULT_PURCHASE_GST_PCT = 5 as const satisfies ProductGstSlab;

/** GST for a new purchase line: last purchase rate, else catalog product rate, else 5%. */
export function purchaseLineDefaultGstPct(opts: {
  lastLineGst?: unknown;
  productGst?: unknown;
}): ProductGstSlab {
  if (opts.lastLineGst !== undefined && opts.lastLineGst !== null) {
    return snapProductGstPct(opts.lastLineGst);
  }
  const fromCatalog = snapProductGstPct(opts.productGst ?? 0);
  return fromCatalog !== 0 ? fromCatalog : DEFAULT_PURCHASE_GST_PCT;
}

/** Map legacy EasyTab / dump rates onto allowed product GST slabs (0, 5, 18, 40). */
export function snapProductGstPct(raw: unknown): ProductGstSlab {
  let n = gstPctNumber(raw);
  if (Math.abs(n - 12) < 1e-6) n = 5;
  if (Math.abs(n - 28) < 1e-6) n = 18;
  if (isProductGstSlab(n)) return n;
  let best: ProductGstSlab = 0;
  let bestDist = Infinity;
  for (const slab of PRODUCT_GST_SLABS) {
    const d = Math.abs(n - slab);
    if (d < bestDist) {
      bestDist = d;
      best = slab;
    }
  }
  return best;
}
