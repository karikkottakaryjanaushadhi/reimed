import { Prisma } from "@prisma/client";
import { EXPIRY_SOON_DAYS } from "@/lib/inventory-expiry-filter";
import { prisma } from "@/lib/prisma";

export type DashboardInventoryStats = {
  expiringSoon: number;
  expired: number;
  lowSku: number;
};

/** Lot expiry and low-stock counts for the dashboard home cards (SQL aggregates, no full-table scans). */
export async function getDashboardInventoryStats(
  storeId: string,
  today: Date,
): Promise<DashboardInventoryStats> {
  const soonEnd = new Date(today);
  soonEnd.setDate(soonEnd.getDate() + EXPIRY_SOON_DAYS);

  const [expiryRow] = await prisma.$queryRaw<Array<{ expiringSoon: unknown; expired: unknown }>>(
    Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE il."expiryDate"::date >= ${today}::date
            AND il."expiryDate"::date <= ${soonEnd}::date
            AND il."quantity" > 0
        )::int AS "expiringSoon",
        COUNT(*) FILTER (WHERE il."expiryDate"::date < ${today}::date AND il."quantity" > 0)::int AS "expired"
      FROM "InventoryLot" il
      WHERE il."storeId" = ${storeId} AND il."quantity" >= 0
    `,
  );

  const [lowRow] = await prisma.$queryRaw<Array<{ lowSku: unknown }>>(
    Prisma.sql`
      SELECT COUNT(*)::int AS "lowSku"
      FROM (
        SELECT p."id"
        FROM "Product" p
        INNER JOIN "InventoryLot" il
          ON il."productId" = p."id" AND il."storeId" = ${storeId} AND il."quantity" >= 0
        GROUP BY p."id", p."reorderMin"
        HAVING COALESCE(SUM(il."quantity"), 0) > 0
           AND COALESCE(SUM(il."quantity"), 0) <= p."reorderMin"
      ) AS low_products
    `,
  );

  return {
    expiringSoon: Number(expiryRow?.expiringSoon) || 0,
    expired: Number(expiryRow?.expired) || 0,
    lowSku: Number(lowRow?.lowSku) || 0,
  };
}
