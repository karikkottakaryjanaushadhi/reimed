import type { Prisma } from "@prisma/client";
import { createdAtDayRange } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type TransferDirectionFilter = "all" | "in" | "out";

export type TransferFilterParams = {
  storeId: string;
  from?: string;
  to?: string;
  direction?: TransferDirectionFilter;
  counterpartyId?: string;
  product?: string;
  transferNo?: string;
  batch?: string;
  recordedBy?: string;
};

type TransferFilterExclude = "product" | "recordedBy";

export function parseTransferDirection(raw: unknown): TransferDirectionFilter {
  if (raw === "in" || raw === "out") return raw;
  return "all";
}

function parseTransferNo(raw: string): number | null {
  const n = parseInt(raw.replace(/^#/, "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function buildTransferFilterWhere(
  params: TransferFilterParams,
  exclude?: TransferFilterExclude,
): Prisma.StockTransferWhereInput {
  const storeId = params.storeId;
  const direction = params.direction ?? "all";
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const counterpartyId = params.counterpartyId?.trim() ?? "";
  const otherStore = counterpartyId && counterpartyId !== storeId ? counterpartyId : "";

  const parts: Prisma.StockTransferWhereInput[] = [];

  if (direction === "in") {
    parts.push({ toStoreId: storeId });
    if (otherStore) parts.push({ fromStoreId: otherStore });
  } else if (direction === "out") {
    parts.push({ fromStoreId: storeId });
    if (otherStore) parts.push({ toStoreId: otherStore });
  } else {
    parts.push({ OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] });
    if (otherStore) {
      parts.push({ OR: [{ fromStoreId: otherStore }, { toStoreId: otherStore }] });
    }
  }

  if (dateFilter) parts.push({ createdAt: dateFilter });

  const transferNoRaw = params.transferNo?.trim() ?? "";
  if (transferNoRaw) {
    const n = parseTransferNo(transferNoRaw);
    parts.push({ transferNo: n ?? -1 });
  }

  const product = exclude === "product" ? "" : params.product?.trim() ?? "";
  const batch = params.batch?.trim() ?? "";
  if (product || batch) {
    parts.push({
      lines: {
        some: {
          ...(product ? { product: { name: { contains: product, mode: "insensitive" } } } : {}),
          ...(batch ? { batchNo: { contains: batch, mode: "insensitive" } } : {}),
        },
      },
    });
  }

  const recordedBy = exclude === "recordedBy" ? "" : params.recordedBy?.trim() ?? "";
  if (recordedBy) {
    parts.push({ createdBy: { name: { contains: recordedBy, mode: "insensitive" } } });
  }

  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

export async function getTransferFilterOptions(params: TransferFilterParams) {
  return withServerTimedCache(
    "transfer-filter-options",
    {
      storeId: params.storeId,
      from: params.from ?? "",
      to: params.to ?? "",
      direction: params.direction ?? "all",
      counterpartyId: params.counterpartyId?.trim() ?? "",
      product: params.product?.trim() ?? "",
      transferNo: params.transferNo?.trim() ?? "",
      batch: params.batch?.trim() ?? "",
      recordedBy: params.recordedBy?.trim() ?? "",
    },
    20_000,
    async () => {
      const productWhere = buildTransferFilterWhere(params, "product");
      const recordedByWhere = buildTransferFilterWhere(params, "recordedBy");

      const [productRows, recordedByRows, stores] = await Promise.all([
        prisma.stockTransferLine.findMany({
          where: { transfer: productWhere },
          distinct: ["productId"],
          select: { product: { select: { name: true } } },
          orderBy: { product: { name: "asc" } },
        }),
        prisma.stockTransfer.findMany({
          where: recordedByWhere,
          distinct: ["createdById"],
          select: { createdBy: { select: { name: true } } },
          orderBy: { createdBy: { name: "asc" } },
        }),
        prisma.store.findMany({
          where: { id: { not: params.storeId } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);

      return {
        products: productRows.map((r) => r.product.name),
        recordedBy: recordedByRows.map((r) => r.createdBy.name),
        stores,
      };
    },
  );
}
