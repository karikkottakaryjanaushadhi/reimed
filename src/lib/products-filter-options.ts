import { Prisma } from "@prisma/client";
import { drugCodeSearchLikePattern } from "@/lib/drug-code";
import { isProductCategory } from "@/lib/product-categories";
import { isProductGstSlab } from "@/lib/product-gst-slabs";
import { isProductSchedule } from "@/lib/product-schedules";
import { isProductType } from "@/lib/product-types";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type ProductStockFilter = "" | "low" | "out" | "in";

export type ProductFilterParams = {
  storeId: string;
  q?: string;
  brand?: string;
  gst?: string;
  stock?: ProductStockFilter;
  category?: string;
  type?: string;
  schedule?: string;
  supplier?: string;
};

export function parseProductCategoryFilter(raw: unknown): string {
  const v = String(raw ?? "").trim();
  return isProductCategory(v) ? v : "";
}

export function parseProductTypeFilter(raw: unknown): string {
  const v = String(raw ?? "").trim();
  return isProductType(v) ? v : "";
}

export function parseProductScheduleFilter(raw: unknown): string {
  const v = String(raw ?? "").trim();
  return isProductSchedule(v) ? v : "";
}

export function productCatalogWhereParts(
  params: ProductFilterParams,
  omit?: "brand" | "supplier",
): Prisma.Sql[] {
  const q = params.q?.trim() ?? "";
  const brand = omit === "brand" ? "" : (params.brand?.trim() ?? "");
  const gstRaw = params.gst?.trim() ?? "";
  const gst = gstRaw && isProductGstSlab(Number(gstRaw)) ? gstRaw : "";
  const category = parseProductCategoryFilter(params.category);
  const type = parseProductTypeFilter(params.type);
  const schedule = parseProductScheduleFilter(params.schedule);
  const supplier = omit === "supplier" ? "" : (params.supplier?.trim() ?? "");

  const qPat = q ? `%${q}%` : null;
  const brandPat = brand ? `%${brand}%` : null;
  const supplierPat = supplier ? `%${supplier}%` : null;
  const gstNum = gst ? Number(gst) : null;

  const whereParts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (qPat) {
    const codePat = drugCodeSearchLikePattern(q);
    const skuClause = codePat ? Prisma.sql`OR p."sku" ILIKE ${codePat}` : Prisma.empty;
    whereParts.push(
      Prisma.sql`(
        p."name" ILIKE ${qPat}
        ${skuClause}
        OR p."genericName" ILIKE ${qPat}
        OR b."name" ILIKE ${qPat}
      )`,
    );
  }
  if (brandPat) {
    whereParts.push(Prisma.sql`b."name" ILIKE ${brandPat}`);
  }
  if (gstNum != null) {
    whereParts.push(Prisma.sql`p."gstPct" = ${gstNum}`);
  }
  if (category) {
    whereParts.push(Prisma.sql`p."productCategory" = ${category}`);
  }
  if (type) {
    whereParts.push(Prisma.sql`p."productType" = ${type}`);
  }
  if (schedule) {
    whereParts.push(Prisma.sql`p."productSchedule" = ${schedule}`);
  }
  if (supplierPat) {
    whereParts.push(Prisma.sql`s."name" ILIKE ${supplierPat}`);
  }
  return whereParts;
}

function productStockHavingSql(stock: ProductStockFilter, storeId: string) {
  const stockExpr = Prisma.sql`COALESCE(SUM(il."quantity") FILTER (WHERE il."storeId" = ${storeId}), 0)`;
  if (stock === "low") {
    return Prisma.sql`HAVING ${stockExpr} <= p."reorderMin" AND p."reorderMin" > 0`;
  }
  if (stock === "out") {
    return Prisma.sql`HAVING ${stockExpr} = 0`;
  }
  if (stock === "in") {
    return Prisma.sql`HAVING ${stockExpr} > 0`;
  }
  return Prisma.empty;
}

function filterCacheKey(params: ProductFilterParams) {
  return {
    storeId: params.storeId,
    q: params.q?.trim() ?? "",
    brand: params.brand?.trim() ?? "",
    gst: params.gst?.trim() ?? "",
    stock: params.stock ?? "",
    category: parseProductCategoryFilter(params.category),
    type: parseProductTypeFilter(params.type),
    schedule: parseProductScheduleFilter(params.schedule),
    supplier: params.supplier?.trim() ?? "",
  };
}

export async function getProductFilterOptions(
  params: ProductFilterParams,
): Promise<{ brands: string[]; suppliers: string[] }> {
  return withServerTimedCache("product-filter-options", filterCacheKey(params), 20_000, async () => {
    const stock = params.stock ?? "";
    const storeId = params.storeId;
    const havingSql = productStockHavingSql(stock, storeId);
    const brandWhere = Prisma.join(productCatalogWhereParts(params, "brand"), " AND ");
    const supplierWhere = Prisma.join(productCatalogWhereParts(params, "supplier"), " AND ");

    const [brandRows, supplierRows] = await Promise.all([
      prisma.$queryRaw<Array<{ name: string }>>(
        Prisma.sql`
          SELECT DISTINCT b."name" AS "name"
          FROM "Product" p
          INNER JOIN "Brand" b ON b."id" = p."brandId"
          LEFT JOIN "InventoryLot" il ON il."productId" = p."id"
          LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
          WHERE ${brandWhere}
          GROUP BY p."id", p."reorderMin", b."name"
          ${havingSql}
          ORDER BY b."name" ASC
        `,
      ),
      prisma.$queryRaw<Array<{ name: string }>>(
        Prisma.sql`
          SELECT DISTINCT s."name" AS "name"
          FROM "Product" p
          LEFT JOIN "Brand" b ON b."id" = p."brandId"
          INNER JOIN "InventoryLot" il ON il."productId" = p."id"
          INNER JOIN "Supplier" s ON s."id" = il."supplierId"
          WHERE ${supplierWhere}
          GROUP BY p."id", p."reorderMin", s."name"
          ${havingSql}
          ORDER BY s."name" ASC
        `,
      ),
    ]);

    return {
      brands: brandRows.map((r) => r.name).filter(Boolean),
      suppliers: supplierRows.map((r) => r.name).filter(Boolean),
    };
  });
}

export async function getProductBrandOptions(params: ProductFilterParams): Promise<string[]> {
  const { brands } = await getProductFilterOptions(params);
  return brands;
}
