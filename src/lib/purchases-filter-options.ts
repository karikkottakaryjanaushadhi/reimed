import type { Prisma } from "@prisma/client";
import { createdAtDayRange } from "@/lib/date-range-filter";
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
      const supplierWhere = buildPurchaseFilterWhere(params, "supplier");
      const productWhere = buildPurchaseFilterWhere(params, "product");

      const [supplierRows, productRows] = await Promise.all([
        prisma.purchase.findMany({
          where: supplierWhere,
          distinct: ["supplierId"],
          select: { supplier: { select: { name: true } } },
          orderBy: { supplier: { name: "asc" } },
        }),
        prisma.purchaseLine.findMany({
          where: { purchase: productWhere },
          distinct: ["productId"],
          select: { product: { select: { name: true } } },
          orderBy: { product: { name: "asc" } },
        }),
      ]);

      return {
        suppliers: supplierRows.map((r) => r.supplier.name),
        products: productRows.map((r) => r.product.name),
      };
    },
  );
}
