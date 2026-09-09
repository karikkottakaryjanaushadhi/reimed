import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { formatAppDateTime, formatAppMonthEndYmd, formatAppMonthStartYmd } from "@/lib/app-timezone";
import { ListItemNames } from "@/components/list-item-names";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { PurchaseReturnsFilterForm } from "@/app/dashboard/purchases/returns/purchase-returns-filter-form";
import { PurchaseReturnsListMobile } from "@/app/dashboard/purchases/purchase-returns-list-mobile";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import {
  buildPurchaseReturnFilterWhere,
  getPurchaseReturnFilterOptions,
} from "@/lib/purchase-returns-filter-options";

function purchaseReturnListExtras(
  from: string,
  to: string,
  supplier: string,
  purchaseNo: string,
  creditNote: string,
  product: string,
  batch: string,
  recordedBy: string,
  pageSize: number,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (from) e.from = from;
  if (to) e.to = to;
  if (supplier) e.supplier = supplier;
  if (purchaseNo) e.purchaseNo = purchaseNo;
  if (creditNote) e.creditNote = creditNote;
  if (product) e.product = product;
  if (batch) e.batch = batch;
  if (recordedBy) e.recordedBy = recordedBy;
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) e.limit = String(pageSize);
  return e;
}

export default async function PurchaseReturnsLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    from?: string;
    to?: string;
    supplier?: string;
    purchaseNo?: string;
    creditNote?: string;
    product?: string;
    batch?: string;
    recordedBy?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">Purchase returns are available to store managers only.</p>
    );
  }

  const sp = await searchParams;
  const rawPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const limit = parseListLimitParam(sp.limit);
  const from = trimDateParam(sp.from);
  const to = trimDateParam(sp.to);
  const supplier = typeof sp.supplier === "string" ? sp.supplier.trim() : "";
  const purchaseNo = typeof sp.purchaseNo === "string" ? sp.purchaseNo.trim() : "";
  const creditNote = typeof sp.creditNote === "string" ? sp.creditNote.trim() : "";
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  const batch = typeof sp.batch === "string" ? sp.batch.trim() : "";
  const recordedBy = typeof sp.recordedBy === "string" ? sp.recordedBy.trim() : "";

  const filterParams = {
    storeId: ctx.activeStoreId,
    from: from || undefined,
    to: to || undefined,
    supplier: supplier || undefined,
    purchaseNo: purchaseNo || undefined,
    creditNote: creditNote || undefined,
    product: product || undefined,
    batch: batch || undefined,
    recordedBy: recordedBy || undefined,
  };
  const where = buildPurchaseReturnFilterWhere(filterParams);

  const [filterOptions, total, creditAgg] = await Promise.all([
    getPurchaseReturnFilterOptions(filterParams),
    prisma.purchaseReturn.count({ where }),
    prisma.purchaseReturn.aggregate({ where, _sum: { total: true } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(rawPage, totalPages);
  const skip = (page - 1) * limit;

  const returns = await prisma.purchaseReturn.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take: limit,
    include: {
      purchase: {
        select: {
          id: true,
          purchaseNo: true,
          supplier: { select: { name: true } },
        },
      },
      createdBy: { select: { name: true } },
      lines: {
        select: { purchaseLine: { select: { product: { select: { id: true, name: true } } } } },
      },
    },
  });

  const creditTotal = Number(creditAgg._sum.total ?? 0);
  const extras = purchaseReturnListExtras(
    from,
    to,
    supplier,
    purchaseNo,
    creditNote,
    product,
    batch,
    recordedBy,
    limit,
  );
  const clearHref = buildSimpleListUrl("/dashboard/purchases/returns", 1, limit, {
    ...(limit !== DEFAULT_LIST_PAGE_SIZE ? { limit: String(limit) } : {}),
  });
  const resetThisMonthHref = buildSimpleListUrl("/dashboard/purchases/returns", 1, limit, {
    ...extras,
    from: formatAppMonthStartYmd(),
    to: formatAppMonthEndYmd(),
  });

  const hasActiveFilters = !!(from || to || supplier || purchaseNo || creditNote || product || batch || recordedBy);
  let activeFilterCount = 0;
  if (from || to) activeFilterCount += 1;
  if (supplier) activeFilterCount += 1;
  if (purchaseNo) activeFilterCount += 1;
  if (creditNote) activeFilterCount += 1;
  if (product) activeFilterCount += 1;
  if (batch) activeFilterCount += 1;
  if (recordedBy) activeFilterCount += 1;

  const emptyMessage = hasActiveFilters
    ? "No purchase returns match these filters."
    : "No purchase returns recorded yet.";
  const rows = returns.map((r) => ({
    id: r.id,
    createdAtIso: r.createdAt.toISOString(),
    purchaseId: r.purchase.id,
    purchaseNo: r.purchase.purchaseNo,
    supplierName: r.purchase.supplier.name,
    creditNoteNo: r.creditNoteNo,
    products: r.lines.map((l) => l.purchaseLine.product),
    createdByName: r.createdBy.name,
    total: Number(r.total),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/purchases" className="text-sm font-medium text-brand-blue-light hover:underline">
            ← Purchase list
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Purchase returns</h1>
          <p className="mt-1 text-sm text-zinc-500">Supplier returns for this store (newest first).</p>
        </div>
      </div>

      <MobileFilterSheet
        title="Filter purchase returns"
        description="Filter by date, supplier, purchase number, credit note, product, batch, or who recorded it."
        activeCount={activeFilterCount}
      >
        <PurchaseReturnsFilterForm
          key={[from, to, supplier, purchaseNo, creditNote, product, batch, recordedBy].join("\0")}
          actionPath="/dashboard/purchases/returns"
          from={from}
          to={to}
          supplier={supplier}
          purchaseNo={purchaseNo}
          creditNote={creditNote}
          product={product}
          batch={batch}
          recordedBy={recordedBy}
          initialOptions={filterOptions}
          hiddenLimit={limit !== DEFAULT_LIST_PAGE_SIZE ? String(limit) : undefined}
          clearHref={clearHref}
          resetThisMonthHref={resetThisMonthHref}
        />
      </MobileFilterSheet>

      <PurchaseReturnsListMobile returns={rows} creditTotal={creditTotal} emptyMessage={emptyMessage} />

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Purchase</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Credit note</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 text-zinc-600">{formatAppDateTime(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/purchases/${r.purchase.id}`}
                    className="font-medium text-brand-blue-light hover:underline"
                  >
                    #{r.purchase.purchaseNo}
                  </Link>
                </td>
                <td className="px-4 py-3">{r.purchase.supplier.name}</td>
                <td className="px-4 py-3 text-zinc-600">
                  {r.creditNoteNo?.trim() ? (
                    <>
                      {r.creditNoteNo.trim()}
                      {r.creditNoteDate ? (
                        <span className="block text-xs text-zinc-500">
                          {format(r.creditNoteDate, "dd MMM yyyy")}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="max-w-xs px-4 py-3">
                  <ListItemNames products={r.lines.map((l) => l.purchaseLine.product)} />
                </td>
                <td className="px-4 py-3">{r.createdBy.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{Number(r.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          {total > 0 ? (
            <tfoot className="bg-zinc-50 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <td colSpan={6} className="px-4 py-3 text-right">
                  Credits{hasActiveFilters ? " (this filter)" : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">₹{creditTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        {returns.length === 0 ? <p className="px-4 py-8 text-center text-zinc-500">{emptyMessage}</p> : null}
      </div>

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ListPageSizeControls
            basePath="/dashboard/purchases/returns"
            currentLimit={limit}
            totalItems={total}
            extraHidden={extras}
          />
          <ListPaginationNav
            label="Returns"
            page={page}
            totalPages={totalPages}
            totalItems={total}
            prevHref={buildSimpleListUrl("/dashboard/purchases/returns", page - 1, limit, extras)}
            nextHref={buildSimpleListUrl("/dashboard/purchases/returns", page + 1, limit, extras)}
            basePath="/dashboard/purchases/returns"
            extraHidden={extras}
          />
        </div>
      ) : null}
    </div>
  );
}
