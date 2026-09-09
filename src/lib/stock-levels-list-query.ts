import { Prisma } from "@prisma/client";
import {
  inventoryLotExpiryAndClause,
  resolveExpiryFilter,
} from "@/lib/inventory-expiry-filter";
import {
  inventoryLotSearchAndClause,
  parseInventorySearch,
} from "@/lib/inventory-stock-expiry-search";
import { gstPctNumber } from "@/lib/product-gst-slabs";
import { prisma } from "@/lib/prisma";

export type StockLevelsSort =
  | "name"
  | "brand"
  | "productCategory"
  | "productType"
  | "gstPct"
  | "supplier"
  | "qty"
  | "reorderMin";

export type StockLevelsFilters = {
  q: string;
  supplierId: string;
  brandId: string;
  expiry: string;
  expiryOn: string;
  lowStock: boolean;
};

export type StockLevelsListParams = StockLevelsFilters & {
  storeId: string;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
};

export type StockLevelsListRow = {
  productId: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  productCategory: string;
  productType: string;
  gstPct: number;
  reorderMin: number;
  qty: number;
  supplier: string | null;
};

function toCount(n: unknown): number {
  if (typeof n === "bigint") return Number(n);
  if (typeof n === "number" && Number.isFinite(n)) return n;
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function parseStockLevelsSort(raw: unknown): StockLevelsSort {
  if (
    raw === "brand" ||
    raw === "productCategory" ||
    raw === "productType" ||
    raw === "gstPct" ||
    raw === "supplier" ||
    raw === "qty" ||
    raw === "reorderMin" ||
    raw === "name"
  ) {
    return raw;
  }
  return "name";
}

export function parseStockLevelsDir(raw: unknown): "asc" | "desc" {
  return raw === "asc" || raw === "desc" ? raw : "asc";
}

function stockSortOrder(sort: StockLevelsSort, dir: "asc" | "desc") {
  const tiebreak = Prisma.sql`, p."name" ASC, p."id" ASC`;
  switch (sort) {
    case "brand":
      return Prisma.sql`COALESCE(MAX(b."name"), '') ${Prisma.raw(dir)}${tiebreak}`;
    case "productCategory":
      return Prisma.sql`p."productCategory" ${Prisma.raw(dir)}${tiebreak}`;
    case "productType":
      return Prisma.sql`p."productType" ${Prisma.raw(dir)}${tiebreak}`;
    case "gstPct":
      return Prisma.sql`p."gstPct" ${Prisma.raw(dir)}${tiebreak}`;
    case "supplier":
      return Prisma.sql`COALESCE(string_agg(DISTINCT s."name", ', '), '') ${Prisma.raw(dir)}${tiebreak}`;
    case "qty":
      return Prisma.sql`COALESCE(SUM(il."quantity"), 0) ${Prisma.raw(dir)}${tiebreak}`;
    case "reorderMin":
      return Prisma.sql`p."reorderMin" ${Prisma.raw(dir)}${tiebreak}`;
    case "name":
    default:
      return Prisma.sql`p."name" ${Prisma.raw(dir)}, p."id" ASC`;
  }
}

function buildFilterClauses(filters: StockLevelsFilters) {
  const { preset: expiryPreset, expiryOnYmd: expiryOnFilter } = resolveExpiryFilter(
    filters.expiry,
    filters.expiryOn,
  );
  const search = parseInventorySearch(filters.q);
  return {
    searchClause: search ? inventoryLotSearchAndClause(search) : Prisma.sql``,
    supplierClause: filters.supplierId
      ? Prisma.sql`AND il."supplierId" = ${filters.supplierId}`
      : Prisma.sql``,
    brandClause: filters.brandId ? Prisma.sql`AND p."brandId" = ${filters.brandId}` : Prisma.sql``,
    expiryClause: inventoryLotExpiryAndClause({
      preset: expiryPreset,
      expiryOnYmd: expiryOnFilter,
    }),
    lowStockHavingClause: filters.lowStock
      ? Prisma.sql`HAVING COALESCE(SUM(il."quantity"), 0) <= p."reorderMin"`
      : Prisma.sql``,
  };
}

export async function resolveStockLevelsFilters(params: {
  storeId: string;
  q?: string;
  supplierId?: string;
  brandId?: string;
  expiry?: string;
  expiryOn?: string;
  lowStock?: boolean;
}): Promise<StockLevelsFilters> {
  const q = typeof params.q === "string" ? params.q : "";
  const rawSupplierId = params.supplierId?.trim() ?? "";
  const rawBrandId = params.brandId?.trim() ?? "";

  let supplierId = "";
  let brandId = "";
  const [supplierRow, brandRow] = await Promise.all([
    rawSupplierId
      ? prisma.supplier.findFirst({
          where: { id: rawSupplierId, inventoryLots: { some: { storeId: params.storeId } } },
          select: { id: true },
        })
      : Promise.resolve(null),
    rawBrandId
      ? prisma.brand.findFirst({
          where: { id: rawBrandId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (supplierRow) supplierId = rawSupplierId;
  if (brandRow) brandId = rawBrandId;

  return {
    q,
    supplierId,
    brandId,
    expiry: typeof params.expiry === "string" ? params.expiry : "",
    expiryOn: typeof params.expiryOn === "string" ? params.expiryOn : "",
    lowStock: params.lowStock === true,
  };
}

export async function countStockLevels(
  storeId: string,
  filters: StockLevelsFilters,
): Promise<number> {
  const clauses = buildFilterClauses(filters);
  const [row] = await prisma.$queryRaw<Array<{ c: unknown }>>(
    Prisma.sql`
      SELECT COUNT(*) AS c FROM (
        SELECT p."id"
        FROM "InventoryLot" il
        INNER JOIN "Product" p ON p."id" = il."productId"
        WHERE il."storeId" = ${storeId} AND il."quantity" >= 0
        ${clauses.searchClause}
        ${clauses.supplierClause}
        ${clauses.brandClause}
        ${clauses.expiryClause}
        GROUP BY p."id", p."reorderMin"
        ${clauses.lowStockHavingClause}
      ) t
    `,
  );
  return toCount(row?.c);
}

export async function queryStockLevels(params: {
  storeId: string;
  filters: StockLevelsFilters;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}): Promise<StockLevelsListRow[]> {
  const clauses = buildFilterClauses(params.filters);
  const sort = parseStockLevelsSort(params.sort);
  const dir = parseStockLevelsDir(params.dir);
  const limitClause =
    params.limit != null
      ? Prisma.sql`LIMIT ${params.limit} OFFSET ${params.offset ?? 0}`
      : Prisma.sql``;

  const rows = await prisma.$queryRaw<
    Array<{
      productId: string;
      name: string;
      reorderMin: unknown;
      qty: unknown;
      suppliers: string | null;
      brandId: string | null;
      brandName: string | null;
      productCategory: string;
      productType: string;
      gstPct: unknown;
    }>
  >(
    Prisma.sql`
      SELECT p."id" AS "productId", p."name" AS "name", p."reorderMin" AS "reorderMin",
             p."brandId" AS "brandId",
             MAX(b."name") AS "brandName",
             p."productCategory" AS "productCategory",
             p."productType" AS "productType",
             p."gstPct" AS "gstPct",
             COALESCE(SUM(il."quantity"), 0) AS "qty",
             NULLIF(string_agg(DISTINCT s."name", ', '), '') AS "suppliers"
      FROM "InventoryLot" il
      INNER JOIN "Product" p ON p."id" = il."productId"
      LEFT JOIN "Brand" b ON b."id" = p."brandId"
      LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
      WHERE il."storeId" = ${params.storeId} AND il."quantity" >= 0
      ${clauses.searchClause}
      ${clauses.supplierClause}
      ${clauses.brandClause}
      ${clauses.expiryClause}
      GROUP BY p."id", p."name", p."reorderMin", p."brandId", p."productCategory", p."productType", p."gstPct"
      ${clauses.lowStockHavingClause}
      ORDER BY ${stockSortOrder(sort, dir)}
      ${limitClause}
    `,
  );

  return rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    brandId: r.brandId,
    brandName: r.brandName?.trim() || null,
    productCategory: r.productCategory,
    productType: r.productType,
    gstPct: gstPctNumber(r.gstPct),
    reorderMin: toCount(r.reorderMin),
    qty: toCount(r.qty),
    supplier: r.suppliers?.trim() || null,
  }));
}
