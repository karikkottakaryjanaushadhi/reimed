import { Prisma } from "@prisma/client";
import { isPaymentMode, type PaymentMode } from "@/lib/constants";
import { createdAtDatetimeRange, sqlDateTimeRangeParts, sqlIlikePattern } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
import {
  parseProductCategoryFilter,
  parseProductScheduleFilter,
  parseProductTypeFilter,
} from "@/lib/products-filter-options";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export function parseSalePaymentModeFilter(raw: unknown): "" | PaymentMode {
  const v = String(raw ?? "").trim().toUpperCase();
  return isPaymentMode(v) ? v : "";
}

export type SalesFilterParams = {
  storeId: string;
  from?: string;
  to?: string;
  billNo?: string;
  doctor?: string;
  patient?: string;
  product?: string;
  brand?: string;
  category?: string;
  type?: string;
  schedule?: string;
  payment?: string;
  cashier?: string;
  /** When true, only bills with paid = false. */
  unpaid?: boolean;
};

function sqlLowerContainsPat(raw: string): string {
  return `%${raw.trim().toLowerCase().replace(/%/g, "").replace(/_/g, "")}%`;
}

type SalesFilterExclude = "doctor" | "patient" | "product" | "brand" | "cashier";

const BILL_NO_INT_MAX = 2_147_483_647;

/** Prefix ranges so "12" matches 12, 120, 1234 without CAST/LIKE on the int column. */
function billNoPrefixRanges(raw?: string): Array<{ gte: number; lte: number }> | undefined {
  const t = raw?.trim().replace(/^#+/, "") ?? "";
  if (!t) return undefined;
  if (!/^\d+$/.test(t)) return [{ gte: -1, lte: -1 }];
  const digits = t.replace(/^0+/, "") || "0";
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 0) return [{ gte: -1, lte: -1 }];
  const ranges: Array<{ gte: number; lte: number }> = [];
  for (let extra = 0; extra <= 10 - digits.length; extra++) {
    const factor = 10 ** extra;
    const low = n * factor;
    if (low > BILL_NO_INT_MAX) break;
    ranges.push({ gte: low, lte: Math.min(low + factor - 1, BILL_NO_INT_MAX) });
  }
  return ranges.length > 0 ? ranges : [{ gte: -1, lte: -1 }];
}

function billNoWhere(raw?: string): Prisma.SaleWhereInput | undefined {
  const ranges = billNoPrefixRanges(raw);
  if (!ranges) return undefined;
  if (ranges.length === 1) return { billNo: ranges[0] };
  return { OR: ranges.map((billNo) => ({ billNo })) };
}

function billNoSql(column: Prisma.Sql, raw?: string): Prisma.Sql | undefined {
  const ranges = billNoPrefixRanges(raw);
  if (!ranges) return undefined;
  return Prisma.sql`(${Prisma.join(
    ranges.map((r) => Prisma.sql`(${column} >= ${r.gte} AND ${column} <= ${r.lte})`),
    " OR ",
  )})`;
}

function saleLineProductWhere(
  params: SalesFilterParams,
  exclude?: SalesFilterExclude,
): Prisma.SaleLineWhereInput | undefined {
  const productName = exclude === "product" ? "" : (params.product?.trim() ?? "");
  const brand = exclude === "brand" ? "" : (params.brand?.trim() ?? "");
  const category = parseProductCategoryFilter(params.category);
  const type = parseProductTypeFilter(params.type);
  const schedule = parseProductScheduleFilter(params.schedule);
  if (!productName && !brand && !category && !type && !schedule) return undefined;

  const product: Prisma.ProductWhereInput = {};
  if (productName) product.name = { contains: productName, mode: "insensitive" };
  if (brand) product.brand = { name: { contains: brand, mode: "insensitive" } };
  if (category) product.productCategory = category;
  if (type) product.productType = type;
  if (schedule) product.productSchedule = schedule;
  return { product };
}

function saleLineProductSqlParts(params: SalesFilterParams, exclude?: SalesFilterExclude): Prisma.Sql[] {
  const productName = exclude === "product" ? "" : (params.product?.trim() ?? "");
  const brand = exclude === "brand" ? "" : (params.brand?.trim() ?? "");
  const category = parseProductCategoryFilter(params.category);
  const type = parseProductTypeFilter(params.type);
  const schedule = parseProductScheduleFilter(params.schedule);
  const parts: Prisma.Sql[] = [];
  if (productName) parts.push(Prisma.sql`p."name" ILIKE ${sqlIlikePattern(productName)}`);
  if (brand) parts.push(Prisma.sql`b."name" ILIKE ${sqlIlikePattern(brand)}`);
  if (category) parts.push(Prisma.sql`p."productCategory" = ${category}`);
  if (type) parts.push(Prisma.sql`p."productType" = ${type}`);
  if (schedule) parts.push(Prisma.sql`p."productSchedule" = ${schedule}`);
  return parts;
}

export function buildSalesFilterWhere(
  params: SalesFilterParams,
  exclude?: SalesFilterExclude,
): Prisma.SaleWhereInput {
  const billNo = billNoWhere(params.billNo);
  const dateFilter = billNo
    ? undefined
    : createdAtDatetimeRange(params.from || undefined, params.to || undefined);
  const payment = parseSalePaymentModeFilter(params.payment);
  const where: Prisma.SaleWhereInput = {
    storeId: params.storeId,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    ...billNo,
  };

  if (exclude !== "doctor" && params.doctor?.trim()) {
    where.doctorName = { contains: params.doctor.trim(), mode: "insensitive" };
  }
  if (exclude !== "patient" && params.patient?.trim()) {
    where.customerName = { contains: params.patient.trim(), mode: "insensitive" };
  }
  if (exclude !== "cashier" && params.cashier?.trim()) {
    where.createdBy = { name: { contains: params.cashier.trim(), mode: "insensitive" } };
  }
  const line = saleLineProductWhere(params, exclude);
  if (line) where.lines = { some: line };
  if (params.unpaid) where.paid = false;
  if (payment) where.paymentMode = payment;

  return where;
}

function salesSaleLevelAndSql(params: SalesFilterParams, exclude?: SalesFilterExclude) {
  const billNo = billNoSql(Prisma.sql`s."billNo"`, params.billNo);
  const dateFilter = billNo
    ? undefined
    : createdAtDatetimeRange(params.from || undefined, params.to || undefined);
  const payment = parseSalePaymentModeFilter(params.payment);
  const parts: Prisma.Sql[] = [
    Prisma.sql`s."storeId" = ${params.storeId}`,
    ...sqlDateTimeRangeParts(Prisma.sql`s."createdAt"`, dateFilter),
  ];
  if (billNo) parts.push(billNo);
  if (exclude !== "doctor" && params.doctor?.trim()) {
    parts.push(Prisma.sql`lower(COALESCE(s."doctorName", '')) LIKE ${sqlLowerContainsPat(params.doctor)}`);
  }
  if (exclude !== "patient" && params.patient?.trim()) {
    parts.push(Prisma.sql`lower(COALESCE(s."customerName", '')) LIKE ${sqlLowerContainsPat(params.patient)}`);
  }
  if (exclude !== "cashier" && params.cashier?.trim()) {
    parts.push(Prisma.sql`s."createdById" IN (
      SELECT u."id" FROM "User" u
      WHERE lower(u."name") LIKE ${sqlLowerContainsPat(params.cashier)}
    )`);
  }
  if (params.unpaid) parts.push(Prisma.sql`s."paid" = FALSE`);
  if (payment) parts.push(Prisma.sql`s."paymentMode" = ${payment}`);
  return Prisma.join(parts, " AND ");
}

function saleHasMatchingLineSql(params: SalesFilterParams, exclude?: SalesFilterExclude): Prisma.Sql | undefined {
  const lineParts = saleLineProductSqlParts(params, exclude);
  if (lineParts.length === 0) return undefined;
  const brand = exclude === "brand" ? "" : (params.brand?.trim() ?? "");
  const brandJoin = brand
    ? Prisma.sql`INNER JOIN "Brand" b ON b."id" = p."brandId"`
    : Prisma.empty;
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "SaleLine" sl
    INNER JOIN "Product" p ON p."id" = sl."productId"
    ${brandJoin}
    WHERE sl."saleId" = s."id" AND ${Prisma.join(lineParts, " AND ")}
  )`;
}

function salesFilterAndSql(params: SalesFilterParams, exclude?: SalesFilterExclude) {
  const lineExists = saleHasMatchingLineSql(params, exclude);
  const saleLevel = salesSaleLevelAndSql(params, exclude);
  if (!lineExists) return saleLevel;
  return Prisma.sql`${saleLevel} AND ${lineExists}`;
}

function salesFilterCacheKey(params: SalesFilterParams) {
  return {
    storeId: params.storeId,
    from: params.from ?? "",
    to: params.to ?? "",
    billNo: params.billNo?.trim() ?? "",
    doctor: params.doctor?.trim() ?? "",
    patient: params.patient?.trim() ?? "",
    product: params.product?.trim() ?? "",
    brand: params.brand?.trim() ?? "",
    category: parseProductCategoryFilter(params.category),
    type: parseProductTypeFilter(params.type),
    schedule: parseProductScheduleFilter(params.schedule),
    payment: parseSalePaymentModeFilter(params.payment),
    cashier: params.cashier?.trim() ?? "",
    unpaid: params.unpaid ? "1" : "",
  };
}

export async function getSalesFilterOptions(params: SalesFilterParams) {
  return withServerTimedCache("sales-filter-options", salesFilterCacheKey(params), 20_000, async () => {
    const productText = !!params.product?.trim();
    const brandText = !!params.brand?.trim();
    const catalogLineWhere = Prisma.join(
      [Prisma.sql`TRUE`, ...saleLineProductSqlParts({ ...params, product: "", brand: "" })],
      " AND ",
    );

    const peoplePromise = Promise.all([
      prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
        SELECT DISTINCT s."doctorName" AS "name"
        FROM "Sale" s
        WHERE s."doctorName" IS NOT NULL AND ${salesFilterAndSql(params, "doctor")}
        ORDER BY s."doctorName" ASC
      `),
      prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
        SELECT DISTINCT s."customerName" AS "name"
        FROM "Sale" s
        WHERE s."customerName" IS NOT NULL AND ${salesFilterAndSql(params, "patient")}
        ORDER BY s."customerName" ASC
      `),
      prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT DISTINCT u."name" AS "name"
        FROM "Sale" s
        INNER JOIN "User" u ON u."id" = s."createdById"
        WHERE ${salesFilterAndSql(params, "cashier")}
        ORDER BY u."name" ASC
      `),
    ]).then(([doctorRows, patientRows, cashierRows]) => ({
      doctors: doctorRows.map((r) => r.name ?? "").filter(Boolean),
      patients: patientRows.map((r) => r.name ?? "").filter(Boolean),
      cashiers: cashierRows.map((r) => r.name),
    }));

    const catalogPromise =
      productText || brandText
        ? Promise.all([
            prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
              SELECT DISTINCT p."name" AS "name"
              FROM "Sale" s
              INNER JOIN "SaleLine" sl ON sl."saleId" = s."id"
              INNER JOIN "Product" p ON p."id" = sl."productId"
              ${brandText ? Prisma.sql`INNER JOIN "Brand" b ON b."id" = p."brandId"` : Prisma.empty}
              WHERE ${salesSaleLevelAndSql(params, "product")}
                AND ${Prisma.join([Prisma.sql`TRUE`, ...saleLineProductSqlParts(params, "product")], " AND ")}
              ORDER BY p."name" ASC
            `),
            prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
              SELECT DISTINCT b."name" AS "name"
              FROM "Sale" s
              INNER JOIN "SaleLine" sl ON sl."saleId" = s."id"
              INNER JOIN "Product" p ON p."id" = sl."productId"
              INNER JOIN "Brand" b ON b."id" = p."brandId"
              WHERE ${salesSaleLevelAndSql(params, "brand")}
                AND ${Prisma.join([Prisma.sql`TRUE`, ...saleLineProductSqlParts(params, "brand")], " AND ")}
              ORDER BY b."name" ASC
            `),
          ]).then(([productRows, brandRows]) => ({
            products: productRows.map((r) => r.name),
            brands: brandRows.map((r) => r.name),
          }))
        : prisma
            .$queryRaw<Array<{ product: string; brand: string | null }>>(Prisma.sql`
              SELECT DISTINCT p."name" AS "product", b."name" AS "brand"
              FROM "Sale" s
              INNER JOIN "SaleLine" sl ON sl."saleId" = s."id"
              INNER JOIN "Product" p ON p."id" = sl."productId"
              LEFT JOIN "Brand" b ON b."id" = p."brandId"
              WHERE ${salesSaleLevelAndSql(params)} AND ${catalogLineWhere}
            `)
            .then((rows) => {
              const products = new Set<string>();
              const brands = new Set<string>();
              for (const r of rows) {
                if (r.product) products.add(r.product);
                if (r.brand) brands.add(r.brand);
              }
              const sort = (a: string, b: string) => a.localeCompare(b);
              return {
                products: [...products].sort(sort),
                brands: [...brands].sort(sort),
              };
            });

    const [people, catalog] = await Promise.all([peoplePromise, catalogPromise]);
    return { ...people, ...catalog };
  });
}

export async function getProductwiseProductOptions(params: Pick<SalesFilterParams, "storeId" | "from" | "to">) {
  return withServerTimedCache(
    "productwise-product-options",
    {
      storeId: params.storeId,
      from: params.from ?? "",
      to: params.to ?? "",
    },
    20_000,
    async () => {
      const saleWhere = salesFilterAndSql(params);
      const rows = await prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT DISTINCT p."name" AS "name"
        FROM "Sale" s
        INNER JOIN "SaleLine" sl ON sl."saleId" = s."id"
        INNER JOIN "Product" p ON p."id" = sl."productId"
        WHERE ${saleWhere}
        ORDER BY p."name" ASC
      `);
      return rows.map((r) => r.name);
    },
  );
}
