import { Prisma } from "@prisma/client";
import { parsePaymentModeFilter } from "@/lib/constants";
import { createdAtDayRange, sqlDateTimeRangeParts, sqlIlikePattern } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
import { purchaseBillTotalsFromLines } from "@/lib/purchase-line";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import {
  parseProductCategoryFilter,
  parseProductScheduleFilter,
  parseProductTypeFilter,
} from "@/lib/products-filter-options";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type PurchaseDateOn = "recorded" | "invoice";
export type PurchaseStatusFilter = "" | "complete" | "in_progress";
export type PurchasePaidFilter = "" | "unpaid" | "paid";

export type PurchaseFilterParams = {
  storeId: string;
  from?: string;
  to?: string;
  dateOn?: PurchaseDateOn;
  supplier?: string;
  invoice?: string;
  product?: string;
  brand?: string;
  category?: string;
  type?: string;
  schedule?: string;
  payment?: string;
  cashier?: string;
  /** Prefix search on bill grand total (incl. GST, nearest rupee), e.g. 2450 or 2450.00 */
  amount?: string;
  status?: PurchaseStatusFilter;
  paid?: PurchasePaidFilter;
};

type PurchaseFilterExclude = "supplier" | "product" | "brand" | "cashier";

const purchaseAmountLineSelect = {
  quantity: true,
  costPrice: true,
  pack: true,
  purchaseDiscountPct: true,
  purchaseDiscountRs: true,
  schemeDiscountPct: true,
  schemeDiscountRs: true,
  gstPct: true,
} as const;

function sqlLowerContainsPat(raw: string): string {
  return `%${raw.trim().toLowerCase().replace(/%/g, "").replace(/_/g, "")}%`;
}

/** Strip currency noise so "₹2,450.00" and "2450" compare the same. */
export function normalizePurchaseAmountSearch(raw?: string): string {
  return (raw ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/^(?:rs\.?|inr|₹)\s*/i, "")
    .trim();
}

/** Match the list's Total (incl. GST) column: prefix on `1234.00` / `1234`. */
export function purchaseAmountSearchMatches(grandTotal: number, raw?: string): boolean {
  const q = normalizePurchaseAmountSearch(raw);
  if (!q) return true;
  if (!/^\d+(?:\.\d*)?$/.test(q)) return false;
  const shown = grandTotal.toFixed(2);
  if (shown === q || shown.startsWith(q)) return true;
  if (q.includes(".")) return false;
  const intPart = String(Math.trunc(Math.abs(grandTotal)));
  return intPart === q || intPart.startsWith(q);
}

function purchaseLineProductWhere(
  params: PurchaseFilterParams,
  exclude?: PurchaseFilterExclude,
): Prisma.PurchaseLineWhereInput | undefined {
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

function purchaseLineProductSqlParts(params: PurchaseFilterParams, exclude?: PurchaseFilterExclude): Prisma.Sql[] {
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

export function buildPurchaseFilterWhere(
  params: PurchaseFilterParams,
  exclude?: PurchaseFilterExclude,
): Prisma.PurchaseWhereInput {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const dateOn = params.dateOn ?? "recorded";
  const payment = parsePaymentModeFilter(params.payment);
  const where: Prisma.PurchaseWhereInput = {
    storeId: params.storeId,
    ...(dateFilter
      ? dateOn === "invoice"
        ? { invoiceDate: dateFilter }
        : { createdAt: dateFilter }
      : {}),
  };

  if (exclude !== "supplier" && params.supplier?.trim()) {
    where.supplier = { name: { contains: params.supplier.trim(), mode: "insensitive" } };
  }
  if (params.invoice?.trim()) {
    where.invoiceRef = { contains: params.invoice.trim(), mode: "insensitive" };
  }
  if (exclude !== "cashier" && params.cashier?.trim()) {
    where.createdBy = { name: { contains: params.cashier.trim(), mode: "insensitive" } };
  }
  const line = purchaseLineProductWhere(params, exclude);
  if (line) where.lines = { some: line };
  if (params.status === "complete") where.complete = true;
  else if (params.status === "in_progress") where.complete = false;

  if (params.paid === "unpaid") where.paid = false;
  else if (params.paid === "paid") where.paid = true;
  if (payment) where.paymentMode = payment;

  return where;
}

function amountExcludeKey(params: PurchaseFilterParams, exclude?: PurchaseFilterExclude): string {
  if (exclude === "supplier" && params.supplier?.trim()) return "supplier";
  if (exclude === "product" && params.product?.trim()) return "product";
  if (exclude === "brand" && params.brand?.trim()) return "brand";
  if (exclude === "cashier" && params.cashier?.trim()) return "cashier";
  return "";
}

function purchaseFilterCacheKey(params: PurchaseFilterParams) {
  return {
    storeId: params.storeId,
    from: params.from ?? "",
    to: params.to ?? "",
    dateOn: params.dateOn ?? "recorded",
    supplier: params.supplier?.trim() ?? "",
    invoice: params.invoice?.trim() ?? "",
    product: params.product?.trim() ?? "",
    brand: params.brand?.trim() ?? "",
    category: parseProductCategoryFilter(params.category),
    type: parseProductTypeFilter(params.type),
    schedule: parseProductScheduleFilter(params.schedule),
    payment: parsePaymentModeFilter(params.payment),
    cashier: params.cashier?.trim() ?? "",
    amount: normalizePurchaseAmountSearch(params.amount),
    status: params.status ?? "",
    paid: params.paid ?? "",
  };
}

async function purchaseIdsMatchingAmount(
  params: PurchaseFilterParams,
  exclude?: PurchaseFilterExclude,
): Promise<string[] | undefined> {
  const q = normalizePurchaseAmountSearch(params.amount);
  if (!q) return undefined;
  if (!/^\d+(?:\.\d*)?$/.test(q)) return [];

  const excludeKey = amountExcludeKey(params, exclude);
  return withServerTimedCache(
    "purchase-amount-ids",
    { ...purchaseFilterCacheKey(params), exclude: excludeKey },
    20_000,
    async () => {
      const rows = await prisma.purchase.findMany({
        where: buildPurchaseFilterWhere(params, excludeKey ? exclude : undefined),
        select: {
          id: true,
          lines: { select: purchaseAmountLineSelect },
        },
      });

      return rows
        .filter((p) =>
          purchaseAmountSearchMatches(
            purchaseBillTotalsFromLines(
              p.lines.map((line) => ({
                quantity: line.quantity,
                costPrice: Number(line.costPrice),
                pack: line.pack,
                purchaseDiscountPct: Number(line.purchaseDiscountPct),
                purchaseDiscountRs: Number(line.purchaseDiscountRs),
                schemeDiscountPct: Number(line.schemeDiscountPct),
                schemeDiscountRs: Number(line.schemeDiscountRs),
                gstPct: snapProductGstPct(line.gstPct),
              })),
            ).grandTotal,
            q,
          ),
        )
        .map((p) => p.id);
    },
  );
}

function withAmountIds(
  where: Prisma.PurchaseWhereInput,
  amountIds: string[] | undefined,
): Prisma.PurchaseWhereInput {
  if (amountIds === undefined) return where;
  return { ...where, id: { in: amountIds } };
}

/** Base filters plus optional total-amount match (grand total incl. GST). */
export async function resolvePurchaseFilterWhere(
  params: PurchaseFilterParams,
  exclude?: PurchaseFilterExclude,
): Promise<Prisma.PurchaseWhereInput> {
  return withAmountIds(buildPurchaseFilterWhere(params, exclude), await purchaseIdsMatchingAmount(params, exclude));
}

function purchaseLevelAndSql(params: PurchaseFilterParams, exclude?: PurchaseFilterExclude) {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const dateOn = params.dateOn ?? "recorded";
  const dateCol = dateOn === "invoice" ? Prisma.sql`pu."invoiceDate"` : Prisma.sql`pu."createdAt"`;
  const payment = parsePaymentModeFilter(params.payment);
  const parts: Prisma.Sql[] = [
    Prisma.sql`pu."storeId" = ${params.storeId}`,
    ...sqlDateTimeRangeParts(dateCol, dateFilter),
  ];
  if (exclude !== "supplier" && params.supplier?.trim()) {
    parts.push(Prisma.sql`pu."supplierId" IN (
      SELECT s."id" FROM "Supplier" s
      WHERE s."name" ILIKE ${sqlIlikePattern(params.supplier)}
    )`);
  }
  if (params.invoice?.trim()) {
    parts.push(Prisma.sql`pu."invoiceRef" ILIKE ${sqlIlikePattern(params.invoice)}`);
  }
  if (exclude !== "cashier" && params.cashier?.trim()) {
    parts.push(Prisma.sql`pu."createdById" IN (
      SELECT u."id" FROM "User" u
      WHERE lower(u."name") LIKE ${sqlLowerContainsPat(params.cashier)}
    )`);
  }
  if (params.status === "complete") parts.push(Prisma.sql`pu."complete" = TRUE`);
  else if (params.status === "in_progress") parts.push(Prisma.sql`pu."complete" = FALSE`);
  if (params.paid === "unpaid") parts.push(Prisma.sql`pu."paid" = FALSE`);
  else if (params.paid === "paid") parts.push(Prisma.sql`pu."paid" = TRUE`);
  if (payment) parts.push(Prisma.sql`pu."paymentMode" = ${payment}`);
  return Prisma.join(parts, " AND ");
}

function purchaseHasMatchingLineSql(
  params: PurchaseFilterParams,
  exclude?: PurchaseFilterExclude,
): Prisma.Sql | undefined {
  const lineParts = purchaseLineProductSqlParts(params, exclude);
  if (lineParts.length === 0) return undefined;
  const brand = exclude === "brand" ? "" : (params.brand?.trim() ?? "");
  const brandJoin = brand
    ? Prisma.sql`INNER JOIN "Brand" b ON b."id" = p."brandId"`
    : Prisma.empty;
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "PurchaseLine" pl
    INNER JOIN "Product" p ON p."id" = pl."productId"
    ${brandJoin}
    WHERE pl."purchaseId" = pu."id" AND ${Prisma.join(lineParts, " AND ")}
  )`;
}

function purchaseFilterAndSql(
  params: PurchaseFilterParams,
  exclude?: PurchaseFilterExclude,
  amountIds?: string[],
) {
  const parts: Prisma.Sql[] = [purchaseLevelAndSql(params, exclude)];
  const lineExists = purchaseHasMatchingLineSql(params, exclude);
  if (lineExists) parts.push(lineExists);
  if (amountIds !== undefined) {
    if (amountIds.length === 0) parts.push(Prisma.sql`FALSE`);
    else parts.push(Prisma.sql`pu."id" IN (${Prisma.join(amountIds.map((id) => Prisma.sql`${id}`))})`);
  }
  return Prisma.join(parts, " AND ");
}

export async function getPurchaseFilterOptions(params: PurchaseFilterParams) {
  return withServerTimedCache("purchase-filter-options", purchaseFilterCacheKey(params), 20_000, async () => {
    const productText = !!params.product?.trim();
    const brandText = !!params.brand?.trim();
    const catalogLineWhere = Prisma.join(
      [Prisma.sql`TRUE`, ...purchaseLineProductSqlParts({ ...params, product: "", brand: "" })],
      " AND ",
    );

    const [amountIdsSupplier, amountIdsCashier, amountIdsProduct, amountIdsBrand] = await Promise.all([
      purchaseIdsMatchingAmount(params, "supplier"),
      purchaseIdsMatchingAmount(params, "cashier"),
      purchaseIdsMatchingAmount(params, "product"),
      purchaseIdsMatchingAmount(params, "brand"),
    ]);

    const peoplePromise = Promise.all([
      prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT DISTINCT s."name" AS "name"
        FROM "Purchase" pu
        INNER JOIN "Supplier" s ON s."id" = pu."supplierId"
        WHERE ${purchaseFilterAndSql(params, "supplier", amountIdsSupplier)}
        ORDER BY s."name" ASC
      `),
      prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
        SELECT DISTINCT u."name" AS "name"
        FROM "Purchase" pu
        INNER JOIN "User" u ON u."id" = pu."createdById"
        WHERE ${purchaseFilterAndSql(params, "cashier", amountIdsCashier)}
        ORDER BY u."name" ASC
      `),
    ]).then(([supplierRows, cashierRows]) => ({
      suppliers: supplierRows.map((r) => r.name),
      cashiers: cashierRows.map((r) => r.name),
    }));

    const catalogPromise =
      productText || brandText
        ? Promise.all([
            prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
              SELECT DISTINCT p."name" AS "name"
              FROM "Purchase" pu
              INNER JOIN "PurchaseLine" pl ON pl."purchaseId" = pu."id"
              INNER JOIN "Product" p ON p."id" = pl."productId"
              ${brandText ? Prisma.sql`INNER JOIN "Brand" b ON b."id" = p."brandId"` : Prisma.empty}
              WHERE ${purchaseLevelAndSql(params, "product")}
                AND ${Prisma.join([Prisma.sql`TRUE`, ...purchaseLineProductSqlParts(params, "product")], " AND ")}
                ${
                  amountIdsProduct === undefined
                    ? Prisma.empty
                    : amountIdsProduct.length === 0
                      ? Prisma.sql`AND FALSE`
                      : Prisma.sql`AND pu."id" IN (${Prisma.join(amountIdsProduct.map((id) => Prisma.sql`${id}`))})`
                }
              ORDER BY p."name" ASC
            `),
            prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
              SELECT DISTINCT b."name" AS "name"
              FROM "Purchase" pu
              INNER JOIN "PurchaseLine" pl ON pl."purchaseId" = pu."id"
              INNER JOIN "Product" p ON p."id" = pl."productId"
              INNER JOIN "Brand" b ON b."id" = p."brandId"
              WHERE ${purchaseLevelAndSql(params, "brand")}
                AND ${Prisma.join([Prisma.sql`TRUE`, ...purchaseLineProductSqlParts(params, "brand")], " AND ")}
                ${
                  amountIdsBrand === undefined
                    ? Prisma.empty
                    : amountIdsBrand.length === 0
                      ? Prisma.sql`AND FALSE`
                      : Prisma.sql`AND pu."id" IN (${Prisma.join(amountIdsBrand.map((id) => Prisma.sql`${id}`))})`
                }
              ORDER BY b."name" ASC
            `),
          ]).then(([productRows, brandRows]) => ({
            products: productRows.map((r) => r.name),
            brands: brandRows.map((r) => r.name),
          }))
        : prisma
            .$queryRaw<Array<{ product: string; brand: string | null }>>(Prisma.sql`
              SELECT DISTINCT p."name" AS "product", b."name" AS "brand"
              FROM "Purchase" pu
              INNER JOIN "PurchaseLine" pl ON pl."purchaseId" = pu."id"
              INNER JOIN "Product" p ON p."id" = pl."productId"
              LEFT JOIN "Brand" b ON b."id" = p."brandId"
              WHERE ${purchaseFilterAndSql(params, undefined, amountIdsProduct)}
                AND ${catalogLineWhere}
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
