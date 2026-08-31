import { Prisma } from "@prisma/client";
import { drugCodeSearchLikePattern } from "@/lib/drug-code";
import { isProductGstSlab } from "@/lib/product-gst-slabs";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";

export type ProductStockFilter = "" | "low" | "out" | "in";

export type ProductFilterParams = {
  storeId: string;
  q?: string;
  gst?: string;
  stock?: ProductStockFilter;
};

function buildProductFilterSql(params: ProductFilterParams) {
  const q = params.q?.trim() ?? "";
  const gstRaw = params.gst?.trim() ?? "";
  const gst = gstRaw && isProductGstSlab(Number(gstRaw)) ? gstRaw : "";
  const stock = params.stock ?? "";
  const storeId = params.storeId;

  const qPat = q ? `%${q}%` : null;
  const gstNum = gst ? Number(gst) : null;
  const stockExpr = Prisma.sql`COALESCE(SUM(il."quantity") FILTER (WHERE il."storeId" = ${storeId}), 0)`;

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
  if (gstNum != null) {
    whereParts.push(Prisma.sql`p."gstPct" = ${gstNum}`);
  }
  const whereSql = Prisma.join(whereParts, " AND ");

  let havingSql = Prisma.empty;
  if (stock === "low") {
    havingSql = Prisma.sql`HAVING ${stockExpr} <= p."reorderMin" AND p."reorderMin" > 0`;
  } else if (stock === "out") {
    havingSql = Prisma.sql`HAVING ${stockExpr} = 0`;
  } else if (stock === "in") {
    havingSql = Prisma.sql`HAVING ${stockExpr} > 0`;
  }

  return { whereSql, havingSql, stockExpr, storeId };
}

export async function getProductBrandOptions(params: ProductFilterParams): Promise<string[]> {
  return withServerTimedCache(
    "product-brand-options",
    {
      storeId: params.storeId,
      q: params.q?.trim() ?? "",
      gst: params.gst?.trim() ?? "",
      stock: params.stock ?? "",
    },
    20_000,
    async () => {
      const { whereSql, havingSql } = buildProductFilterSql(params);

      const rows = await prisma.$queryRaw<Array<{ name: string }>>(
        Prisma.sql`
      SELECT DISTINCT b."name" AS "name"
      FROM "Product" p
      INNER JOIN "Brand" b ON b."id" = p."brandId"
      LEFT JOIN "InventoryLot" il ON il."productId" = p."id"
      WHERE ${whereSql}
      GROUP BY p."id", p."reorderMin", b."name"
      ${havingSql}
      ORDER BY b."name" ASC
      `,
      );

      return rows.map((r) => r.name).filter(Boolean);
    },
  );
}
