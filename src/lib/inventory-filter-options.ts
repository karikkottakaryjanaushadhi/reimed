import { Prisma } from "@prisma/client";
import {
  inventoryLotExpiryAndClause,
  resolveExpiryFilter,
  type ExpiryPreset,
} from "@/lib/inventory-expiry-filter";
import {
  inventoryLotSearchAndClause,
  parseInventorySearch,
} from "@/lib/inventory-stock-expiry-search";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type InventoryFilterParams = {
  storeId: string;
  q?: string;
  supplierId?: string;
  brandId?: string;
  expiry?: string;
  expiryOn?: string;
  lowStock?: boolean;
};

type InventoryFilterExclude = "supplier" | "brand";

function buildInventoryLotClauses(params: InventoryFilterParams, exclude?: InventoryFilterExclude) {
  const storeId = params.storeId;
  const search = parseInventorySearch(params.q ?? "");
  const searchClause = search ? inventoryLotSearchAndClause(search) : Prisma.sql``;

  const supplierClause =
    exclude !== "supplier" && params.supplierId?.trim()
      ? Prisma.sql`AND il."supplierId" = ${params.supplierId.trim()}`
      : Prisma.sql``;

  const brandClause =
    exclude !== "brand" && params.brandId?.trim()
      ? Prisma.sql`AND p."brandId" = ${params.brandId.trim()}`
      : Prisma.sql``;

  const { preset, expiryOnYmd } = resolveExpiryFilter(params.expiry ?? "", params.expiryOn ?? "");
  const expiryClause = inventoryLotExpiryAndClause({ preset: preset as ExpiryPreset | "", expiryOnYmd });

  const lowStockSubquery = params.lowStock
    ? Prisma.sql`
        AND p."id" IN (
          SELECT p2."id"
          FROM "InventoryLot" il2
          INNER JOIN "Product" p2 ON p2."id" = il2."productId"
          WHERE il2."storeId" = ${storeId} AND il2."quantity" >= 0
          GROUP BY p2."id", p2."reorderMin"
          HAVING COALESCE(SUM(il2."quantity"), 0) <= p2."reorderMin" AND p2."reorderMin" > 0
        )
      `
    : Prisma.sql``;

  return { storeId, searchClause, supplierClause, brandClause, expiryClause, lowStockSubquery };
}

export async function getInventoryFilterOptions(params: InventoryFilterParams) {
  return withServerTimedCache(
    "inventory-filter-options",
    {
      storeId: params.storeId,
      q: params.q?.trim() ?? "",
      supplierId: params.supplierId?.trim() ?? "",
      brandId: params.brandId?.trim() ?? "",
      expiry: params.expiry?.trim() ?? "",
      expiryOn: params.expiryOn?.trim() ?? "",
      lowStock: !!params.lowStock,
    },
    20_000,
    async () => {
      const supplierClauses = buildInventoryLotClauses(params, "supplier");
      const brandClauses = buildInventoryLotClauses(params, "brand");

      const [supplierRows, brandRows] = await Promise.all([
        prisma.$queryRaw<Array<{ id: string; name: string }>>(
          Prisma.sql`
        SELECT DISTINCT s."id" AS "id", s."name" AS "name"
        FROM "InventoryLot" il
        INNER JOIN "Product" p ON p."id" = il."productId"
        INNER JOIN "Supplier" s ON s."id" = il."supplierId"
        WHERE il."storeId" = ${supplierClauses.storeId} AND il."quantity" >= 0
        ${supplierClauses.searchClause}
        ${supplierClauses.brandClause}
        ${supplierClauses.expiryClause}
        ${supplierClauses.lowStockSubquery}
        ORDER BY s."name" ASC
          `,
        ),
        prisma.$queryRaw<Array<{ id: string; name: string }>>(
          Prisma.sql`
        SELECT DISTINCT b."id" AS "id", b."name" AS "name"
        FROM "InventoryLot" il
        INNER JOIN "Product" p ON p."id" = il."productId"
        INNER JOIN "Brand" b ON b."id" = p."brandId"
        WHERE il."storeId" = ${brandClauses.storeId} AND il."quantity" >= 0
        ${brandClauses.searchClause}
        ${brandClauses.supplierClause}
        ${brandClauses.expiryClause}
        ${brandClauses.lowStockSubquery}
        ORDER BY b."name" ASC
          `,
        ),
      ]);

      return {
        suppliers: supplierRows.map((r) => ({ id: r.id, name: r.name })),
        brands: brandRows.map((r) => ({ id: r.id, name: r.name })),
      };
    },
  );
}
