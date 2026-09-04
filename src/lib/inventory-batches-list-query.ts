import { differenceInCalendarDays, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import {
  expiryTintFromDays,
  inventoryLotExpiryAndClause,
  resolveExpiryFilter,
} from "@/lib/inventory-expiry-filter";
import {
  inventoryLotSearchAndClause,
  parseInventorySearch,
} from "@/lib/inventory-stock-expiry-search";
import { gstPctNumber } from "@/lib/product-gst-slabs";
import { prisma } from "@/lib/prisma";
import {
  resolveStockLevelsFilters,
  type StockLevelsFilters,
} from "@/lib/stock-levels-list-query";

export type InventoryBatchesSort =
  | "productName"
  | "brand"
  | "productCategory"
  | "gstPct"
  | "packSize"
  | "supplier"
  | "batchNo"
  | "expiryDate"
  | "days"
  | "quantity"
  | "reorderMin"
  | "costPrice"
  | "mrp"
  | "saleRate"
  | "salesDiscountPct"
  | "salesDiscountRs"
  | "marginPercent"
  | "stockCorrected";

export type InventoryBatchListRow = {
  id: string;
  productId: string;
  productName: string;
  brandId: string | null;
  brandName: string | null;
  productCategory: string | null;
  gstPct: number;
  packSize: number;
  supplierName: string | null;
  batchNo: string;
  expiryDate: string;
  days: number;
  quantity: number;
  reorderMin: number;
  costPrice: number;
  mrp: number;
  saleRate: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  stockCorrected: boolean;
  expiryTint: "expired" | "soon" | "ok";
};

export function parseInventoryBatchesSort(raw: unknown): InventoryBatchesSort {
  if (
    raw === "brand" ||
    raw === "productCategory" ||
    raw === "gstPct" ||
    raw === "packSize" ||
    raw === "supplier" ||
    raw === "batchNo" ||
    raw === "expiryDate" ||
    raw === "days" ||
    raw === "quantity" ||
    raw === "reorderMin" ||
    raw === "costPrice" ||
    raw === "mrp" ||
    raw === "saleRate" ||
    raw === "salesDiscountPct" ||
    raw === "salesDiscountRs" ||
    raw === "marginPercent" ||
    raw === "stockCorrected" ||
    raw === "productName"
  ) {
    return raw;
  }
  return "productName";
}

export function parseInventoryBatchesDir(raw: unknown): "asc" | "desc" {
  return raw === "asc" || raw === "desc" ? raw : "asc";
}

function batchSortOrder(sort: InventoryBatchesSort, dir: "asc" | "desc") {
  switch (sort) {
    case "brand":
      return Prisma.sql`COALESCE(b."name", '') ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "productCategory":
      return Prisma.sql`p."productCategory" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "gstPct":
      return Prisma.sql`p."gstPct" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "packSize":
      return Prisma.sql`p."packSize" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "supplier":
      return Prisma.sql`COALESCE(s."name", '') ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "batchNo":
      return Prisma.sql`il."batchNo" ${Prisma.raw(dir)}, p."name" ASC`;
    case "expiryDate":
      return Prisma.sql`il."expiryDate" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "days":
      return Prisma.sql`il."expiryDate" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "quantity":
      return Prisma.sql`il."quantity" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "reorderMin":
      return Prisma.sql`p."reorderMin" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "costPrice":
      return Prisma.sql`il."costPrice" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "mrp":
      return Prisma.sql`il."mrp" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "saleRate":
      return Prisma.sql`il."saleRate" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "salesDiscountPct":
      return Prisma.sql`il."salesDiscountPct" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "salesDiscountRs":
      return Prisma.sql`il."salesDiscountRs" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "marginPercent":
      return Prisma.sql`
          CASE
            WHEN il."saleRate" > 0 THEN
              ROUND(
                (
                  il."saleRate"
                  - ROUND((il."saleRate" * COALESCE(p."gstPct", 0) / (100 + COALESCE(p."gstPct", 0)))::numeric, 2)
                  - il."costPrice"
                ) / il."saleRate" * 10000
              ) / 100
            ELSE 0
          END ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "stockCorrected":
      return Prisma.sql`il."stockCorrected" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
    case "productName":
    default:
      return Prisma.sql`p."name" ${Prisma.raw(dir)}, il."batchNo" ASC`;
  }
}

function buildBatchFilterClauses(filters: StockLevelsFilters) {
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
    lowStockClause: filters.lowStock
      ? Prisma.sql`AND il."quantity" <= p."reorderMin"`
      : Prisma.sql``,
  };
}

export { resolveStockLevelsFilters as resolveInventoryBatchesFilters };

export async function queryInventoryBatches(params: {
  storeId: string;
  filters: StockLevelsFilters;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}): Promise<InventoryBatchListRow[]> {
  const clauses = buildBatchFilterClauses(params.filters);
  const sort = parseInventoryBatchesSort(params.sort);
  const dir = parseInventoryBatchesDir(params.dir);
  const limitClause =
    params.limit != null
      ? Prisma.sql`LIMIT ${params.limit} OFFSET ${params.offset ?? 0}`
      : Prisma.sql``;

  const idRows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT il."id" AS "id"
      FROM "InventoryLot" il
      INNER JOIN "Product" p ON p."id" = il."productId"
      LEFT JOIN "Brand" b ON b."id" = p."brandId"
      LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
      WHERE il."storeId" = ${params.storeId}
      ${clauses.searchClause}
      ${clauses.supplierClause}
      ${clauses.brandClause}
      ${clauses.expiryClause}
      ${clauses.lowStockClause}
      ORDER BY ${batchSortOrder(sort, dir)}
      ${limitClause}
    `,
  );

  if (idRows.length === 0) return [];

  const idOrder = new Map(idRows.map((r, i) => [r.id, i]));
  const lots = await prisma.inventoryLot.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          brandId: true,
          productCategory: true,
          gstPct: true,
          packSize: true,
          reorderMin: true,
          brand: { select: { name: true } },
        },
      },
      supplier: { select: { name: true } },
    },
  });
  lots.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  const today = startOfDay(new Date());
  return lots.map((l) => {
    const d = differenceInCalendarDays(l.expiryDate, today);
    return {
      id: l.id,
      productId: l.productId,
      productName: l.product.name,
      brandId: l.product.brandId,
      brandName: l.product.brand?.name?.trim() || null,
      productCategory: l.product.productCategory,
      gstPct: gstPctNumber(l.product.gstPct),
      packSize: Math.max(1, Math.trunc(Number(l.product.packSize)) || 1),
      supplierName: l.supplier?.name ?? null,
      batchNo: l.batchNo,
      expiryDate: l.expiryDate.toISOString(),
      days: d,
      quantity: l.quantity,
      reorderMin: l.product.reorderMin,
      costPrice: Number(l.costPrice),
      mrp: Number(l.mrp),
      saleRate: Number(l.saleRate),
      salesDiscountPct: Number(l.salesDiscountPct),
      salesDiscountRs: Number(l.salesDiscountRs),
      stockCorrected: l.stockCorrected,
      expiryTint: expiryTintFromDays(d),
    };
  });
}
