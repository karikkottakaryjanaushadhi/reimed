import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { drugCodeSearchLikePattern } from "@/lib/drug-code";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { ProductsFilterForm, type ProductStockFilter } from "@/app/dashboard/products/products-filter-form";
import { ProductsTable, type ProductListRow } from "@/app/dashboard/products/products-table";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { gstPctNumber, isProductGstSlab } from "@/lib/product-gst-slabs";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  effectiveListPageSize,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import { getProductBrandOptions } from "@/lib/products-filter-options";

function productListExtras(
  q: string,
  brand: string,
  gst: string,
  stock: ProductStockFilter,
  pageSize: number,
  sort: string,
  dir: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (q) e.q = q;
  if (brand) e.brand = brand;
  if (gst) e.gst = gst;
  if (stock) e.stock = stock;
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) e.limit = String(pageSize);
  if (sort && sort !== "name") e.sort = sort;
  if (dir && dir !== "asc") e.dir = dir;
  return e;
}

function productSortOrder(sort: string, dir: "asc" | "desc", storeId: string) {
  const stockExpr = Prisma.sql`COALESCE(SUM(il."quantity") FILTER (WHERE il."storeId" = ${storeId}), 0)`;
  const tiebreak = Prisma.sql`, p."name" ASC, p."id" ASC`;
  switch (sort) {
    case "sku":
      return Prisma.sql`p."sku" ${Prisma.raw(dir)}${tiebreak}`;
    case "brand":
      return Prisma.sql`COALESCE(b."name", '') ${Prisma.raw(dir)}${tiebreak}`;
    case "generic":
      return Prisma.sql`COALESCE(p."genericName", '') ${Prisma.raw(dir)}${tiebreak}`;
    case "supplier":
      return Prisma.sql`COALESCE(string_agg(DISTINCT s."name", ', '), '') ${Prisma.raw(dir)}${tiebreak}`;
    case "packSize":
      return Prisma.sql`p."packSize" ${Prisma.raw(dir)}${tiebreak}`;
    case "reorderMin":
      return Prisma.sql`p."reorderMin" ${Prisma.raw(dir)}${tiebreak}`;
    case "gst":
      return Prisma.sql`p."gstPct" ${Prisma.raw(dir)}${tiebreak}`;
    case "stock":
      return Prisma.sql`${stockExpr} ${Prisma.raw(dir)}${tiebreak}`;
    case "name":
    default:
      return Prisma.sql`p."name" ${Prisma.raw(dir)}, p."id" ASC`;
  }
}

function parseStockFilter(raw: unknown): ProductStockFilter {
  if (raw === "low" || raw === "out" || raw === "in") return raw;
  return "";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    q?: string;
    brand?: string;
    gst?: string;
    stock?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const brand = String(sp.brand ?? "").trim();
  const gstRaw = String(sp.gst ?? "").trim();
  const gst = gstRaw && isProductGstSlab(Number(gstRaw)) ? gstRaw : "";
  const stock = parseStockFilter(sp.stock);
  const sort =
    sp.sort === "brand" ||
    sp.sort === "supplier" ||
    sp.sort === "packSize" ||
    sp.sort === "reorderMin" ||
    sp.sort === "sku" ||
    sp.sort === "generic" ||
    sp.sort === "gst" ||
    sp.sort === "stock"
      ? sp.sort
      : "name";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "asc";
  const rawPage = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const pageSizeRequested = parseListLimitParam(sp.limit);
  const storeId = ctx.activeStoreId;

  const brandOptions = await getProductBrandOptions({ storeId, q, gst, stock });

  const qPat = q ? `%${q}%` : null;
  const brandPat = brand ? `%${brand}%` : null;
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
  if (brandPat) {
    whereParts.push(Prisma.sql`b."name" ILIKE ${brandPat}`);
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

  const countRows = await prisma.$queryRaw<Array<{ count: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM (
        SELECT p."id"
        FROM "Product" p
        LEFT JOIN "Brand" b ON b."id" = p."brandId"
        LEFT JOIN "InventoryLot" il ON il."productId" = p."id"
        LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
        WHERE ${whereSql}
        GROUP BY p."id", p."reorderMin"
        ${havingSql}
      ) sub
    `,
  );
  const totalCount = Number(countRows[0]?.count ?? 0);
  const pageSize = effectiveListPageSize(pageSizeRequested, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(rawPage, totalPages);
  const skip = (page - 1) * pageSize;

  const productsRaw = await prisma.$queryRaw<
    Array<Omit<ProductListRow, "gstPct" | "packSize" | "reorderMin" | "stockQty"> & {
      gstPct: unknown;
      packSize: unknown;
      reorderMin: unknown;
      stockQty: unknown;
    }>
  >(
    Prisma.sql`
      SELECT p."id" AS "productId",
             p."sku" AS "sku",
             p."name" AS "name",
             p."genericName" AS "genericName",
             p."productCategory" AS "productCategory",
             p."productType" AS "productType",
             p."brandId" AS "brandId",
             p."packSize" AS "packSize",
             p."reorderMin" AS "reorderMin",
             p."gstPct" AS "gstPct",
             b."name" AS "brandName",
             ${stockExpr}::int AS "stockQty",
             NULLIF(string_agg(DISTINCT s."name", ', '), '') AS "suppliers"
      FROM "Product" p
      LEFT JOIN "Brand" b ON b."id" = p."brandId"
      LEFT JOIN "InventoryLot" il ON il."productId" = p."id"
      LEFT JOIN "Supplier" s ON s."id" = il."supplierId"
      WHERE ${whereSql}
      GROUP BY p."id", p."sku", p."name", p."genericName", p."productCategory", p."productType", p."brandId", p."packSize", p."reorderMin", p."gstPct", b."name"
      ${havingSql}
      ORDER BY ${productSortOrder(sort, dir, storeId)}
      LIMIT ${pageSize}
      OFFSET ${skip}
    `,
  );

  const products: ProductListRow[] = productsRaw.map((p) => ({
    productId: p.productId,
    sku: p.sku,
    name: p.name,
    genericName: p.genericName,
    productCategory: p.productCategory,
    productType: p.productType,
    brandId: p.brandId,
    brandName: p.brandName,
    packSize: Number(p.packSize) || 1,
    reorderMin: Number(p.reorderMin) || 0,
    gstPct: gstPctNumber(p.gstPct),
    stockQty: Number(p.stockQty) || 0,
    suppliers: p.suppliers,
  }));

  const extras = productListExtras(q, brand, gst, stock, pageSize, sort, dir);
  const clearHref = buildSimpleListUrl("/dashboard/products", 1, pageSize, {
    ...(pageSize !== DEFAULT_LIST_PAGE_SIZE ? { limit: String(pageSize) } : {}),
    ...(sort !== "name" ? { sort } : {}),
    ...(dir !== "asc" ? { dir } : {}),
  });
  const hasFilters = !!(q || brand || gst || stock);
  let activeFilterCount = 0;
  if (q) activeFilterCount += 1;
  if (brand) activeFilterCount += 1;
  if (gst) activeFilterCount += 1;
  if (stock) activeFilterCount += 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Products</h1>
        {isManager(ctx) ? (
          <Link
            href="/dashboard/products/new"
            className="text-sm font-medium text-brand-blue-light hover:underline"
          >
            Add product →
          </Link>
        ) : null}
      </div>

      <MobileFilterSheet
        title="Filter products"
        description="Search catalog; stock is for the active store. Low stock = at or below reorder minimum."
        activeCount={activeFilterCount}
      >
        <ProductsFilterForm
          q={q}
          brand={brand}
          gst={gst}
          stock={stock}
          initialBrands={brandOptions}
          hiddenLimit={pageSize !== DEFAULT_LIST_PAGE_SIZE ? String(pageSize) : undefined}
          hiddenSort={sort !== "name" ? sort : undefined}
          hiddenDir={dir !== "asc" ? dir : undefined}
          clearHref={clearHref}
        />
      </MobileFilterSheet>

      <ListPageSizeControls
        basePath="/dashboard/products"
        currentLimit={pageSize}
        totalItems={totalCount}
        extraHidden={extras}
      />

      <ProductsTable
        products={products}
        isManager={isManager(ctx)}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        extras={extras}
      />

      {totalCount > 0 ? (
        <ListPaginationNav
          label="Products"
          page={page}
          totalPages={totalPages}
          totalItems={totalCount}
          basePath="/dashboard/products"
          extraHidden={extras}
          prevHref={buildSimpleListUrl("/dashboard/products", Math.max(1, page - 1), pageSize, extras)}
          nextHref={buildSimpleListUrl("/dashboard/products", Math.min(totalPages, page + 1), pageSize, extras)}
        />
      ) : null}

      {products.length === 0 && hasFilters ? (
        <p className="text-center text-xs text-zinc-500">Try clearing filters or broadening your search.</p>
      ) : null}
    </div>
  );
}
