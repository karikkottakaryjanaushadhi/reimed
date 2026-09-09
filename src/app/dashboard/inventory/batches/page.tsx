import Link from "next/link";
import { redirect } from "next/navigation";
import { InventoryFiltersForm } from "@/components/inventory-filters-form";
import { ListPaginationNav } from "@/components/list-pagination";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { getAuthContext, isManager } from "@/lib/auth-context";
import {
  DEFAULT_LIST_PAGE_SIZE,
  MIN_LIST_PAGE_SIZE,
  QUICK_PAGE_SIZES,
  listPageSizeInputMax,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { getInventoryFilterOptions, parseInventoryLotQtyFilter } from "@/lib/inventory-filter-options";
import { prisma } from "@/lib/prisma";
import { EXPIRY_SOON_DAYS, hasActiveExpiryFilter, resolveExpiryFilter } from "@/lib/inventory-expiry-filter";
import { parseProductCategoryFilter, parseProductScheduleFilter, parseProductTypeFilter } from "@/lib/products-filter-options";
import { getBrandOptions } from "@/lib/brand-options";
import {
  countInventoryBatches,
  queryInventoryBatches,
} from "@/lib/inventory-batches-list-query";
import {
  InventoryBatchTable,
  type BatchRow,
  type BatchTableSortHrefs,
} from "../inventory-batch-table";

const BASE = "/dashboard/inventory/batches";
const EXPORT_BASE = "/api/dashboard/inventory/batches/export";

type BatchFilters = {
  q: string;
  supplierId: string;
  brandId: string;
  expiry: string;
  expiryOn: string;
  lowStock: boolean;
  category: string;
  type: string;
  schedule: string;
  qty: string;
};

const EMPTY_BATCH_FILTERS: BatchFilters = {
  q: "",
  supplierId: "",
  brandId: "",
  expiry: "",
  expiryOn: "",
  lowStock: false,
  category: "",
  type: "",
  schedule: "",
  qty: "",
};

function batchSortToggleDir(
  currentSort: string,
  currentDir: "asc" | "desc",
  column: string,
): "asc" | "desc" {
  return currentSort === column && currentDir === "asc" ? "desc" : "asc";
}

function batchPaginationHidden(
  filters: BatchFilters,
  blimit: number,
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
  if (filters.category.trim()) e.category = filters.category.trim();
  if (filters.type.trim()) e.type = filters.type.trim();
  if (filters.schedule.trim()) e.schedule = filters.schedule.trim();
  if (filters.qty.trim()) e.qty = filters.qty.trim();
  if (blimit !== DEFAULT_LIST_PAGE_SIZE) e.blimit = String(blimit);
  if (sort !== "productName") e.sort = sort;
  if (dir !== "asc") e.dir = dir;
  return e;
}

function buildBatchUrl(
  filters: BatchFilters,
  bpage: number,
  blimit: number,
  sort: string,
  dir: string,
  base: string = BASE,
): string {
  const p = new URLSearchParams(batchPaginationHidden(filters, blimit, sort, dir));
  if (bpage > 1) p.set("bpage", String(bpage));
  // Export ignores page size; omit blimit so the link stays filter-focused.
  if (base === EXPORT_BASE) {
    p.delete("blimit");
    p.delete("bpage");
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

function BatchPageSizeControls({
  filters,
  bpage,
  batchPageSize,
  sectionTotal,
  sort,
  dir,
}: {
  filters: BatchFilters;
  bpage: number;
  batchPageSize: number;
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
          const active = n === batchPageSize;
          return (
            <Link
              key={n}
              href={buildBatchUrl(filters, 1, n, sort, dir)}
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
        {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
        {filters.type ? <input type="hidden" name="type" value={filters.type} /> : null}
        {filters.schedule ? <input type="hidden" name="schedule" value={filters.schedule} /> : null}
        {filters.qty ? <input type="hidden" name="qty" value={filters.qty} /> : null}
        {sort !== "productName" ? <input type="hidden" name="sort" value={sort} /> : null}
        {dir !== "asc" ? <input type="hidden" name="dir" value={dir} /> : null}
        <input type="hidden" name="bpage" value={String(bpage)} />
        <label className="flex items-center gap-1.5">
          <span className="whitespace-nowrap">Other</span>
          <input
            name="blimit"
            type="number"
            min={MIN_LIST_PAGE_SIZE}
            max={inputMax}
            step={1}
            defaultValue={Math.min(batchPageSize, inputMax)}
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

export default async function InventoryBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    bpage?: string;
    supplierId?: string;
    brandId?: string;
    expiry?: string;
    expiryOn?: string;
    lowStock?: string;
    blimit?: string;
    sort?: string;
    dir?: string;
    category?: string;
    type?: string;
    schedule?: string;
    qty?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const canEditProductMeta = isManager(ctx);

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort =
    sp.sort === "brand" ||
    sp.sort === "productCategory" ||
    sp.sort === "gstPct" ||
    sp.sort === "packSize" ||
    sp.sort === "supplier" ||
    sp.sort === "batchNo" ||
    sp.sort === "expiryDate" ||
    sp.sort === "days" ||
    sp.sort === "quantity" ||
    sp.sort === "reorderMin" ||
    sp.sort === "costPrice" ||
    sp.sort === "mrp" ||
    sp.sort === "saleRate" ||
    sp.sort === "salesDiscountPct" ||
    sp.sort === "salesDiscountRs" ||
    sp.sort === "marginPercent" ||
    sp.sort === "stockCorrected"
      ? sp.sort
      : "productName";
  const dir: "asc" | "desc" = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "asc";
  const rawBpage = Math.max(1, parseInt(String(sp.bpage ?? "1"), 10) || 1);
  const rawSupplierId = typeof sp.supplierId === "string" ? sp.supplierId.trim() : "";
  const rawBrandId = typeof sp.brandId === "string" ? sp.brandId.trim() : "";
  const expiryRaw = typeof sp.expiry === "string" ? sp.expiry : "";
  const expiryOnRaw = typeof sp.expiryOn === "string" ? sp.expiryOn : "";
  const { preset: expiryPreset, expiryOnYmd: expiryOnFilter } = resolveExpiryFilter(expiryRaw, expiryOnRaw);
  const lowStockOnly = sp.lowStock === "1";
  const category = parseProductCategoryFilter(sp.category);
  const type = parseProductTypeFilter(sp.type);
  const schedule = parseProductScheduleFilter(sp.schedule);
  const qty = parseInventoryLotQtyFilter(sp.qty);
  const batchPageSize = parseListLimitParam(sp.blimit);

  const canAdjust = true;
  const storeId = ctx.activeStoreId;

  const [filterOptions, brandOptions] = await Promise.all([
    getInventoryFilterOptions({
      storeId,
      q,
      supplierId: rawSupplierId,
      brandId: rawBrandId,
      expiry: expiryRaw,
      expiryOn: expiryOnRaw,
      lowStock: lowStockOnly,
      category,
      type,
      schedule,
      qty,
    }),
    getBrandOptions(),
  ]);

  let supplierFilterId = "";
  if (rawSupplierId) {
    const match = filterOptions.suppliers.find((s) => s.id === rawSupplierId);
    if (match) supplierFilterId = match.id;
    else {
      const exists = await prisma.supplier.findFirst({
        where: { id: rawSupplierId, inventoryLots: { some: { storeId } } },
        select: { id: true },
      });
      if (exists) supplierFilterId = rawSupplierId;
    }
  }

  let brandFilterId = "";
  if (rawBrandId) {
    const match = filterOptions.brands.find((b) => b.id === rawBrandId);
    if (match) brandFilterId = match.id;
    else {
      const exists = await prisma.brand.findFirst({
        where: { id: rawBrandId },
        select: { id: true },
      });
      if (exists) brandFilterId = rawBrandId;
    }
  }

  const filters: BatchFilters = {
    q,
    supplierId: supplierFilterId,
    brandId: brandFilterId,
    expiry: expiryPreset,
    expiryOn: expiryOnFilter,
    lowStock: lowStockOnly,
    category,
    type,
    schedule,
    qty,
  };

  const skipGuess = (rawBpage - 1) * batchPageSize;
  const listFilters = {
    q: filters.q,
    supplierId: filters.supplierId,
    brandId: filters.brandId,
    expiry: filters.expiry,
    expiryOn: filters.expiryOn,
    lowStock: filters.lowStock,
    category: filters.category,
    type: filters.type,
    schedule: filters.schedule,
    qty: parseInventoryLotQtyFilter(filters.qty),
  };
  const [batchTotal, batchGuess] = await Promise.all([
    countInventoryBatches({ storeId, filters: listFilters }),
    queryInventoryBatches({
      storeId,
      filters: listFilters,
      sort,
      dir,
      limit: batchPageSize,
      offset: skipGuess,
    }),
  ]);
  const totalBatchPages = Math.max(1, Math.ceil(batchTotal / batchPageSize));
  const bpage = Math.min(rawBpage, totalBatchPages);
  const batchSkip = (bpage - 1) * batchPageSize;
  const batchRows: BatchRow[] =
    batchSkip === skipGuess
      ? batchGuess
      : await queryInventoryBatches({
          storeId,
          filters: listFilters,
          sort,
          dir,
          limit: batchPageSize,
          offset: batchSkip,
        });

  const toStock = new URLSearchParams();
  if (q.trim()) toStock.set("q", q.trim());
  if (supplierFilterId) toStock.set("supplierId", supplierFilterId);
  if (brandFilterId) toStock.set("brandId", brandFilterId);
  if (expiryOnFilter) toStock.set("expiryOn", expiryOnFilter);
  else if (expiryPreset) toStock.set("expiry", expiryPreset);
  if (lowStockOnly) toStock.set("lowStock", "1");
  const stockLevelsHref =
    toStock.toString().length > 0 ? `/dashboard/inventory/stock?${toStock}` : "/dashboard/inventory/stock";

  const batchSortHrefs: BatchTableSortHrefs = {
    productName: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "productName",
      batchSortToggleDir(sort, dir, "productName"),
    ),
    brand: buildBatchUrl(filters, 1, batchPageSize, "brand", batchSortToggleDir(sort, dir, "brand")),
    productCategory: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "productCategory",
      batchSortToggleDir(sort, dir, "productCategory"),
    ),
    gstPct: buildBatchUrl(filters, 1, batchPageSize, "gstPct", batchSortToggleDir(sort, dir, "gstPct")),
    packSize: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "packSize",
      batchSortToggleDir(sort, dir, "packSize"),
    ),
    supplier: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "supplier",
      batchSortToggleDir(sort, dir, "supplier"),
    ),
    batchNo: buildBatchUrl(filters, 1, batchPageSize, "batchNo", batchSortToggleDir(sort, dir, "batchNo")),
    expiryDate: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "expiryDate",
      batchSortToggleDir(sort, dir, "expiryDate"),
    ),
    days: buildBatchUrl(filters, 1, batchPageSize, "days", batchSortToggleDir(sort, dir, "days")),
    quantity: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "quantity",
      batchSortToggleDir(sort, dir, "quantity"),
    ),
    reorderMin: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "reorderMin",
      batchSortToggleDir(sort, dir, "reorderMin"),
    ),
    costPrice: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "costPrice",
      batchSortToggleDir(sort, dir, "costPrice"),
    ),
    mrp: buildBatchUrl(filters, 1, batchPageSize, "mrp", batchSortToggleDir(sort, dir, "mrp")),
    saleRate: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "saleRate",
      batchSortToggleDir(sort, dir, "saleRate"),
    ),
    salesDiscountPct: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "salesDiscountPct",
      batchSortToggleDir(sort, dir, "salesDiscountPct"),
    ),
    salesDiscountRs: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "salesDiscountRs",
      batchSortToggleDir(sort, dir, "salesDiscountRs"),
    ),
    marginPercent: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "marginPercent",
      batchSortToggleDir(sort, dir, "marginPercent"),
    ),
    stockCorrected: buildBatchUrl(
      filters,
      1,
      batchPageSize,
      "stockCorrected",
      batchSortToggleDir(sort, dir, "stockCorrected"),
    ),
  };


  let activeFilterCount = 0;
  if (q.trim()) activeFilterCount += 1;
  if (supplierFilterId) activeFilterCount += 1;
  if (brandFilterId) activeFilterCount += 1;
  if (hasActiveExpiryFilter(expiryPreset, expiryOnFilter)) activeFilterCount += 1;
  if (lowStockOnly) activeFilterCount += 1;
  if (category) activeFilterCount += 1;
  if (type) activeFilterCount += 1;
  if (schedule) activeFilterCount += 1;
  if (qty) activeFilterCount += 1;

  const exportHref = buildBatchUrl(filters, 1, DEFAULT_LIST_PAGE_SIZE, sort, dir, EXPORT_BASE);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Batches & expiry</h1>
        <Link href={stockLevelsHref} className="text-sm font-medium text-brand-blue-light hover:underline">
          Stock levels →
        </Link>
      </div>

      <MobileFilterSheet
        title="Filter batches"
        description="Search by product or batch number, and narrow by supplier, brand, category, type, schedule, qty, or expiry."
        activeCount={activeFilterCount}
      >
        <InventoryFiltersForm
          action={BASE}
          variant="batches"
          filters={filters}
          initialOptions={filterOptions}
          clearHref={buildBatchUrl(EMPTY_BATCH_FILTERS, 1, batchPageSize, sort, dir)}
          exportHref={exportHref}
          hiddenFields={
            <>
              {batchPageSize !== DEFAULT_LIST_PAGE_SIZE ? <input type="hidden" name="blimit" value={batchPageSize} /> : null}
              {sort !== "productName" ? <input type="hidden" name="sort" value={sort} /> : null}
              {dir !== "asc" ? <input type="hidden" name="dir" value={dir} /> : null}
            </>
          }
        />
      </MobileFilterSheet>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">Batches & expiry</h2>
        <p className="mb-2 text-xs text-zinc-500">
          Edit any column, then <span className="font-medium text-zinc-400">Save row</span>. Tick{" "}
          <span className="font-medium text-zinc-400">Counted OK</span> when the line matches your physical count (blue
          highlight).
        </p>
        <BatchPageSizeControls
          filters={filters}
          bpage={bpage}
          batchPageSize={batchPageSize}
          sectionTotal={batchTotal}
          sort={sort}
          dir={dir}
        />
        <InventoryBatchTable
          rows={batchRows}
          canAdjust={canAdjust}
          brands={brandOptions}
          canEditProductMeta={canEditProductMeta}
          sortHeaders={{ activeSort: sort, dir, hrefs: batchSortHrefs }}
        />
        {batchTotal > 0 ? (
          <ListPaginationNav
            label="Batches"
            page={bpage}
            totalPages={totalBatchPages}
            totalItems={batchTotal}
            basePath={BASE}
            pageParamName="bpage"
            extraHidden={batchPaginationHidden(filters, batchPageSize, sort, dir)}
            prevHref={buildBatchUrl(filters, Math.max(1, bpage - 1), batchPageSize, sort, dir)}
            nextHref={buildBatchUrl(filters, Math.min(totalBatchPages, bpage + 1), batchPageSize, sort, dir)}
          />
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          Amber: expires within {EXPIRY_SOON_DAYS} days. Red: expired. Green tint: marked counted OK (temporary audit).
        </p>
      </section>
    </div>
  );
}
