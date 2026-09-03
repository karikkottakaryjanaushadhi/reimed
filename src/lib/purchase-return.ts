/**
 * GST-inclusive supplier credit for a partial purchase return, proportional to
 * the purchase line payable (trade qty only — free qty is not credited).
 */
export function returnLinePurchaseCreditInclusive(
  purchasedQty: number,
  returnQty: number,
  linePayable: number,
): number {
  if (purchasedQty <= 0 || returnQty <= 0) return 0;
  const inclusive = Math.round(linePayable * 100) / 100;
  if (inclusive <= 0) return 0;
  return Math.round(inclusive * (returnQty / purchasedQty) * 100) / 100;
}
