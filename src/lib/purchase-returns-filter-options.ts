import type { Prisma } from "@prisma/client";
import { createdAtDayRange } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type PurchaseReturnFilterParams = {
  storeId: string;
  from?: string;
  to?: string;
  supplier?: string;
  product?: string;
  batch?: string;
  purchaseNo?: string;
  creditNote?: string;
  recordedBy?: string;
};

type PurchaseReturnFilterExclude = "supplier" | "product" | "recordedBy";

function parsePositiveInt(raw: string): number | null {
  const n = parseInt(raw.replace(/^#/, "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function buildPurchaseReturnFilterWhere(
  params: PurchaseReturnFilterParams,
  exclude?: PurchaseReturnFilterExclude,
): Prisma.PurchaseReturnWhereInput {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const parts: Prisma.PurchaseReturnWhereInput[] = [{ storeId: params.storeId }];
  if (dateFilter) parts.push({ createdAt: dateFilter });

  const purchase: Prisma.PurchaseWhereInput = {};
  const purchaseNoRaw = params.purchaseNo?.trim() ?? "";
  if (purchaseNoRaw) {
    const n = parsePositiveInt(purchaseNoRaw);
    purchase.purchaseNo = n ?? -1;
  }
  if (exclude !== "supplier" && params.supplier?.trim()) {
    purchase.supplier = { name: { contains: params.supplier.trim(), mode: "insensitive" } };
  }
  if (Object.keys(purchase).length > 0) parts.push({ purchase });

  const creditNote = params.creditNote?.trim() ?? "";
  if (creditNote) {
    parts.push({ creditNoteNo: { contains: creditNote, mode: "insensitive" } });
  }

  const product = exclude === "product" ? "" : params.product?.trim() ?? "";
  const batch = params.batch?.trim() ?? "";
  if (product || batch) {
    parts.push({
      lines: {
        some: {
          purchaseLine: {
            ...(product ? { product: { name: { contains: product, mode: "insensitive" } } } : {}),
            ...(batch ? { batchNo: { contains: batch, mode: "insensitive" } } : {}),
          },
        },
      },
    });
  }

  if (exclude !== "recordedBy" && params.recordedBy?.trim()) {
    parts.push({ createdBy: { name: { contains: params.recordedBy.trim(), mode: "insensitive" } } });
  }

  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

export async function getPurchaseReturnFilterOptions(params: PurchaseReturnFilterParams) {
  return withServerTimedCache(
    "purchase-return-filter-options",
    {
      storeId: params.storeId,
      from: params.from ?? "",
      to: params.to ?? "",
      supplier: params.supplier?.trim() ?? "",
      product: params.product?.trim() ?? "",
      batch: params.batch?.trim() ?? "",
      purchaseNo: params.purchaseNo?.trim() ?? "",
      creditNote: params.creditNote?.trim() ?? "",
      recordedBy: params.recordedBy?.trim() ?? "",
    },
    20_000,
    async () => {
      const supplierWhere = buildPurchaseReturnFilterWhere(params, "supplier");
      const productWhere = buildPurchaseReturnFilterWhere(params, "product");
      const recordedByWhere = buildPurchaseReturnFilterWhere(params, "recordedBy");

      const [supplierRows, productRows, recordedByRows] = await Promise.all([
        prisma.purchase.findMany({
          where: { returns: { some: supplierWhere } },
          distinct: ["supplierId"],
          select: { supplier: { select: { name: true } } },
          orderBy: { supplier: { name: "asc" } },
        }),
        prisma.purchaseLine.findMany({
          where: { returnLines: { some: { purchaseReturn: productWhere } } },
          distinct: ["productId"],
          select: { product: { select: { name: true } } },
          orderBy: { product: { name: "asc" } },
        }),
        prisma.purchaseReturn.findMany({
          where: recordedByWhere,
          distinct: ["createdById"],
          select: { createdBy: { select: { name: true } } },
          orderBy: { createdBy: { name: "asc" } },
        }),
      ]);

      return {
        suppliers: supplierRows.map((r) => r.supplier.name),
        products: productRows.map((r) => r.product.name),
        recordedBy: recordedByRows.map((r) => r.createdBy.name),
      };
    },
  );
}
