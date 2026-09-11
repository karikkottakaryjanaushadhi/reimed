import { differenceInCalendarDays, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import {
  expiryTintFromDays,
  inventoryLotExpiryAndClause,
  resolveExpiryFilter,
} from "@/lib/inventory-expiry-filter";
import {
  inventoryLotSearchIncludingBatchAndClause,
  parseInventorySearch,
} from "@/lib/inventory-stock-expiry-search";
import {
  inventoryLotExtraFilterClauses,
  parseInventoryLotQtyFilter,
  type InventoryLotQtyFilter,
} from "@/lib/inventory-filter-options";
import { lotPackSize } from "@/lib/inventory-lot-pack-size";
import { gstPctNumber } from "@/lib/product-gst-slabs";
import { parseProductCategoryFilter, parseProductScheduleFilter, parseProductTypeFilter } from "@/lib/products-filter-options";
import { prisma } from "@/lib/prisma";
import { type StockLevelsFilters } from "@/lib/stock-levels-list-query";

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
      return Prisma.sql`il."packSize" ${Prisma.raw(dir)}, p."name" ASC, il."batchNo" ASC`;
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

export type InventoryBatchesFilters = StockLevelsFilters & {
  category: string;
  type: string;
  schedule: string;
  qty: InventoryLotQtyFilter;
};

function buildBatchFilterClauses(filters: InventoryBatchesFilters) {
  const { preset: expiryPreset, expiryOnYmd: expiryOnFilter } = resolveExpiryFilter(
    filters.expiry,
    filters.expiryOn,
  );
  const search = parseInventorySearch(filters.q);
  const extra = inventoryLotExtraFilterClauses(filters);
  return {
    searchClause: search ? inventoryLotSearchIncludingBatchAndClause(search) : Prisma.sql``,
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
    extra,
  };
}

export async function resolveInventoryBatchesFilters(params: {
  storeId: string;
  q?: string;
  supplierId?: string;
  brandId?: string;
  expiry?: string;
  expiryOn?: string;
  lowStock?: boolean;
  category?: string;
  type?: string;
  schedule?: string;
  qty?: string;
}): Promise<InventoryBatchesFilters> {
  return {
    q: typeof params.q === "string" ? params.q : "",
    supplierId: params.supplierId?.trim() ?? "",
    brandId: params.brandId?.trim() ?? "",
    expiry: typeof params.expiry === "string" ? params.expiry : "",
    expiryOn: typeof params.expiryOn === "string" ? params.expiryOn : "",
    lowStock: params.lowStock === true,
    category: parseProductCategoryFilter(params.category),
    type: parseProductTypeFilter(params.type),
    schedule: parseProductScheduleFilter(params.schedule),
    qty: parseInventoryLotQtyFilter(params.qty),
  };
}

function toCount(n: unknown): number {
  if (typeof n === "bigint") return Number(n);
  if (typeof n === "number" && Number.isFinite(n)) return n;
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

type BatchSqlRow = {
  id: string;
  productId: string;
  productName: string;
  brandId: string | null;
  brandName: string | null;
  productCategory: string | null;
  gstPct: unknown;
  packSize: unknown;
  productPackSize: unknown;
  supplierName: string | null;
  batchNo: string;
  expiryDate: Date;
  quantity: unknown;
  reorderMin: unknown;
  costPrice: unknown;
  mrp: unknown;
  saleRate: unknown;
  salesDiscountPct: unknown;
  salesDiscountRs: unknown;
  stockCorrected: boolean;
  _total?: unknown;
};

function mapBatchRows(rows: BatchSqlRow[]): InventoryBatchListRow[] {
  const today = startOfDay(new Date());
  return rows.map((l) => {
    const d = differenceInCalendarDays(l.expiryDate, today);
    return {
      id: l.id,
      productId: l.productId,
      productName: l.productName,
      brandId: l.brandId,
      brandName: l.brandName?.trim() || null,
      productCategory: l.productCategory,
      gstPct: gstPctNumber(l.gstPct),
      packSize: lotPackSize({ packSize: l.packSize, product: { packSize: l.productPackSize } }),
      supplierName: l.supplierName,
      batchNo: l.batchNo,
      expiryDate: l.expiryDate.toISOString(),
      days: d,
      quantity: Number(l.quantity) || 0,
      reorderMin: Number(l.reorderMin) || 0,
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

function batchFilteredFromSql(
  storeId: string,
  clauses: ReturnType<typeof buildBatchFilterClauses>,
  sort: InventoryBatchesSort,
) {
  const sortBrandJoin =
    sort === "brand" ? Prisma.sql`LEFT JOIN "Brand" b ON b."id" = p."brandId"` : Prisma.sql``;
  const sortSupplierJoin =
    sort === "supplier" ? Prisma.sql`LEFT JOIN "Supplier" s ON s."id" = il."supplierId"` : Prisma.sql``;
  return Prisma.sql`
    FROM "InventoryLot" il
    INNER JOIN "Product" p ON p."id" = il."productId"
    ${sortBrandJoin}
    ${sortSupplierJoin}
    WHERE il."storeId" = ${storeId}
    ${clauses.searchClause}
    ${clauses.supplierClause}
    ${clauses.brandClause}
    ${clauses.expiryClause}
    ${clauses.lowStockClause}
    ${clauses.extra.categoryClause}
    ${clauses.extra.typeClause}
    ${clauses.extra.scheduleClause}
    ${clauses.extra.qtyClause}
  `;
}

async function fetchInventoryBatches(params: {
  storeId: string;
  filters: InventoryBatchesFilters;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
  includeTotalWindow?: boolean;
}): Promise<BatchSqlRow[]> {
  const clauses = buildBatchFilterClauses(params.filters);
  const sort = parseInventoryBatchesSort(params.sort);
  const dir = parseInventoryBatchesDir(params.dir);
  const limitClause =
    params.limit != null
      ? Prisma.sql`LIMIT ${params.limit} OFFSET ${params.offset ?? 0}`
      : Prisma.sql``;
  const totalCol = params.includeTotalWindow
    ? Prisma.sql`, COUNT(*) OVER() AS "_total"`
    : Prisma.sql``;
  const fromWhere = batchFilteredFromSql(params.storeId, clauses, sort);

  return prisma.$queryRaw<BatchSqlRow[]>(
    Prisma.sql`
      SELECT lot."id" AS "id",
             lot."productId" AS "productId",
             lot."productName" AS "productName",
             lot."brandId" AS "brandId",
             b."name" AS "brandName",
             lot."productCategory" AS "productCategory",
             lot."gstPct" AS "gstPct",
             lot."packSize" AS "packSize",
             lot."productPackSize" AS "productPackSize",
             s."name" AS "supplierName",
             lot."batchNo" AS "batchNo",
             lot."expiryDate" AS "expiryDate",
             lot."quantity" AS "quantity",
             lot."reorderMin" AS "reorderMin",
             lot."costPrice" AS "costPrice",
             lot."mrp" AS "mrp",
             lot."saleRate" AS "saleRate",
             lot."salesDiscountPct" AS "salesDiscountPct",
             lot."salesDiscountRs" AS "salesDiscountRs",
             lot."stockCorrected" AS "stockCorrected"
             ${params.includeTotalWindow ? Prisma.sql`, lot."_total" AS "_total"` : Prisma.sql``}
      FROM (
        SELECT il."id" AS "id",
               il."productId" AS "productId",
               p."name" AS "productName",
               p."brandId" AS "brandId",
               p."productCategory" AS "productCategory",
               p."gstPct" AS "gstPct",
               il."packSize" AS "packSize",
               p."packSize" AS "productPackSize",
               il."supplierId" AS "supplierId",
               il."batchNo" AS "batchNo",
               il."expiryDate" AS "expiryDate",
               il."quantity" AS "quantity",
               p."reorderMin" AS "reorderMin",
               il."costPrice" AS "costPrice",
               il."mrp" AS "mrp",
               il."saleRate" AS "saleRate",
               il."salesDiscountPct" AS "salesDiscountPct",
               il."salesDiscountRs" AS "salesDiscountRs",
               il."stockCorrected" AS "stockCorrected"
               ${totalCol}
        ${fromWhere}
        ORDER BY ${batchSortOrder(sort, dir)}
        ${limitClause}
      ) lot
      LEFT JOIN "Brand" b ON b."id" = lot."brandId"
      LEFT JOIN "Supplier" s ON s."id" = lot."supplierId"
    `,
  );
}

export async function countInventoryBatches(params: {
  storeId: string;
  filters: InventoryBatchesFilters;
}): Promise<number> {
  const clauses = buildBatchFilterClauses(params.filters);
  const [row] = await prisma.$queryRaw<Array<{ c: unknown }>>(
    Prisma.sql`
      SELECT COUNT(*) AS c
      ${batchFilteredFromSql(params.storeId, clauses, "productName")}
    `,
  );
  return toCount(row?.c);
}

export async function queryInventoryBatches(params: {
  storeId: string;
  filters: InventoryBatchesFilters;
  sort?: string;
  dir?: string;
  limit?: number;
  offset?: number;
}): Promise<InventoryBatchListRow[]> {
  const rows = await fetchInventoryBatches(params);
  return mapBatchRows(rows);
}

export async function queryInventoryBatchesPage(params: {
  storeId: string;
  filters: InventoryBatchesFilters;
  sort?: string;
  dir?: string;
  limit: number;
  offset: number;
}): Promise<{ rows: InventoryBatchListRow[]; total: number }> {
  if (params.offset <= 0) {
    const rows = await fetchInventoryBatches({ ...params, includeTotalWindow: true });
    return { rows: mapBatchRows(rows), total: toCount(rows[0]?._total) };
  }
  const [total, rows] = await Promise.all([
    countInventoryBatches({ storeId: params.storeId, filters: params.filters }),
    queryInventoryBatches(params),
  ]);
  return { rows, total };
}
