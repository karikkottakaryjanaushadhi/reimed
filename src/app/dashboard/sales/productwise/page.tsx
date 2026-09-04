import Link from "next/link";
import { redirect } from "next/navigation";
import { formatAppDateYmd } from "@/lib/app-timezone";
import { ProductwiseFilterForm } from "@/app/dashboard/sales/productwise/productwise-filter-form";
import { ProductwiseListMobile } from "@/app/dashboard/sales/productwise/productwise-list-mobile";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { getAuthContext } from "@/lib/auth-context";
import { DEFAULT_LIST_PAGE_SIZE, parseListLimitParam } from "@/lib/list-pagination";
import { sumProductwiseRows, formatProductwiseMrp } from "@/lib/productwise-sales-aggregate";
import { loadProductwiseSalesReport } from "@/lib/productwise-sales-report";
import { getProductwiseProductOptions } from "@/lib/sales-filter-options";

function buildProductwiseSearchUrl(
  basePath: string,
  page: number,
  limit: number,
  extra?: Record<string, string>,
): string {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v) pairs.push([k, v]);
  }
  if (page > 1) pairs.push(["page", String(page)]);
  if (limit !== DEFAULT_LIST_PAGE_SIZE) pairs.push(["limit", String(limit)]);
  const params = new URLSearchParams();
  for (const [k, v] of pairs) {
    params.set(k, v);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export default async function ProductwiseSalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    from?: string;
    to?: string;
    product?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const rawPage = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const pageSize = parseListLimitParam(sp.limit);
  const today = formatAppDateYmd();
  const fromRaw = typeof sp.from === "string" ? sp.from.trim() : "";
  const toRaw = typeof sp.to === "string" ? sp.to.trim() : "";
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "name";
  const dir = typeof sp.dir === "string" ? sp.dir : "desc";
  const from = fromRaw || today;
  const to = toRaw || today;

  const [initialProducts, productTotals] = await Promise.all([
    getProductwiseProductOptions({
      storeId: ctx.activeStoreId,
      from,
      to,
    }),
    loadProductwiseSalesReport({
      storeId: ctx.activeStoreId,
      from,
      to,
      product,
      sort,
      dir,
    }),
  ]);

  const totals = sumProductwiseRows(productTotals);
  const totalCount = productTotals.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(rawPage, totalPages);
  const pageItems = productTotals.slice((page - 1) * pageSize, page * pageSize);

  const extras: Record<string, string> = {};
  if (from) extras.from = from;
  if (to) extras.to = to;
  if (product) extras.product = product;
  if (sort) extras.sort = sort;
  if (dir) extras.dir = dir;
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) extras.limit = String(pageSize);

  const listPrefs: Record<string, string> = {};
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) listPrefs.limit = String(pageSize);
  if (sort !== "name") listPrefs.sort = sort;
  if (dir !== "desc") listPrefs.dir = dir;

  const clearHref = buildProductwiseSearchUrl("/dashboard/sales/productwise", 1, pageSize, listPrefs);
  const resetTodayHref = buildProductwiseSearchUrl("/dashboard/sales/productwise", 1, pageSize, {
    ...listPrefs,
    ...(product ? { product } : {}),
    from: today,
    to: today,
  });
  const exportHref = buildProductwiseSearchUrl("/api/dashboard/sales/productwise/export", 1, DEFAULT_LIST_PAGE_SIZE, {
    from,
    to,
    ...(product ? { product } : {}),
    ...(sort !== "name" ? { sort } : {}),
    ...(dir !== "desc" ? { dir } : {}),
  });

  let activeFilterCount = 0;
  if (from !== today || to !== today) activeFilterCount += 1;
  if (product) activeFilterCount += 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Product-wise sales</h1>
          <p className="text-sm text-zinc-500">
            Net figures per product for bills in the date range; return credits reduce qty and revenue.
          </p>
        </div>
        <Link href="/dashboard/sales" className="text-sm font-medium text-brand-blue-light hover:underline">
          Sales history →
        </Link>
      </div>

      {totalCount > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Products</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{totals.productCount}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Net qty sold</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{totals.quantity}</p>
            {totals.returnQty > 0 ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{totals.returnQty} units returned</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Gross (net of lines)</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">₹{totals.gross.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Return credits</p>
            <p className="mt-2 text-lg font-semibold text-amber-800 dark:text-amber-200">
              ₹{totals.returnCredits.toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Net revenue</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">₹{totals.netRevenue.toFixed(2)}</p>
            <p className="mt-1 text-xs text-zinc-500">After line discount & returns</p>
          </div>
        </section>
      ) : null}

      {totalCount > 0 ? (
        <p className="text-xs text-zinc-500">
          Billed GST in period (after returns): ₹{totals.tax.toFixed(2)} · Cost (after returns): ₹
          {totals.cost.toFixed(2)}
        </p>
      ) : null}

      <MobileFilterSheet
        title="Filter report"
        description="Limits the report to the selected bill dates and optional product name."
        activeCount={activeFilterCount}
      >
        <ProductwiseFilterForm
          actionPath="/dashboard/sales/productwise"
          from={from}
          to={to}
          product={product}
          initialProducts={initialProducts}
          hiddenLimit={pageSize !== DEFAULT_LIST_PAGE_SIZE ? String(pageSize) : undefined}
          clearHref={clearHref}
          resetTodayHref={resetTodayHref}
          exportHref={exportHref}
        />
      </MobileFilterSheet>

      <div className="mb-3">
        <ListPageSizeControls
          basePath="/dashboard/sales/productwise"
          currentLimit={pageSize}
          totalItems={totalCount}
          extraHidden={extras}
        />
      </div>

      <ProductwiseListMobile
        items={pageItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          supplier: item.supplier,
          mrpLabel: formatProductwiseMrp(item.mrpMin, item.mrpMax),
          quantity: item.quantity,
          returnQty: item.returnQty,
          remainingQty: item.remainingQty,
          billCount: item.billCount,
          gross: item.gross,
          discount: item.discount,
          returnCredits: item.returnCredits,
          netRevenue: item.netRevenue,
          tax: item.tax,
          cost: item.cost,
        }))}
        totals={totalCount > 0 ? totals : null}
      />

      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[72rem] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">
                <Link
                  href={buildProductwiseSearchUrl("/dashboard/sales/productwise", 1, pageSize, {
                    ...extras,
                    sort: "name",
                    dir: sort === "name" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Product {sort === "name" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="min-w-[8rem] whitespace-nowrap px-4 py-3">Supplier</th>
              <th className="whitespace-nowrap px-4 py-3">
                <Link
                  href={buildProductwiseSearchUrl("/dashboard/sales/productwise", 1, pageSize, {
                    ...extras,
                    sort: "quantity",
                    dir: sort === "quantity" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Net qty {sort === "quantity" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="whitespace-nowrap px-4 py-3">Remaining qty</th>
              <th className="whitespace-nowrap px-4 py-3">
                <Link
                  href={buildProductwiseSearchUrl("/dashboard/sales/productwise", 1, pageSize, {
                    ...extras,
                    sort: "billCount",
                    dir: sort === "billCount" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Bills {sort === "billCount" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-right">MRP</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">
                <Link
                  href={buildProductwiseSearchUrl("/dashboard/sales/productwise", 1, pageSize, {
                    ...extras,
                    sort: "gross",
                    dir: sort === "gross" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Gross ₹ {sort === "gross" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Discount</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">
                <Link
                  href={buildProductwiseSearchUrl("/dashboard/sales/productwise", 1, pageSize, {
                    ...extras,
                    sort: "returnCredits",
                    dir: sort === "returnCredits" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Returns ₹ {sort === "returnCredits" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Net ₹</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Tax</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr key={item.productId} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{item.productName}</td>
                <td
                  className="max-w-[12rem] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400"
                  title={item.supplier ?? undefined}
                >
                  {item.supplier ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-600">
                  {item.quantity}
                  {item.returnQty > 0 ? (
                    <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(−{item.returnQty})</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums text-zinc-600">{item.remainingQty}</td>
                <td className="px-4 py-3 text-zinc-600">{item.billCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                  {formatProductwiseMrp(item.mrpMin, item.mrpMax)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">₹{item.gross.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-600">₹{item.discount.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-800 dark:text-amber-200">
                  {item.returnCredits > 0 ? `₹${item.returnCredits.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">₹{item.netRevenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-600">₹{item.tax.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{item.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          {totalCount > 0 ? (
            <tfoot className="bg-zinc-50 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-700">
                <td className="px-4 py-3">Total (all products)</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3 tabular-nums">{totals.quantity}</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.gross.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.discount.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-800 dark:text-amber-200">
                  ₹{totals.returnCredits.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.netRevenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.tax.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.cost.toFixed(2)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        {pageItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-zinc-500">No product sales match this filter.</p>
        ) : null}
      </div>

      {totalCount > 0 ? (
        <ListPaginationNav
          label="Products"
          page={page}
          totalPages={totalPages}
          totalItems={totalCount}
          basePath="/dashboard/sales/productwise"
          extraHidden={extras}
          prevHref={buildProductwiseSearchUrl("/dashboard/sales/productwise", Math.max(1, page - 1), pageSize, extras)}
          nextHref={buildProductwiseSearchUrl("/dashboard/sales/productwise", Math.min(totalPages, page + 1), pageSize, extras)}
        />
      ) : null}
    </div>
  );
}
