import { Prisma } from "@prisma/client";
import { createdAtDayRange, sqlDateTimeRangeParts, sqlIlikePattern } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
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
  status?: PurchaseStatusFilter;
  paid?: PurchasePaidFilter;
};

type PurchaseFilterExclude = "supplier" | "product";

export function buildPurchaseFilterWhere(
  params: PurchaseFilterParams,
  exclude?: PurchaseFilterExclude,
): Prisma.PurchaseWhereInput {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const dateOn = params.dateOn ?? "recorded";
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
  if (exclude !== "product" && params.product?.trim()) {
    where.lines = {
      some: {
        product: { name: { contains: params.product.trim(), mode: "insensitive" } },
      },
    };
  }
  if (params.status === "complete") where.complete = true;
  else if (params.status === "in_progress") where.complete = false;

  if (params.paid === "unpaid") where.paid = false;
  else if (params.paid === "paid") where.paid = true;

  return where;
}

function purchaseFilterAndSql(params: PurchaseFilterParams, exclude?: PurchaseFilterExclude) {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const dateOn = params.dateOn ?? "recorded";
  const dateCol = dateOn === "invoice" ? Prisma.sql`pu."invoiceDate"` : Prisma.sql`pu."createdAt"`;
  const parts: Prisma.Sql[] = [
    Prisma.sql`pu."storeId" = ${params.storeId}`,
    ...sqlDateTimeRangeParts(dateCol, dateFilter),
  ];
  if (exclude !== "supplier" && params.supplier?.trim()) {
    parts.push(Prisma.sql`s."name" ILIKE ${sqlIlikePattern(params.supplier)}`);
  }
  if (params.invoice?.trim()) {
    parts.push(Prisma.sql`pu."invoiceRef" ILIKE ${sqlIlikePattern(params.invoice)}`);
  }
  if (exclude !== "product" && params.product?.trim()) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "PurchaseLine" pl
      INNER JOIN "Product" p ON p."id" = pl."productId"
      WHERE pl."purchaseId" = pu."id" AND p."name" ILIKE ${sqlIlikePattern(params.product)}
    )`);
  }
  if (params.status === "complete") parts.push(Prisma.sql`pu."complete" = TRUE`);
  else if (params.status === "in_progress") parts.push(Prisma.sql`pu."complete" = FALSE`);
  if (params.paid === "unpaid") parts.push(Prisma.sql`pu."paid" = FALSE`);
  else if (params.paid === "paid") parts.push(Prisma.sql`pu."paid" = TRUE`);
  return Prisma.join(parts, " AND ");
}

export async function getPurchaseFilterOptions(params: PurchaseFilterParams) {
  return withServerTimedCache(
    "purchase-filter-options",
    {
      storeId: params.storeId,
      from: params.from ?? "",
      to: params.to ?? "",
      dateOn: params.dateOn ?? "recorded",
      supplier: params.supplier?.trim() ?? "",
      invoice: params.invoice?.trim() ?? "",
      product: params.product?.trim() ?? "",
      status: params.status ?? "",
      paid: params.paid ?? "",
    },
    20_000,
    async () => {
      const supplierWhere = purchaseFilterAndSql(params, "supplier");
      const productWhere = purchaseFilterAndSql(params, "product");

      const [supplierRows, productRows] = await Promise.all([
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT s."name" AS "name"
          FROM "Purchase" pu
          INNER JOIN "Supplier" s ON s."id" = pu."supplierId"
          WHERE ${supplierWhere}
          ORDER BY s."name" ASC
        `),
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT p."name" AS "name"
          FROM "PurchaseLine" pl
          INNER JOIN "Product" p ON p."id" = pl."productId"
          INNER JOIN "Purchase" pu ON pu."id" = pl."purchaseId"
          INNER JOIN "Supplier" s ON s."id" = pu."supplierId"
          WHERE ${productWhere}
          ORDER BY p."name" ASC
        `),
      ]);

      return {
        suppliers: supplierRows.map((r) => r.name),
        products: productRows.map((r) => r.name),
      };
    },
  );
}
