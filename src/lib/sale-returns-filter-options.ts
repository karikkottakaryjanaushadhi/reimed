import type { Prisma } from "@prisma/client";
import { createdAtDayRange } from "@/lib/date-range-filter";
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
      const productWhere = buildSaleReturnFilterWhere(params, "product");
      const patientWhere = buildSaleReturnFilterWhere(params, "patient");
      const doctorWhere = buildSaleReturnFilterWhere(params, "doctor");
      const recordedByWhere = buildSaleReturnFilterWhere(params, "recordedBy");

      const [productRows, patientRows, doctorRows, recordedByRows] = await Promise.all([
        prisma.saleLine.findMany({
          where: { returnLines: { some: { saleReturn: productWhere } } },
          distinct: ["productId"],
          select: { product: { select: { name: true } } },
          orderBy: { product: { name: "asc" } },
        }),
        prisma.sale.findMany({
          where: { customerName: { not: null }, returns: { some: patientWhere } },
          distinct: ["customerName"],
          select: { customerName: true },
          orderBy: { customerName: "asc" },
        }),
        prisma.sale.findMany({
          where: { doctorName: { not: null }, returns: { some: doctorWhere } },
          distinct: ["doctorName"],
          select: { doctorName: true },
          orderBy: { doctorName: "asc" },
        }),
        prisma.saleReturn.findMany({
          where: recordedByWhere,
          distinct: ["createdById"],
          select: { createdBy: { select: { name: true } } },
          orderBy: { createdBy: { name: "asc" } },
        }),
      ]);

      return {
        products: productRows.map((r) => r.product.name),
        patients: patientRows.map((r) => r.customerName ?? "").filter(Boolean),
        doctors: doctorRows.map((r) => r.doctorName ?? "").filter(Boolean),
        recordedBy: recordedByRows.map((r) => r.createdBy.name),
      };
    },
  );
}
