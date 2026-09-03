import { prisma } from "@/lib/prisma";

/** Sum of `PurchaseReturn.total` (GST-inclusive credits) per purchase id. Missing ids imply zero. */
export async function returnCreditsByPurchaseIds(
  storeId: string,
  purchaseIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (purchaseIds.length === 0) return map;
  const rows = await prisma.purchaseReturn.groupBy({
    by: ["purchaseId"],
    where: { storeId, purchaseId: { in: purchaseIds } },
    _sum: { total: true },
  });
  for (const row of rows) {
    map.set(row.purchaseId, Number(row._sum.total ?? 0));
  }
  return map;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function netPurchaseTotal(grossTotal: number, returnCredits: number): number {
  return roundMoney(grossTotal - returnCredits);
}
