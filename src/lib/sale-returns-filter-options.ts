import { Prisma } from "@prisma/client";
import { createdAtDayRange, sqlDateTimeRangeParts, sqlIlikePattern } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type SaleReturnFilterParams = {
  storeId: string;
  from?: string;
  to?: string;
  product?: string;
  batch?: string;
  billNo?: string;
  patient?: string;
  doctor?: string;
  recordedBy?: string;
};

type SaleReturnFilterExclude = "product" | "patient" | "doctor" | "recordedBy";

function parsePositiveInt(raw: string): number | null {
  const n = parseInt(raw.replace(/^#/, "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function buildSaleReturnFilterWhere(
  params: SaleReturnFilterParams,
  exclude?: SaleReturnFilterExclude,
): Prisma.SaleReturnWhereInput {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const parts: Prisma.SaleReturnWhereInput[] = [{ storeId: params.storeId }];
  if (dateFilter) parts.push({ createdAt: dateFilter });

  const sale: Prisma.SaleWhereInput = {};
  const billNoRaw = params.billNo?.trim() ?? "";
  if (billNoRaw) {
    const n = parsePositiveInt(billNoRaw);
    sale.billNo = n ?? -1;
  }
  if (exclude !== "patient" && params.patient?.trim()) {
    sale.customerName = { contains: params.patient.trim(), mode: "insensitive" };
  }
  if (exclude !== "doctor" && params.doctor?.trim()) {
    sale.doctorName = { contains: params.doctor.trim(), mode: "insensitive" };
  }
  if (Object.keys(sale).length > 0) parts.push({ sale });

  const product = exclude === "product" ? "" : params.product?.trim() ?? "";
  const batch = params.batch?.trim() ?? "";
  if (product || batch) {
    parts.push({
      lines: {
        some: {
          saleLine: {
            ...(product ? { product: { name: { contains: product, mode: "insensitive" } } } : {}),
            ...(batch ? { lot: { batchNo: { contains: batch, mode: "insensitive" } } } : {}),
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

function saleReturnLineExistsSql(
  params: SaleReturnFilterParams,
  exclude?: SaleReturnFilterExclude,
): Prisma.Sql | null {
  const product = exclude === "product" ? "" : params.product?.trim() ?? "";
  const batch = params.batch?.trim() ?? "";
  if (!product && !batch) return null;
  const lineParts: Prisma.Sql[] = [Prisma.sql`srl."saleReturnId" = sr."id"`];
  if (product) lineParts.push(Prisma.sql`prod."name" ILIKE ${sqlIlikePattern(product)}`);
  if (batch) lineParts.push(Prisma.sql`lot."batchNo" ILIKE ${sqlIlikePattern(batch)}`);
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "SaleReturnLine" srl
    INNER JOIN "SaleLine" sl ON sl."id" = srl."saleLineId"
    INNER JOIN "Product" prod ON prod."id" = sl."productId"
    INNER JOIN "InventoryLot" lot ON lot."id" = sl."lotId"
    WHERE ${Prisma.join(lineParts, " AND ")}
  )`;
}

function saleReturnFilterAndSql(params: SaleReturnFilterParams, exclude?: SaleReturnFilterExclude) {
  const dateFilter = createdAtDayRange(params.from || undefined, params.to || undefined);
  const parts: Prisma.Sql[] = [
    Prisma.sql`sr."storeId" = ${params.storeId}`,
    ...sqlDateTimeRangeParts(Prisma.sql`sr."createdAt"`, dateFilter),
  ];

  const billNoRaw = params.billNo?.trim() ?? "";
  if (billNoRaw) {
    const n = parsePositiveInt(billNoRaw);
    parts.push(Prisma.sql`s."billNo" = ${n ?? -1}`);
  }
  if (exclude !== "patient" && params.patient?.trim()) {
    parts.push(Prisma.sql`s."customerName" ILIKE ${sqlIlikePattern(params.patient)}`);
  }
  if (exclude !== "doctor" && params.doctor?.trim()) {
    parts.push(Prisma.sql`s."doctorName" ILIKE ${sqlIlikePattern(params.doctor)}`);
  }
  const lineExists = saleReturnLineExistsSql(params, exclude);
  if (lineExists) parts.push(lineExists);
  if (exclude !== "recordedBy" && params.recordedBy?.trim()) {
    parts.push(Prisma.sql`u."name" ILIKE ${sqlIlikePattern(params.recordedBy)}`);
  }
  return Prisma.join(parts, " AND ");
}

export async function getSaleReturnFilterOptions(params: SaleReturnFilterParams) {
  return withServerTimedCache(
    "sale-return-filter-options",
    {
      storeId: params.storeId,
      from: params.from ?? "",
      to: params.to ?? "",
      product: params.product?.trim() ?? "",
      batch: params.batch?.trim() ?? "",
      billNo: params.billNo?.trim() ?? "",
      patient: params.patient?.trim() ?? "",
      doctor: params.doctor?.trim() ?? "",
      recordedBy: params.recordedBy?.trim() ?? "",
    },
    20_000,
    async () => {
      const productWhere = saleReturnFilterAndSql(params, "product");
      const patientWhere = saleReturnFilterAndSql(params, "patient");
      const doctorWhere = saleReturnFilterAndSql(params, "doctor");
      const recordedByWhere = saleReturnFilterAndSql(params, "recordedBy");

      const [productRows, patientRows, doctorRows, recordedByRows] = await Promise.all([
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT prod."name" AS "name"
          FROM "SaleReturn" sr
          INNER JOIN "Sale" s ON s."id" = sr."saleId"
          INNER JOIN "User" u ON u."id" = sr."createdById"
          INNER JOIN "SaleReturnLine" srl ON srl."saleReturnId" = sr."id"
          INNER JOIN "SaleLine" sl ON sl."id" = srl."saleLineId"
          INNER JOIN "Product" prod ON prod."id" = sl."productId"
          WHERE ${productWhere}
          ORDER BY prod."name" ASC
        `),
        prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
          SELECT DISTINCT s."customerName" AS "name"
          FROM "SaleReturn" sr
          INNER JOIN "Sale" s ON s."id" = sr."saleId"
          INNER JOIN "User" u ON u."id" = sr."createdById"
          WHERE s."customerName" IS NOT NULL AND ${patientWhere}
          ORDER BY s."customerName" ASC
        `),
        prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
          SELECT DISTINCT s."doctorName" AS "name"
          FROM "SaleReturn" sr
          INNER JOIN "Sale" s ON s."id" = sr."saleId"
          INNER JOIN "User" u ON u."id" = sr."createdById"
          WHERE s."doctorName" IS NOT NULL AND ${doctorWhere}
          ORDER BY s."doctorName" ASC
        `),
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT u."name" AS "name"
          FROM "SaleReturn" sr
          INNER JOIN "Sale" s ON s."id" = sr."saleId"
          INNER JOIN "User" u ON u."id" = sr."createdById"
          WHERE ${recordedByWhere}
          ORDER BY u."name" ASC
        `),
      ]);

      return {
        products: productRows.map((r) => r.name),
        patients: patientRows.map((r) => r.name ?? "").filter(Boolean),
        doctors: doctorRows.map((r) => r.name ?? "").filter(Boolean),
        recordedBy: recordedByRows.map((r) => r.name),
      };
    },
  );
}
