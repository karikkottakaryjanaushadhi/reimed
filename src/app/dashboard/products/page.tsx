import Link from "next/link";
import { redirect } from "next/navigation";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { ProductsFilterForm, type ProductStockFilter } from "@/app/dashboard/products/products-filter-form";
import { ProductsTable } from "@/app/dashboard/products/products-table";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { getBrandOptions } from "@/lib/brand-options";
import { isProductGstSlab } from "@/lib/product-gst-slabs";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  effectiveListPageSize,
  parseListLimitParam,
} from "@/lib/list-pagination";
import {
  getProductFilterOptions,
  parseProductCategoryFilter,
  parseProductScheduleFilter,
  parseProductTypeFilter,
} from "@/lib/products-filter-options";
import {
  countProductList,
  parseProductListDir,
  parseProductListSort,
  parseProductStockFilter,
  queryProductList,
} from "@/lib/products-list-query";

function productListExtras(
  q: string,
  brand: string,
  supplier: string,
  category: string,
  type: string,
  schedule: string,
  gst: string,
  stock: ProductStockFilter,
  pageSize: number,
  sort: string,
  dir: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (q) e.q = q;
  if (brand) e.brand = brand;
  if (supplier) e.supplier = supplier;
  if (category) e.category = category;
  if (type) e.type = type;
  if (schedule) e.schedule = schedule;
  if (gst) e.gst = gst;
  if (stock) e.stock = stock;
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) e.limit = String(pageSize);
  if (sort && sort !== "name") e.sort = sort;
  if (dir && dir !== "asc") e.dir = dir;
  return e;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    q?: string;
    brand?: string;
    supplier?: string;
    category?: string;
    type?: string;
    schedule?: string;
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
  const supplier = String(sp.supplier ?? "").trim();
  const category = parseProductCategoryFilter(sp.category);
  const type = parseProductTypeFilter(sp.type);
  const schedule = parseProductScheduleFilter(sp.schedule);
  const gstRaw = String(sp.gst ?? "").trim();
  const gst = gstRaw && isProductGstSlab(Number(gstRaw)) ? gstRaw : "";
  const stock = parseProductStockFilter(sp.stock);
  const sort = parseProductListSort(sp.sort);
  const dir = parseProductListDir(sp.dir);
  const rawPage = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const pageSizeRequested = parseListLimitParam(sp.limit);
  const storeId = ctx.activeStoreId;
  const listParams = { storeId, q, brand, supplier, category, type, schedule, gst, stock, sort, dir };

  const skipGuess = (rawPage - 1) * pageSizeRequested;
  const [filterOptions, catalogBrands, totalCount, productsGuess] = await Promise.all([
    getProductFilterOptions({ storeId, q, brand, supplier, category, type, schedule, gst, stock }),
    getBrandOptions(),
    countProductList(listParams),
    queryProductList({
      ...listParams,
      limit: pageSizeRequested,
      offset: skipGuess,
    }),
  ]);
  const pageSize = effectiveListPageSize(pageSizeRequested, totalCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(rawPage, totalPages);
  const skip = (page - 1) * pageSize;
  const products =
    skip === skipGuess && pageSize === pageSizeRequested
      ? productsGuess
      : await queryProductList({
          ...listParams,
          limit: pageSize,
          offset: skip,
        });

  const extras = productListExtras(q, brand, supplier, category, type, schedule, gst, stock, pageSize, sort, dir);
  const exportHref = buildSimpleListUrl("/api/dashboard/products/export", 1, DEFAULT_LIST_PAGE_SIZE, {
    ...(q ? { q } : {}),
    ...(brand ? { brand } : {}),
    ...(supplier ? { supplier } : {}),
    ...(category ? { category } : {}),
    ...(type ? { type } : {}),
    ...(schedule ? { schedule } : {}),
    ...(gst ? { gst } : {}),
    ...(stock ? { stock } : {}),
    ...(sort !== "name" ? { sort } : {}),
    ...(dir !== "asc" ? { dir } : {}),
  });
  const clearHref = buildSimpleListUrl("/dashboard/products", 1, pageSize, {
    ...(pageSize !== DEFAULT_LIST_PAGE_SIZE ? { limit: String(pageSize) } : {}),
    ...(sort !== "name" ? { sort } : {}),
    ...(dir !== "asc" ? { dir } : {}),
  });
  const hasFilters = !!(q || brand || supplier || category || type || schedule || gst || stock);
  let activeFilterCount = 0;
  if (q) activeFilterCount += 1;
  if (brand) activeFilterCount += 1;
  if (supplier) activeFilterCount += 1;
  if (category) activeFilterCount += 1;
  if (type) activeFilterCount += 1;
  if (schedule) activeFilterCount += 1;
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
          supplier={supplier}
          category={category}
          type={type}
          schedule={schedule}
          gst={gst}
          stock={stock}
          initialBrands={filterOptions.brands}
          initialSuppliers={filterOptions.suppliers}
          hiddenLimit={pageSize !== DEFAULT_LIST_PAGE_SIZE ? String(pageSize) : undefined}
          hiddenSort={sort !== "name" ? sort : undefined}
          hiddenDir={dir !== "asc" ? dir : undefined}
          clearHref={clearHref}
          exportHref={exportHref}
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
        brands={catalogBrands}
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
