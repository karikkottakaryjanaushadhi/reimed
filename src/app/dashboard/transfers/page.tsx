import Link from "next/link";
import { redirect } from "next/navigation";
import { formatAppDateTime, formatAppMonthEndYmd, formatAppMonthStartYmd } from "@/lib/app-timezone";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { TransfersFilterForm } from "@/app/dashboard/transfers/transfers-filter-form";
import { ListItemNames } from "@/components/list-item-names";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import {
  buildTransferFilterWhere,
  getTransferFilterOptions,
  parseTransferDirection,
} from "@/lib/transfers-filter-options";

function transferListExtras(
  from: string,
  to: string,
  direction: ReturnType<typeof parseTransferDirection>,
  counterpartyId: string,
  product: string,
  transferNo: string,
  batch: string,
  recordedBy: string,
  pageSize: number,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (from) e.from = from;
  if (to) e.to = to;
  if (direction !== "all") e.direction = direction;
  if (counterpartyId) e.branch = counterpartyId;
  if (product) e.product = product;
  if (transferNo) e.transferNo = transferNo;
  if (batch) e.batch = batch;
  if (recordedBy) e.recordedBy = recordedBy;
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) e.limit = String(pageSize);
  return e;
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    from?: string;
    to?: string;
    direction?: string;
    branch?: string;
    product?: string;
    transferNo?: string;
    batch?: string;
    recordedBy?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const rawPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const limit = parseListLimitParam(sp.limit);
  const from = trimDateParam(sp.from);
  const to = trimDateParam(sp.to);
  const direction = parseTransferDirection(sp.direction);
  const counterpartyId = typeof sp.branch === "string" ? sp.branch.trim() : "";
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  const transferNo = typeof sp.transferNo === "string" ? sp.transferNo.trim() : "";
  const batch = typeof sp.batch === "string" ? sp.batch.trim() : "";
  const recordedBy = typeof sp.recordedBy === "string" ? sp.recordedBy.trim() : "";

  const storeId = ctx.activeStoreId;
  const filterParams = {
    storeId,
    from: from || undefined,
    to: to || undefined,
    direction,
    counterpartyId: counterpartyId || undefined,
    product: product || undefined,
    transferNo: transferNo || undefined,
    batch: batch || undefined,
    recordedBy: recordedBy || undefined,
  };

  const where = buildTransferFilterWhere(filterParams);
  const [filterOptions, total] = await Promise.all([
    getTransferFilterOptions(filterParams),
    prisma.stockTransfer.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(rawPage, totalPages);
  const skip = (page - 1) * limit;

  const transfers = await prisma.stockTransfer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take: limit,
    include: {
      fromStore: { select: { name: true } },
      toStore: { select: { name: true } },
      createdBy: { select: { name: true } },
      lines: { select: { product: { select: { id: true, name: true } } } },
    },
  });

  const extras = transferListExtras(
    from,
    to,
    direction,
    counterpartyId,
    product,
    transferNo,
    batch,
    recordedBy,
    limit,
  );
  const clearHref = buildSimpleListUrl("/dashboard/transfers", 1, limit, {
    ...(limit !== DEFAULT_LIST_PAGE_SIZE ? { limit: String(limit) } : {}),
  });
  const monthFrom = formatAppMonthStartYmd();
  const monthTo = formatAppMonthEndYmd();
  const resetThisMonthHref = buildSimpleListUrl("/dashboard/transfers", 1, limit, {
    ...extras,
    from: monthFrom,
    to: monthTo,
  });

  const hasActiveFilters = !!(
    from ||
    to ||
    direction !== "all" ||
    counterpartyId ||
    product ||
    transferNo ||
    batch ||
    recordedBy
  );
  let activeFilterCount = 0;
  if (from || to) activeFilterCount += 1;
  if (direction !== "all") activeFilterCount += 1;
  if (counterpartyId) activeFilterCount += 1;
  if (product) activeFilterCount += 1;
  if (transferNo) activeFilterCount += 1;
  if (batch) activeFilterCount += 1;
  if (recordedBy) activeFilterCount += 1;

  const emptyMessage = hasActiveFilters ? "No transfers match these filters." : "No transfers yet.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Stock transfers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Inter-branch stock movements for {ctx.membership.store.name}.
          </p>
        </div>
        {isManager(ctx) ? (
          <Link
            href="/dashboard/transfers/new"
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            New transfer
          </Link>
        ) : null}
      </div>

      <MobileFilterSheet
        title="Filter transfers"
        description="Filter by date, direction, branch, product, transfer number, batch, or who recorded it."
        activeCount={activeFilterCount}
      >
        <TransfersFilterForm
          key={[from, to, direction, counterpartyId, product, transferNo, batch, recordedBy].join("\0")}
          actionPath="/dashboard/transfers"
          from={from}
          to={to}
          direction={direction}
          counterpartyId={counterpartyId}
          product={product}
          transferNo={transferNo}
          batch={batch}
          recordedBy={recordedBy}
          initialOptions={filterOptions}
          hiddenLimit={limit !== DEFAULT_LIST_PAGE_SIZE ? String(limit) : undefined}
          clearHref={clearHref}
          resetThisMonthHref={resetThisMonthHref}
        />
      </MobileFilterSheet>

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3">Counterparty</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => {
              const isOut = t.fromStoreId === storeId;
              return (
                <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 text-zinc-600">{formatAppDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/transfers/${t.id}`}
                      className="font-medium text-brand-blue-light hover:underline"
                    >
                      #{t.transferNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        isOut
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {isOut ? "Out" : "In"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{isOut ? t.toStore.name : t.fromStore.name}</td>
                  <td className="max-w-xs px-4 py-3">
                    <ListItemNames products={t.lines.map((l) => l.product)} />
                  </td>
                  <td className="px-4 py-3">{t.createdBy.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {transfers.length === 0 ? <p className="px-4 py-8 text-center text-zinc-500">{emptyMessage}</p> : null}
      </div>

      <ul className="space-y-2 md:hidden">
        {transfers.map((t) => {
          const isOut = t.fromStoreId === storeId;
          return (
            <li key={t.id}>
              <Link
                href={`/dashboard/transfers/${t.id}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-brand-blue-light">#{t.transferNo}</span>
                  <span className="text-xs text-zinc-500">{formatAppDateTime(t.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm">
                  {isOut ? "To" : "From"} {isOut ? t.toStore.name : t.fromStore.name}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {isOut ? "Sent out" : "Received"} · {t.createdBy.name}
                </p>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  <ListItemNames products={t.lines.map((l) => l.product)} />
                </p>
              </Link>
            </li>
          );
        })}
        {transfers.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">{emptyMessage}</p> : null}
      </ul>

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ListPageSizeControls
            basePath="/dashboard/transfers"
            currentLimit={limit}
            totalItems={total}
            extraHidden={extras}
          />
          <ListPaginationNav
            label="Transfers"
            page={page}
            totalPages={totalPages}
            totalItems={total}
            prevHref={buildSimpleListUrl("/dashboard/transfers", page - 1, limit, extras)}
            nextHref={buildSimpleListUrl("/dashboard/transfers", page + 1, limit, extras)}
            basePath="/dashboard/transfers"
            extraHidden={extras}
          />
        </div>
      ) : null}
    </div>
  );
}
