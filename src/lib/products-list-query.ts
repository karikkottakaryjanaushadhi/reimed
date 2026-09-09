import { Prisma } from "@prisma/client";
import { gstPctNumber } from "@/lib/product-gst-slabs";
import { prisma } from "@/lib/prisma";
import type { ProductListRow } from "@/lib/product-list-row";
import {
  productCatalogWhereParts,
  type ProductStockFilter,
} from "@/lib/products-filter-options";

export type { ProductListRow };
export type { ProductStockFilter };

export type ProductListSort =
  | "name"
  | "sku"
  | "brand"
  | "generic"
  | "supplier"
  | "packSize"
  | "reorderMin"
  | "gst"
  | "stock";

export type ProductListQueryParams = {
  storeId: string;
  q?: string;
  brand?: string;
  gst?: string;
  stock?: ProductStockFilter;
  category?: string;
  type?: string;
  schedule?: string;
  supplier?: string;
  sort?: string;
  dir?: string;
};

function productSortOrder(sort: ProductListSort, dir: "asc" | "desc", storeId: string) {
  const stockExpr = Prisma.sql`COALESCE(SUM(il."quantity") FILTER (WHERE il."storeId" = ${storeId}), 0)`;
  const tiebreak = Prisma.sql`, p."name" ASC, p."id" ASC`;
  switch (sort) {
    case "sku":
      return Prisma.sql`p."sku" ${Prisma.raw(dir)}${tiebreak}`;
    case "brand":
      return Prisma.sql`COALESCE(b."name", '') ${Prisma.raw(dir)}${tiebreak}`;
    case "generic":
      return Prisma.sql`COALESCE(p."genericName", '') ${Prisma.raw(dir)}${tiebreak}`;
    case "supplier":
      return Prisma.sql`COALESCE(string_agg(DISTINCT s."name", ', '), '') ${Prisma.raw(dir)}${tiebreak}`;
    case "packSize":
      return Prisma.sql`p."packSize" ${Prisma.raw(dir)}${tiebreak}`;
    case "reorderMin":
      return Prisma.sql`p."reorderMin" ${Prisma.raw(dir)}${tiebreak}`;
    case "gst":
      return Prisma.sql`p."gstPct" ${Prisma.raw(dir)}${tiebreak}`;
    case "stock":
      return Prisma.sql`${stockExpr} ${Prisma.raw(dir)}${tiebreak}`;
    case "name":
    default:
      return Prisma.sql`p."name" ${Prisma.raw(dir)}, p."id" ASC`;
  }
}

export function parseProductStockFilter(raw: unknown): ProductStockFilter {
  if (raw === "low" || raw === "out" || raw === "in") return raw;
  return "";
}

export function parseProductListSort(raw: unknown): ProductListSort {
  if (
    raw === "brand" ||
    raw === "supplier" ||
    raw === "packSize" ||
    raw === "reorderMin" ||
    raw === "sku" ||
    raw === "generic" ||
    raw === "gst" ||
    raw === "stock" ||
    raw === "name"
  ) {
    return raw;
  }
  return "name";
}

export function parseProductListDir(raw: unknown): "asc" | "desc" {
  return raw === "asc" || raw === "desc" ? raw : "asc";
}

function buildProductListSql(params: ProductListQueryParams) {
  const stock = parseProductStockFilter(params.stock);
  const sort = parseProductListSort(params.sort);
  const dir = parseProductListDir(params.dir);
  const storeId = params.storeId;
  const stockExpr = Prisma.sql`COALESCE(SUM(il."quantity") FILTER (WHERE il."storeId" = ${storeId}), 0)`;
  const whereSql = Prisma.join(productCatalogWhereParts(params), " AND ");

  let havingSql = Prisma.empty;
  if (stock === "low") {
    havingSql = Prisma.sql`HAVING ${stockExpr} <= p."reorderMin" AND p."reorderMin" > 0`;
  } else if (stock === "out") {
    havingSql = Prisma.sql`HAVING ${stockExpr} = 0`;
  } else if (stock === "in") {
    havingSql = Prisma.sql`HAVING ${stockExpr} > 0`;
  }

  return { whereSql, havingSql, stockExpr, sort, dir, storeId };
}

function mapProductListRows(
  productsRaw: Array<
    Omit<ProductListRow, "gstPct" | "packSize" | "reorderMin" | "stockQty"> & {
      gstPct: unknown;
      packSize: unknown;
      reorderMin: unknown;
      stockQty: unknown;
    }
  >,
): ProductListRow[] {
  return productsRaw.map((p) => ({
    productId: p.productId,
    sku: p.sku,
    name: p.name,
    genericName: p.genericName,
    productCategory: p.productCategory,
    productType: p.productType,
    productSchedule: p.productSchedule,
    brandId: p.brandId,
    brandName: p.brandName,
    packSize: Number(p.packSize) || 1,
    reorderMin: Number(p.reorderMin) || 0,
    gstPct: gstPctNumber(p.gstPct),
    stockQty: Number(p.stockQty) || 0,
    suppliers: p.suppliers,
  }));
}

export async function countProductList(params: ProductListQueryParams): Promise<number> {
  const { whereSql, havingSql } = buildProductListSql(params);
  const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM (
        SELECT p."id"
        FROM "Product" p
        LEFT JOIN "Brand" b ON b."id" = p."brandId"
        LEFT JOIN "InventoryLot" il ON il."productId" = p."id"
        LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
        WHERE ${whereSql}
        GROUP BY p."id", p."reorderMin"
        ${havingSql}
      ) sub
    `,
  );
  return Number(countRows[0]?.count ?? 0);
}

export async function queryProductList(
  params: ProductListQueryParams & { limit?: number; offset?: number },
): Promise<ProductListRow[]> {
  const { whereSql, havingSql, stockExpr, sort, dir, storeId } = buildProductListSql(params);
  const pagingSql =
    params.limit != null
      ? Prisma.sql`LIMIT ${params.limit} OFFSET ${params.offset ?? 0}`
      : Prisma.empty;

  const productsRaw = await prisma.$queryRaw<
    Array<
      Omit<ProductListRow, "gstPct" | "packSize" | "reorderMin" | "stockQty"> & {
        gstPct: unknown;
        packSize: unknown;
        reorderMin: unknown;
        stockQty: unknown;
      }
    >
  >(
    Prisma.sql`
      SELECT p."id" AS "productId",
             p."sku" AS "sku",
             p."name" AS "name",
             p."genericName" AS "genericName",
             p."productCategory" AS "productCategory",
             p."productType" AS "productType",
             p."productSchedule" AS "productSchedule",
             p."brandId" AS "brandId",
             p."packSize" AS "packSize",
             p."reorderMin" AS "reorderMin",
             p."gstPct" AS "gstPct",
             b."name" AS "brandName",
             ${stockExpr}::int AS "stockQty",
             NULLIF(string_agg(DISTINCT s."name", ', '), '') AS "suppliers"
      FROM "Product" p
      LEFT JOIN "Brand" b ON b."id" = p."brandId"
      LEFT JOIN "InventoryLot" il ON il."productId" = p."id"
      LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
      WHERE ${whereSql}
      GROUP BY p."id", p."sku", p."name", p."genericName", p."productCategory", p."productType", p."productSchedule", p."brandId", p."packSize", p."reorderMin", p."gstPct", b."name"
      ${havingSql}
      ORDER BY ${productSortOrder(sort, dir, storeId)}
      ${pagingSql}
    `,
  );

  return mapProductListRows(productsRaw);
}
