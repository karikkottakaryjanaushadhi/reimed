import { createdAtDatetimeRange } from "@/lib/date-range-filter";
import { aggregateStoreStock } from "@/lib/inventory-stock-aggregate";
import {
  aggregateProductwiseSales,
  productwiseSaleLineWhere,
  type ProductwiseRow,
} from "@/lib/productwise-sales-aggregate";
import { prisma } from "@/lib/prisma";

export type ProductwiseReportRow = ProductwiseRow & {
  remainingQty: number;
  supplier: string | null;
};

export type ProductwiseReportSort = "name" | "quantity" | "gross" | "billCount" | "returnCredits";

const PRODUCTWISE_LINE_SELECT = {
  saleId: true,
  qty: true,
  amount: true,
  discountAmount: true,
  gstAmount: true,
  product: {
    select: {
      id: true,
      name: true,
      packSize: true,
    },
  },
  lot: {
    select: {
      costPrice: true,
      mrp: true,
    },
  },
} as const;

export function parseProductwiseReportSort(raw: unknown): ProductwiseReportSort {
  if (
    raw === "quantity" ||
    raw === "gross" ||
    raw === "billCount" ||
    raw === "returnCredits" ||
    raw === "name"
  ) {
    return raw;
  }
  return "name";
}

export function parseProductwiseReportDir(raw: unknown): "asc" | "desc" {
  return raw === "asc" || raw === "desc" ? raw : "desc";
}

function sortProductwiseRows(
  rows: ProductwiseReportRow[],
  sort: ProductwiseReportSort,
  dir: "asc" | "desc",
): ProductwiseReportRow[] {
  return [...rows].sort((a, b) => {
    if (sort === "name") {
      const cmp = a.productName.localeCompare(b.productName);
      return dir === "asc" ? cmp : -cmp;
    }
    if (sort === "quantity") {
      return dir === "asc" ? a.quantity - b.quantity : b.quantity - a.quantity;
    }
    if (sort === "gross") {
      return dir === "asc" ? a.gross - b.gross : b.gross - a.gross;
    }
    if (sort === "billCount") {
      return dir === "asc" ? a.billCount - b.billCount : b.billCount - a.billCount;
    }
    if (sort === "returnCredits") {
      return dir === "asc" ? a.returnCredits - b.returnCredits : b.returnCredits - a.returnCredits;
    }
    return 0;
  });
}

export async function loadProductwiseSalesReport(params: {
  storeId: string;
  from: string;
  to: string;
  product?: string;
  sort?: string;
  dir?: string;
}): Promise<ProductwiseReportRow[]> {
  const sort = parseProductwiseReportSort(params.sort);
  const dir = parseProductwiseReportDir(params.dir);
  const product = params.product?.trim() || undefined;
  const dateFilter = createdAtDatetimeRange(params.from || undefined, params.to || undefined);
  const saleWhere = {
    storeId: params.storeId,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };
  const lineWhere = productwiseSaleLineWhere(saleWhere, product);

  const [saleLines, returnLines] = await Promise.all([
    prisma.saleLine.findMany({
      where: lineWhere,
      select: PRODUCTWISE_LINE_SELECT,
    }),
    prisma.saleReturnLine.findMany({
      where: { saleLine: lineWhere },
      select: {
        qty: true,
        refundTotal: true,
        saleLine: { select: PRODUCTWISE_LINE_SELECT },
      },
    }),
  ]);

  const salesRows = aggregateProductwiseSales(saleLines, returnLines);
  const stockRows =
    salesRows.length > 0
      ? await aggregateStoreStock({
          storeId: params.storeId,
          productIds: salesRows.map((r) => r.productId),
        })
      : [];
  const balanceByProductId = new Map(
    stockRows.map((r) => [r.productId, r.quantity + r.expiredQuantity] as const),
  );
  const supplierByProductId = new Map(stockRows.map((r) => [r.productId, r.supplier] as const));

  const productTotals = salesRows.map((row) => ({
    ...row,
    remainingQty: balanceByProductId.get(row.productId) ?? 0,
    supplier: supplierByProductId.get(row.productId) ?? null,
  }));

  return sortProductwiseRows(productTotals, sort, dir);
}
