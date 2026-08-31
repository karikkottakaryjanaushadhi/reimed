import { prisma } from "@/lib/prisma";

/** Sum of `SaleReturn.total` (GST-inclusive credits) per sale id. Missing ids imply zero. */
export async function returnCreditsBySaleIds(
  storeId: string,
  saleIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (saleIds.length === 0) return map;
  const rows = await prisma.saleReturn.groupBy({
    by: ["saleId"],
    where: { storeId, saleId: { in: saleIds } },
    _sum: { total: true },
  });
  for (const row of rows) {
    map.set(row.saleId, Number(row._sum.total ?? 0));
  }
  return map;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bill-level discount % vs MRP subtotal (matches POS line discountPct logic). */
export function saleBillDiscountPct(subtotal: number, discount: number): number {
  if (subtotal <= 0 || discount <= 0) return 0;
  return Math.min(100, roundMoney((discount / subtotal) * 100));
}

export function formatSaleBillDiscount(subtotal: number, discount: number): string {
  if (discount <= 0) return "—";
  const pct = saleBillDiscountPct(subtotal, discount);
  return pct > 0 ? `₹${discount.toFixed(2)} (${pct.toFixed(2)}%)` : `₹${discount.toFixed(2)}`;
}

export function netSaleTotal(grossTotal: number, returnCredits: number): number {
  return roundMoney(grossTotal - returnCredits);
}

/** Approximate margin after returns: scale gross margin by net/gross revenue. */
export function netMarginProportional(grossMargin: number, grossTotal: number, netTotal: number): number {
  if (grossTotal <= 0) return 0;
  return roundMoney(grossMargin * (netTotal / grossTotal));
}
