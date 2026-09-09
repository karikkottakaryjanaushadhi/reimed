import { Prisma } from "@prisma/client";
import { createdAtDayRange, sqlDateTimeRangeParts, sqlIlikePattern } from "@/lib/date-range-filter";
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

function purchaseReturnLineExistsSql(
  params: PurchaseReturnFilterParams,
  exclude?: PurchaseReturnFilterExclude,
): Prisma.Sql | null {
  const product = exclude === "product" ? "" : params.product?.trim() ?? "";
  const batch = params.batch?.trim() ?? "";
  if (!product && !batch) return null;
  const lineParts: Prisma.Sql[] = [Prisma.sql`prl."purchaseReturnId" = pr."id"`];
  if (product) lineParts.push(Prisma.sql`prod."name" ILIKE ${sqlIlikePattern(product)}`);
  if (batch) lineParts.push(Prisma.sql`pl."batchNo" ILIKE ${sqlIlikePattern(batch)}`);
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "PurchaseReturnLine" prl
    INNER JOIN "PurchaseLine" pl ON pl."id" = prl."purchaseLineId"
    INNER JOIN "Product" prod ON prod."id" = pl."productId"
    WHERE ${Prisma.join(lineParts, " AND ")}
  )`;
}

function purchaseReturnFilterAndSql(params: PurchaseReturnFilterParams, exclude?: PurchaseReturnFilterExclude) {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const parts: Prisma.Sql[] = [
    Prisma.sql`pr."storeId" = ${params.storeId}`,
    ...sqlDateTimeRangeParts(Prisma.sql`pr."createdAt"`, dateFilter),
  ];

  const purchaseNoRaw = params.purchaseNo?.trim() ?? "";
  if (purchaseNoRaw) {
    const n = parsePositiveInt(purchaseNoRaw);
    parts.push(Prisma.sql`p."purchaseNo" = ${n ?? -1}`);
  }
  if (exclude !== "supplier" && params.supplier?.trim()) {
    parts.push(Prisma.sql`s."name" ILIKE ${sqlIlikePattern(params.supplier)}`);
  }
  const creditNote = params.creditNote?.trim() ?? "";
  if (creditNote) {
    parts.push(Prisma.sql`pr."creditNoteNo" ILIKE ${sqlIlikePattern(creditNote)}`);
  }
  const lineExists = purchaseReturnLineExistsSql(params, exclude);
  if (lineExists) parts.push(lineExists);
  if (exclude !== "recordedBy" && params.recordedBy?.trim()) {
    parts.push(Prisma.sql`u."name" ILIKE ${sqlIlikePattern(params.recordedBy)}`);
  }
  return Prisma.join(parts, " AND ");
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
      const supplierWhere = purchaseReturnFilterAndSql(params, "supplier");
      const productWhere = purchaseReturnFilterAndSql(params, "product");
      const recordedByWhere = purchaseReturnFilterAndSql(params, "recordedBy");

      const [supplierRows, productRows, recordedByRows] = await Promise.all([
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT s."name" AS "name"
          FROM "PurchaseReturn" pr
          INNER JOIN "Purchase" p ON p."id" = pr."purchaseId"
          INNER JOIN "Supplier" s ON s."id" = p."supplierId"
          INNER JOIN "User" u ON u."id" = pr."createdById"
          WHERE ${supplierWhere}
          ORDER BY s."name" ASC
        `),
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT prod."name" AS "name"
          FROM "PurchaseReturn" pr
          INNER JOIN "Purchase" p ON p."id" = pr."purchaseId"
          INNER JOIN "Supplier" s ON s."id" = p."supplierId"
          INNER JOIN "User" u ON u."id" = pr."createdById"
          INNER JOIN "PurchaseReturnLine" prl ON prl."purchaseReturnId" = pr."id"
          INNER JOIN "PurchaseLine" pl ON pl."id" = prl."purchaseLineId"
          INNER JOIN "Product" prod ON prod."id" = pl."productId"
          WHERE ${productWhere}
          ORDER BY prod."name" ASC
        `),
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT u."name" AS "name"
          FROM "PurchaseReturn" pr
          INNER JOIN "Purchase" p ON p."id" = pr."purchaseId"
          INNER JOIN "Supplier" s ON s."id" = p."supplierId"
          INNER JOIN "User" u ON u."id" = pr."createdById"
          WHERE ${recordedByWhere}
          ORDER BY u."name" ASC
        `),
      ]);

      return {
        suppliers: supplierRows.map((r) => r.name),
        products: productRows.map((r) => r.name),
        recordedBy: recordedByRows.map((r) => r.name),
      };
    },
  );
}
