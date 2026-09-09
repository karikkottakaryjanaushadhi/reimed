/** Units per pack for a batch; falls back to product default for legacy rows. */
export function lotPackSize(lot: {
  packSize?: unknown;
  product?: { packSize?: unknown };
}): number {
  const fromLot = Number(lot.packSize);
  if (Number.isFinite(fromLot) && fromLot > 0) {
    return Math.max(1, Math.trunc(fromLot));
  }
  return Math.max(1, Math.trunc(Number(lot.product?.packSize)) || 1);
}

/** Pack size stored on a sale line; falls back to product default for pre-migration bills. */
export function saleLinePackSize(line: {
  packSize?: unknown;
  product?: { packSize?: unknown };
}): number {
  const fromLine = Number(line.packSize);
  if (Number.isFinite(fromLine) && fromLine > 0) {
    return Math.max(1, Math.trunc(fromLine));
  }
  return Math.max(1, Math.trunc(Number(line.product?.packSize)) || 1);
}
