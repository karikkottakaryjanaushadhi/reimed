import { Prisma } from "@prisma/client";
import { formatAppDateYmd, parseAppYmdStart } from "@/lib/app-timezone";
import { prisma } from "@/lib/prisma";
import {
  compactSearchKey,
  compareProductSearchRelevance,
  productSearchFieldsRelevanceScore,
} from "@/lib/search-normalize";
import { drugCodeSearchLikePattern } from "@/lib/drug-code";

export type AggregatedStockRow = {
  productId: string;
  sku: string;
  name: string;
  genericName: string | null;
  brand: string | null;
  supplier: string | null;
  packSize: number;
  gstPct: number;
  reorderMin: number;
  quantity: number;
  /** In-stock units on expired batches (non-sellable at POS). */
  expiredQuantity: number;
  lowStock: boolean;
  /** Null when no in-stock lots (quantity > 0). */
  mrpMin: number | null;
  mrpMax: number | null;
  rateMin: number | null;
  rateMax: number | null;
};

/** Per-product stock at a store (aggregated lots). Requires non-empty `q` or `productIds`. */
export async function aggregateStoreStock(params: {
  storeId: string;
  q?: string;
  productIds?: string[];
  /** When true, only count lots that are not past expiry (IST calendar day). */
  sellableOnly?: boolean;
}): Promise<AggregatedStockRow[]> {
  const q = params.q?.trim() ?? "";
  const todayStart = parseAppYmdStart(formatAppDateYmd());
  const sellableClause =
    params.sellableOnly && todayStart
      ? Prisma.sql`AND il."expiryDate" >= ${todayStart}`
      : Prisma.sql``;

  let matchedCte = Prisma.empty;
  let productIdClause = Prisma.sql``;

  if (q) {
    const needle = compactSearchKey(q).replace(/%/g, "").replace(/_/g, "");
    if (!needle) return [];
    const likePat = `%${needle}%`;
    const codePat = drugCodeSearchLikePattern(q);
    const skuSearchSql = codePat
      ? Prisma.sql`OR replace(lower(p."sku"), ' ', '') LIKE ${codePat}`
      : Prisma.empty;
    matchedCte = Prisma.sql`
      WITH matched AS (
        SELECT p."id" AS "id" FROM "Product" p
        WHERE replace(lower(p."name"), ' ', '') LIKE ${likePat}
           OR replace(lower(COALESCE(p."genericName", '')), ' ', '') LIKE ${likePat}
           ${skuSearchSql}
        LIMIT 200
      )
    `;
    productIdClause = Prisma.sql`AND il."productId" IN (SELECT "id" FROM matched)`;
  } else if (params.productIds?.length) {
    productIdClause = Prisma.sql`AND il."productId" IN (${Prisma.join(params.productIds)})`;
  } else {
    return [];
  }

  const quantityExpr =
    todayStart && !params.sellableOnly
      ? Prisma.sql`COALESCE(SUM(CASE WHEN il."expiryDate" >= ${todayStart} THEN il."quantity" ELSE 0 END), 0)::int`
      : Prisma.sql`COALESCE(SUM(il."quantity"), 0)::int`;

  const expiredQuantityExpr =
    todayStart && !params.sellableOnly
      ? Prisma.sql`COALESCE(SUM(CASE WHEN il."expiryDate" < ${todayStart} THEN il."quantity" ELSE 0 END), 0)::int`
      : Prisma.sql`0::int`;

  const rows = await prisma.$queryRaw<
    Array<{
      productId: string;
      sku: string;
      name: string;
      genericName: string | null;
      brand: string | null;
      supplier: string | null;
      packSize: unknown;
      gstPct: unknown;
      reorderMin: unknown;
      quantity: unknown;
      expiredQuantity: unknown;
      mrpMin: unknown;
      mrpMax: unknown;
      rateMin: unknown;
      rateMax: unknown;
    }>
  >(
    Prisma.sql`
      ${matchedCte}
      SELECT
        p."id" AS "productId",
        p."sku" AS "sku",
        p."name" AS "name",
        p."genericName" AS "genericName",
        b."name" AS "brand",
        NULLIF(string_agg(DISTINCT s."name", ', ' ORDER BY s."name"), '') AS "supplier",
        p."packSize" AS "packSize",
        p."gstPct" AS "gstPct",
        p."reorderMin" AS "reorderMin",
        ${quantityExpr} AS "quantity",
        ${expiredQuantityExpr} AS "expiredQuantity",
        MIN(CASE WHEN il."quantity" > 0 THEN il."mrp" END) AS "mrpMin",
        MAX(CASE WHEN il."quantity" > 0 THEN il."mrp" END) AS "mrpMax",
        MIN(
          CASE
            WHEN il."quantity" > 0 THEN
              CASE
                WHEN il."saleRate" IS NOT NULL AND il."saleRate" >= 0 THEN il."saleRate"
                ELSE il."mrp"
              END
          END
        ) AS "rateMin",
        MAX(
          CASE
            WHEN il."quantity" > 0 THEN
              CASE
                WHEN il."saleRate" IS NOT NULL AND il."saleRate" >= 0 THEN il."saleRate"
                ELSE il."mrp"
              END
          END
        ) AS "rateMax"
      FROM "InventoryLot" il
      INNER JOIN "Product" p ON p."id" = il."productId"
      LEFT JOIN "Brand" b ON b."id" = p."brandId"
      LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
      WHERE il."storeId" = ${params.storeId}
        AND il."quantity" >= 0
        ${productIdClause}
        ${sellableClause}
      GROUP BY p."id", p."sku", p."name", p."genericName", b."name", p."packSize", p."gstPct", p."reorderMin"
    `,
  );

  const mapped: AggregatedStockRow[] = rows.map((r) => {
    const quantity = Number(r.quantity) || 0;
    const expiredQuantity = Number(r.expiredQuantity) || 0;
    const reorderMin = Number(r.reorderMin) || 0;
    return {
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      genericName: r.genericName,
      brand: r.brand,
      supplier: r.supplier,
      packSize: Number(r.packSize) || 1,
      gstPct: Number(r.gstPct) || 0,
      reorderMin,
      quantity,
      expiredQuantity,
      lowStock: quantity <= reorderMin,
      mrpMin: r.mrpMin == null ? null : Number(r.mrpMin),
      mrpMax: r.mrpMax == null ? null : Number(r.mrpMax),
      rateMin: r.rateMin == null ? null : Number(r.rateMin),
      rateMax: r.rateMax == null ? null : Number(r.rateMax),
    };
  });

  if (q) {
    mapped.sort((a, b) => {
      const diff =
        productSearchFieldsRelevanceScore(q, a.name, a.genericName) -
        productSearchFieldsRelevanceScore(q, b.name, b.genericName);
      if (diff !== 0) return diff;
      return compareProductSearchRelevance(a.name, b.name, q);
    });
  } else {
    mapped.sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  return mapped;
}
