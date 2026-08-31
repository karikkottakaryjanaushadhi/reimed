/** Round to 2 decimal places (paise). */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** GST-inclusive payable from POS line rows (sum of line payables). */
export function salePayableFromLineAmounts(
  lines: ReadonlyArray<{ amount: number; discountAmount: number }>,
): number {
  let sum = 0;
  for (const l of lines) {
    sum += roundMoney(l.amount - l.discountAmount);
  }
  return roundMoney(sum);
}

/**
 * Nearest-rupee bill total (Indian retail convention).
 * `payable` is the 2dp GST-inclusive sum of line payables; `total` is what the customer pays.
 */
export function roundBillGrandTotal(payable: number): {
  payable: number;
  roundOff: number;
  total: number;
} {
  const p = roundMoney(payable);
  const total = Math.round(p);
  const roundOff = roundMoney(total - p);
  return { payable: p, roundOff, total };
}

/** Round-off on a saved bill (stored total minus line payable sum). */
export function saleBillRoundOff(payable: number, storedTotal: number): number {
  return roundMoney(storedTotal - roundMoney(payable));
}
