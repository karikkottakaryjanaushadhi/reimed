import { Prisma } from "@prisma/client";
import { createdAtDayRange, sqlDateTimeRangeParts, sqlIlikePattern } from "@/lib/date-range-filter";
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

function transferLineExistsSql(
  params: TransferFilterParams,
  exclude?: TransferFilterExclude,
): Prisma.Sql | null {
  const product = exclude === "product" ? "" : params.product?.trim() ?? "";
  const batch = params.batch?.trim() ?? "";
  if (!product && !batch) return null;
  const lineParts: Prisma.Sql[] = [Prisma.sql`stl."transferId" = st."id"`];
  if (product) lineParts.push(Prisma.sql`p."name" ILIKE ${sqlIlikePattern(product)}`);
  if (batch) lineParts.push(Prisma.sql`stl."batchNo" ILIKE ${sqlIlikePattern(batch)}`);
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "StockTransferLine" stl
    INNER JOIN "Product" p ON p."id" = stl."productId"
    WHERE ${Prisma.join(lineParts, " AND ")}
  )`;
}

function transferFilterAndSql(params: TransferFilterParams, exclude?: TransferFilterExclude) {
  const storeId = params.storeId;
  const direction = params.direction ?? "all";
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const counterpartyId = params.counterpartyId?.trim() ?? "";
  const otherStore = counterpartyId && counterpartyId !== storeId ? counterpartyId : "";
  const parts: Prisma.Sql[] = [];

  if (direction === "in") {
    parts.push(Prisma.sql`st."toStoreId" = ${storeId}`);
    if (otherStore) parts.push(Prisma.sql`st."fromStoreId" = ${otherStore}`);
  } else if (direction === "out") {
    parts.push(Prisma.sql`st."fromStoreId" = ${storeId}`);
    if (otherStore) parts.push(Prisma.sql`st."toStoreId" = ${otherStore}`);
  } else {
    parts.push(Prisma.sql`(st."fromStoreId" = ${storeId} OR st."toStoreId" = ${storeId})`);
    if (otherStore) {
      parts.push(Prisma.sql`(st."fromStoreId" = ${otherStore} OR st."toStoreId" = ${otherStore})`);
    }
  }

  parts.push(...sqlDateTimeRangeParts(Prisma.sql`st."createdAt"`, dateFilter));

  const transferNoRaw = params.transferNo?.trim() ?? "";
  if (transferNoRaw) {
    const n = parseTransferNo(transferNoRaw);
    parts.push(Prisma.sql`st."transferNo" = ${n ?? -1}`);
  }

  const lineExists = transferLineExistsSql(params, exclude);
  if (lineExists) parts.push(lineExists);

  const recordedBy = exclude === "recordedBy" ? "" : params.recordedBy?.trim() ?? "";
  if (recordedBy) {
    parts.push(Prisma.sql`u."name" ILIKE ${sqlIlikePattern(recordedBy)}`);
  }

  return Prisma.join(parts, " AND ");
}

async function getOtherStores(storeId: string) {
  return withServerTimedCache("stores-except", { storeId }, 300_000, () =>
    prisma.store.findMany({
      where: { id: { not: storeId } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  );
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
      const productWhere = transferFilterAndSql(params, "product");
      const recordedByWhere = transferFilterAndSql(params, "recordedBy");

      const [productRows, recordedByRows, stores] = await Promise.all([
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT p."name" AS "name"
          FROM "StockTransferLine" stl
          INNER JOIN "Product" p ON p."id" = stl."productId"
          INNER JOIN "StockTransfer" st ON st."id" = stl."transferId"
          INNER JOIN "User" u ON u."id" = st."createdById"
          WHERE ${productWhere}
          ORDER BY p."name" ASC
        `),
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT u."name" AS "name"
          FROM "StockTransfer" st
          INNER JOIN "User" u ON u."id" = st."createdById"
          WHERE ${recordedByWhere}
          ORDER BY u."name" ASC
        `),
        getOtherStores(params.storeId),
      ]);

      return {
        products: productRows.map((r) => r.name),
        recordedBy: recordedByRows.map((r) => r.name),
        stores,
      };
    },
  );
}
