import type { Prisma } from "@prisma/client";
import { createdAtDatetimeRange } from "@/lib/date-range-filter";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type SalesFilterParams = {
  storeId: string;
  from?: string;
  to?: string;
  doctor?: string;
  patient?: string;
  product?: string;
  /** When true, only bills with paid = false. */
  unpaid?: boolean;
};

type SalesFilterExclude = "doctor" | "patient" | "product";

export function buildSalesFilterWhere(
  params: SalesFilterParams,
  exclude?: SalesFilterExclude,
): Prisma.SaleWhereInput {
  const dateFilter = createdAtDatetimeRange(params.from || undefined, params.to || undefined);
  const where: Prisma.SaleWhereInput = {
    storeId: params.storeId,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
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

export async function getSalesFilterOptions(params: SalesFilterParams) {
  return withServerTimedCache(
    "sales-filter-options",
    {
      storeId: params.storeId,
      from: params.from ?? "",
      to: params.to ?? "",
      doctor: params.doctor?.trim() ?? "",
      patient: params.patient?.trim() ?? "",
      product: params.product?.trim() ?? "",
      unpaid: params.unpaid ? "1" : "",
    },
    20_000,
    async () => {
      const doctorWhere = buildSalesFilterWhere(params, "doctor");
      const patientWhere = buildSalesFilterWhere(params, "patient");
      const productSaleWhere = buildSalesFilterWhere(params, "product");

      const [doctorRows, patientRows, productRows] = await Promise.all([
        prisma.sale.findMany({
          where: { ...doctorWhere, doctorName: { not: null } },
          distinct: ["doctorName"],
          select: { doctorName: true },
          orderBy: { doctorName: "asc" },
        }),
        prisma.sale.findMany({
          where: { ...patientWhere, customerName: { not: null } },
          distinct: ["customerName"],
          select: { customerName: true },
          orderBy: { customerName: "asc" },
        }),
        prisma.saleLine.findMany({
          where: { sale: productSaleWhere },
          distinct: ["productId"],
          select: { product: { select: { name: true } } },
          orderBy: { product: { name: "asc" } },
        }),
      ]);

      return {
        doctors: doctorRows.map((r) => r.doctorName ?? "").filter(Boolean),
        patients: patientRows.map((r) => r.customerName ?? "").filter(Boolean),
        products: productRows.map((r) => r.product.name),
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
      const saleWhere = buildSalesFilterWhere(params);
      const rows = await prisma.saleLine.findMany({
        where: { sale: saleWhere },
        distinct: ["productId"],
        select: { product: { select: { name: true } } },
        orderBy: { product: { name: "asc" } },
      });
      return rows.map((r) => r.product.name);
    },
  );
}
