import { Prisma } from "@prisma/client";
import { createdAtDatetimeRange, sqlDateTimeRangeParts, sqlIlikePattern } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type SalesFilterParams = {
  storeId: string;
  from?: string;
  to?: string;
  billNo?: string;
  doctor?: string;
  patient?: string;
  product?: string;
  /** When true, only bills with paid = false. */
  unpaid?: boolean;
};

type SalesFilterExclude = "doctor" | "patient" | "product";

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

export function buildSalesFilterWhere(
  params: SalesFilterParams,
  exclude?: SalesFilterExclude,
): Prisma.SaleWhereInput {
  const billNo = billNoWhere(params.billNo);
  const dateFilter = billNo
    ? undefined
    : createdAtDatetimeRange(params.from || undefined, params.to || undefined);
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
  if (exclude !== "product" && params.product?.trim()) {
    where.lines = {
      some: {
        product: { name: { contains: params.product.trim(), mode: "insensitive" } },
      },
    };
  }
  if (params.unpaid) {
    where.paid = false;
  }

  return where;
}

function salesFilterAndSql(params: SalesFilterParams, exclude?: SalesFilterExclude) {
  const billNo = billNoSql(Prisma.sql`s."billNo"`, params.billNo);
  const dateFilter = billNo
    ? undefined
    : createdAtDatetimeRange(params.from || undefined, params.to || undefined);
  const parts: Prisma.Sql[] = [
    Prisma.sql`s."storeId" = ${params.storeId}`,
    ...sqlDateTimeRangeParts(Prisma.sql`s."createdAt"`, dateFilter),
  ];
  if (billNo) parts.push(billNo);
  if (exclude !== "doctor" && params.doctor?.trim()) {
    parts.push(Prisma.sql`s."doctorName" ILIKE ${sqlIlikePattern(params.doctor)}`);
  }
  if (exclude !== "patient" && params.patient?.trim()) {
    parts.push(Prisma.sql`s."customerName" ILIKE ${sqlIlikePattern(params.patient)}`);
  }
  if (exclude !== "product" && params.product?.trim()) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM "SaleLine" sl
      INNER JOIN "Product" p ON p."id" = sl."productId"
      WHERE sl."saleId" = s."id" AND p."name" ILIKE ${sqlIlikePattern(params.product)}
    )`);
  }
  if (params.unpaid) {
    parts.push(Prisma.sql`s."paid" = FALSE`);
  }
  return Prisma.join(parts, " AND ");
}

export async function getSalesFilterOptions(params: SalesFilterParams) {
  return withServerTimedCache(
    "sales-filter-options",
    {
      storeId: params.storeId,
      from: params.from ?? "",
      to: params.to ?? "",
      billNo: params.billNo?.trim() ?? "",
      doctor: params.doctor?.trim() ?? "",
      patient: params.patient?.trim() ?? "",
      product: params.product?.trim() ?? "",
      unpaid: params.unpaid ? "1" : "",
    },
    20_000,
    async () => {
      const doctorWhere = salesFilterAndSql(params, "doctor");
      const patientWhere = salesFilterAndSql(params, "patient");
      const productSaleWhere = salesFilterAndSql(params, "product");

      const [doctorRows, patientRows, productRows] = await Promise.all([
        prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
          SELECT DISTINCT s."doctorName" AS "name"
          FROM "Sale" s
          WHERE s."doctorName" IS NOT NULL AND ${doctorWhere}
          ORDER BY s."doctorName" ASC
        `),
        prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
          SELECT DISTINCT s."customerName" AS "name"
          FROM "Sale" s
          WHERE s."customerName" IS NOT NULL AND ${patientWhere}
          ORDER BY s."customerName" ASC
        `),
        prisma.$queryRaw<Array<{ name: string }>>(Prisma.sql`
          SELECT DISTINCT p."name" AS "name"
          FROM "SaleLine" sl
          INNER JOIN "Product" p ON p."id" = sl."productId"
          INNER JOIN "Sale" s ON s."id" = sl."saleId"
          WHERE ${productSaleWhere}
          ORDER BY p."name" ASC
        `),
      ]);

      return {
        doctors: doctorRows.map((r) => r.name ?? "").filter(Boolean),
        patients: patientRows.map((r) => r.name ?? "").filter(Boolean),
        products: productRows.map((r) => r.name),
      };
    },
  );
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
        FROM "SaleLine" sl
        INNER JOIN "Product" p ON p."id" = sl."productId"
        INNER JOIN "Sale" s ON s."id" = sl."saleId"
        WHERE ${saleWhere}
        ORDER BY p."name" ASC
      `);
      return rows.map((r) => r.name);
    },
  );
}
