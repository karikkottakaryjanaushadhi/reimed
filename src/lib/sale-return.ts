/**
 * GST-inclusive credit for a partial return, proportional to the billed line
 * (same basis as POS: line amount minus line discount).
 */
export function returnLineRefundInclusive(
  soldQty: number,
  returnQty: number,
  lineAmount: number,
  lineDiscountAmount: number,
): number {
  if (soldQty <= 0 || returnQty <= 0) return 0;
  const inclusive = Math.round((lineAmount - lineDiscountAmount) * 100) / 100;
  if (inclusive <= 0) return 0;
  return Math.round(inclusive * (returnQty / soldQty) * 100) / 100;
}
