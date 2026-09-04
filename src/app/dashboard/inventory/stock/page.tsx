import Link from "next/link";
import { redirect } from "next/navigation";
import { ListPaginationNav } from "@/components/list-pagination";
import { getAuthContext, isManager } from "@/lib/auth-context";
import {
  DEFAULT_LIST_PAGE_SIZE,
  MIN_LIST_PAGE_SIZE,
  QUICK_PAGE_SIZES,
  listPageSizeInputMax,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { getInventoryFilterOptions } from "@/lib/inventory-filter-options";
import {
  hasActiveExpiryFilter,
  resolveExpiryFilter,
} from "@/lib/inventory-expiry-filter";
import { getBrandOptions } from "@/lib/brand-options";
import {
  countStockLevels,
  parseStockLevelsDir,
  parseStockLevelsSort,
  queryStockLevels,
  resolveStockLevelsFilters,
} from "@/lib/stock-levels-list-query";
import { InventoryFiltersForm } from "@/components/inventory-filters-form";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { StockBrandSelect } from "../stock-brand-select";
import { StockCategorySelect } from "../stock-category-select";
import { StockGstSelect } from "../stock-gst-select";
import { StockListMobile } from "../stock-list-mobile";
import { StockProductNameField } from "../stock-product-name-field";
import { StockTypeSelect } from "../stock-type-select";

const BASE = "/dashboard/inventory/stock";
const EXPORT_BASE = "/api/dashboard/inventory/stock/export";

type StockFilters = {
  q: string;
  supplierId: string;
  brandId: string;
  expiry: string;
  expiryOn: string;
  lowStock: boolean;
};

function stockPaginationHidden(
  filters: StockFilters,
  slimit: number,
  sort: string,
  dir: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (filters.q.trim()) e.q = filters.q.trim();
  if (filters.supplierId.trim()) e.supplierId = filters.supplierId.trim();
  if (filters.brandId.trim()) e.brandId = filters.brandId.trim();
  if (filters.expiryOn.trim()) e.expiryOn = filters.expiryOn.trim();
  else if (filters.expiry.trim()) e.expiry = filters.expiry.trim();
  if (filters.lowStock) e.lowStock = "1";
  if (slimit !== DEFAULT_LIST_PAGE_SIZE) e.slimit = String(slimit);
  if (sort !== "name") e.sort = sort;
  if (dir !== "asc") e.dir = dir;
  return e;
}

function buildStockUrl(
  base: string,
  filters: StockFilters,
  spage: number,
  slimit: number,
  sort: string,
  dir: string,
): string {
  const p = new URLSearchParams(stockPaginationHidden(filters, slimit, sort, dir));
  if (spage > 1) p.set("spage", String(spage));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

function StockPageSizeControls({
  filters,
  spage,
  stockPageSize,
  sectionTotal,
  sort,
  dir,
}: {
  filters: StockFilters;
  spage: number;
  stockPageSize: number;
  sectionTotal: number;
  sort: string;
  dir: string;
}) {
  const inputMax = listPageSizeInputMax(sectionTotal);

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="uppercase tracking-wide">Rows per page</span>
      <span className="flex flex-wrap gap-1">
        {QUICK_PAGE_SIZES.map((n) => {
          const active = n === stockPageSize;
          return (
            <Link
              key={n}
              href={buildStockUrl(BASE, filters, 1, n, sort, dir)}
              scroll={false}
              className={`rounded-md px-2 py-1 font-medium ${
                active
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {n}
            </Link>
          );
        })}
      </span>
      <form method="get" action={BASE} className="flex flex-wrap items-center gap-2">
        {filters.q.trim() ? <input type="hidden" name="q" value={filters.q} /> : null}
        {filters.supplierId ? <input type="hidden" name="supplierId" value={filters.supplierId} /> : null}
        {filters.brandId ? <input type="hidden" name="brandId" value={filters.brandId} /> : null}
        {filters.expiryOn ? (
          <input type="hidden" name="expiryOn" value={filters.expiryOn} />
        ) : filters.expiry ? (
          <input type="hidden" name="expiry" value={filters.expiry} />
        ) : null}
        {filters.lowStock ? <input type="hidden" name="lowStock" value="1" /> : null}
        {sort !== "name" ? <input type="hidden" name="sort" value={sort} /> : null}
        {dir !== "asc" ? <input type="hidden" name="dir" value={dir} /> : null}
        <input type="hidden" name="spage" value={String(spage)} />
        <label className="flex items-center gap-1.5">
          <span className="whitespace-nowrap">Other</span>
          <input
            name="slimit"
            type="number"
            min={MIN_LIST_PAGE_SIZE}
            max={inputMax}
            step={1}
            defaultValue={Math.min(stockPageSize, inputMax)}
            className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Apply
        </button>
      </form>
      <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{sectionTotal} total</span>
    </div>
  );
}

export default async function InventoryStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    spage?: string;
    supplierId?: string;
    brandId?: string;
    expiry?: string;
    expiryOn?: string;
    lowStock?: string;
    slimit?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const canEditBrand = isManager(ctx);

  const sp = await searchParams;
  const sort = parseStockLevelsSort(sp.sort);
  const dir = parseStockLevelsDir(sp.dir);
  const rawSpage = Math.max(1, parseInt(String(sp.spage ?? "1"), 10) || 1);
  const expiryRaw = typeof sp.expiry === "string" ? sp.expiry : "";
  const expiryOnRaw = typeof sp.expiryOn === "string" ? sp.expiryOn : "";
  const lowStockOnly = sp.lowStock === "1";
  const stockPageSize = parseListLimitParam(sp.slimit);

  const storeId = ctx.activeStoreId;

  const resolvedFilters = await resolveStockLevelsFilters({
    storeId,
    q: typeof sp.q === "string" ? sp.q : "",
    supplierId: typeof sp.supplierId === "string" ? sp.supplierId : "",
    brandId: typeof sp.brandId === "string" ? sp.brandId : "",
    expiry: expiryRaw,
    expiryOn: expiryOnRaw,
    lowStock: lowStockOnly,
  });

  const { preset: expiryPreset, expiryOnYmd: expiryOnFilter } = resolveExpiryFilter(
    resolvedFilters.expiry,
    resolvedFilters.expiryOn,
  );

  const filters: StockFilters = {
    q: resolvedFilters.q,
    supplierId: resolvedFilters.supplierId,
    brandId: resolvedFilters.brandId,
    expiry: expiryPreset,
    expiryOn: expiryOnFilter,
    lowStock: resolvedFilters.lowStock,
  };

  const filterOptions = await getInventoryFilterOptions({
    storeId,
    q: filters.q,
    supplierId: filters.supplierId,
    brandId: filters.brandId,
    expiry: expiryRaw,
    expiryOn: expiryOnRaw,
    lowStock: lowStockOnly,
  });

  const brandOptions = await getBrandOptions();

  const stockProductTotal = await countStockLevels(storeId, resolvedFilters);
  const totalStockPages = Math.max(1, Math.ceil(stockProductTotal / stockPageSize));
  const spage = Math.min(rawSpage, totalStockPages);
  const stockSkip = (spage - 1) * stockPageSize;

  const stock = await queryStockLevels({
    storeId,
    filters: resolvedFilters,
    sort,
    dir,
    limit: stockPageSize,
    offset: stockSkip,
  });

  const toBatches = new URLSearchParams();
  if (filters.q.trim()) toBatches.set("q", filters.q.trim());
  if (filters.supplierId) toBatches.set("supplierId", filters.supplierId);
  if (filters.brandId) toBatches.set("brandId", filters.brandId);
  if (expiryOnFilter) toBatches.set("expiryOn", expiryOnFilter);
  else if (expiryPreset) toBatches.set("expiry", expiryPreset);
  if (lowStockOnly) toBatches.set("lowStock", "1");
  const batchesHref =
    toBatches.toString().length > 0 ? `/dashboard/inventory/batches?${toBatches}` : "/dashboard/inventory/batches";

  const exportHref = buildStockUrl(EXPORT_BASE, filters, 1, DEFAULT_LIST_PAGE_SIZE, sort, dir);

  let activeFilterCount = 0;
  if (filters.q.trim()) activeFilterCount += 1;
  if (filters.supplierId) activeFilterCount += 1;
  if (filters.brandId) activeFilterCount += 1;
  if (hasActiveExpiryFilter(expiryPreset, expiryOnFilter)) activeFilterCount += 1;
  if (lowStockOnly) activeFilterCount += 1;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Stock levels</h1>
        <Link href={batchesHref} className="text-sm font-medium text-brand-blue-light hover:underline">
          Batches & expiry →
        </Link>
      </div>

      <MobileFilterSheet title="Filter stock" description="Search products and narrow by supplier, brand, or expiry." activeCount={activeFilterCount}>
        <InventoryFiltersForm
          action={BASE}
          filters={filters}
          initialOptions={filterOptions}
          clearHref={buildStockUrl(
            BASE,
            { q: "", supplierId: "", brandId: "", expiry: "", expiryOn: "", lowStock: false },
            1,
            stockPageSize,
            sort,
            dir,
          )}
          exportHref={exportHref}
          hiddenFields={
            <>
              {stockPageSize !== DEFAULT_LIST_PAGE_SIZE ? <input type="hidden" name="slimit" value={stockPageSize} /> : null}
              {sort !== "name" ? <input type="hidden" name="sort" value={sort} /> : null}
              {dir !== "asc" ? <input type="hidden" name="dir" value={dir} /> : null}
            </>
          }
        />
      </MobileFilterSheet>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Stock levels
          {filters.supplierId ? (
            <span className="ml-2 font-normal normal-case text-zinc-500">
              (quantities from selected supplier only)
            </span>
          ) : null}
        </h2>
        <StockPageSizeControls
          filters={filters}
          spage={spage}
          stockPageSize={stockPageSize}
          sectionTotal={stockProductTotal}
          sort={sort}
          dir={dir}
        />
        <StockListMobile stock={stock} brands={brandOptions} canEditBrand={canEditBrand} />

        <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-3">
                <Link
                  href={buildStockUrl(BASE, filters, 1, stockPageSize, "name", sort === "name" && dir === "asc" ? "desc" : "asc")}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Product {sort === "name" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
                <th className="min-w-[10rem] px-4 py-3">
                  <Link
                    href={buildStockUrl(BASE, filters, 1, stockPageSize, "brand", sort === "brand" && dir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Brand {sort === "brand" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="min-w-[7rem] px-4 py-3">
                  <Link
                    href={buildStockUrl(BASE, filters, 1, stockPageSize, "productCategory", sort === "productCategory" && dir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Category {sort === "productCategory" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="min-w-[7rem] px-4 py-3">
                  <Link
                    href={buildStockUrl(BASE, filters, 1, stockPageSize, "productType", sort === "productType" && dir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Type {sort === "productType" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="min-w-[6rem] px-4 py-3">
                  <Link
                    href={buildStockUrl(BASE, filters, 1, stockPageSize, "gstPct", sort === "gstPct" && dir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    GST % {sort === "gstPct" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="min-w-[8rem] px-4 py-3">
                  <Link
                    href={buildStockUrl(BASE, filters, 1, stockPageSize, "supplier", sort === "supplier" && dir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Supplier {sort === "supplier" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    href={buildStockUrl(BASE, filters, 1, stockPageSize, "qty", sort === "qty" && dir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Qty {sort === "qty" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right">
                  <Link
                    href={buildStockUrl(BASE, filters, 1, stockPageSize, "reorderMin", sort === "reorderMin" && dir === "asc" ? "desc" : "asc")}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Reorder {sort === "reorderMin" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.productId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="break-words px-4 py-2 align-top" title={s.name}>
                    <StockProductNameField productId={s.productId} name={s.name} canEdit={canEditBrand} />
                  </td>
                  <td className="px-4 py-2 align-top">
                    <StockBrandSelect
                      productId={s.productId}
                      brandId={s.brandId}
                      brandName={s.brandName}
                      brands={brandOptions}
                      canEdit={canEditBrand}
                    />
                  </td>
                  <td className="px-4 py-2 align-top">
                    <StockCategorySelect
                      productId={s.productId}
                      productCategory={s.productCategory}
                      canEdit={canEditBrand}
                    />
                  </td>
                  <td className="px-4 py-2 align-top">
                    <StockTypeSelect
                      productId={s.productId}
                      productType={s.productType}
                      canEdit={canEditBrand}
                    />
                  </td>
                  <td className="px-4 py-2 align-top">
                    <StockGstSelect productId={s.productId} gstPct={s.gstPct} canEdit={canEditBrand} />
                  </td>
                  <td
                    className="max-w-[14rem] truncate px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400"
                    title={s.supplier ?? undefined}
                  >
                    {s.supplier ?? "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right ${s.qty <= s.reorderMin ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}
                  >
                    {s.qty}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-500">{s.reorderMin}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stock.length === 0 && (
            <p className="px-4 py-6 text-center text-zinc-500">
              {filters.q.trim() ||
              filters.supplierId ||
              filters.brandId ||
              hasActiveExpiryFilter(expiryPreset, expiryOnFilter) ||
              lowStockOnly
                ? "No matching stock for these filters."
                : "No stock on hand."}
            </p>
          )}
        </div>
        {stockProductTotal > 0 ? (
          <ListPaginationNav
            label="Products"
            page={spage}
            totalPages={totalStockPages}
            totalItems={stockProductTotal}
            basePath={BASE}
            pageParamName="spage"
            extraHidden={stockPaginationHidden(filters, stockPageSize, sort, dir)}
            prevHref={buildStockUrl(BASE, filters, Math.max(1, spage - 1), stockPageSize, sort, dir)}
            nextHref={buildStockUrl(BASE, filters, Math.min(totalStockPages, spage + 1), stockPageSize, sort, dir)}
          />
        ) : null}
      </section>
    </div>
  );
}
