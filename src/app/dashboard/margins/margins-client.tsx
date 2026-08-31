"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatAppDateTime, formatAppDateYmd } from "@/lib/app-timezone";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-pagination";
import type { MarginsQuery, MarginsReport } from "@/lib/margins-report";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { MarginGate } from "./margin-gate";
import { MarginsFilterForm } from "./margins-filter-form";
import { MarginsBillMobile, MarginsProductMobile } from "./margins-list-mobile";
import { marginsReportCacheKey } from "@/lib/margins-report";
import { buildMarginsUrl } from "./margins-url";
import { useMarginAccess } from "./margin-access-context";

export function MarginsClient({
  query,
  configured,
}: {
  query: MarginsQuery;
  configured: boolean;
}) {
  const queryKey = useMemo(() => marginsReportCacheKey(query), [query]);
  const { ready, marginPassword, unlock, lock } = useMarginAccess();
  const [report, setReport] = useState<MarginsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const lastLoadedKeyRef = useRef<string | null>(null);

  async function loadReport(
    password: string,
    opts?: { lockOnAuthFailure?: boolean },
  ): Promise<void> {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/margins/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, ...query }),
      });
      const data = (await res.json().catch(() => null)) as { report?: MarginsReport; error?: string } | null;
      if (!res.ok) {
        if (res.status === 401) {
          lastLoadedKeyRef.current = null;
          if (opts?.lockOnAuthFailure) lock();
        }
        throw new Error(
          data?.error ?? (res.status === 401 ? "Incorrect password" : "Could not load margin data"),
        );
      }
      if (!data?.report) {
        throw new Error("Invalid response");
      }
      setReport(data.report);
      lastLoadedKeyRef.current = queryKey;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !marginPassword) return;
    if (lastLoadedKeyRef.current === queryKey) return;
    setReport(null);
    void loadReport(marginPassword, { lockOnAuthFailure: true }).catch((err) => {
      setLoadError(err instanceof Error ? err.message : "Could not load margin data");
      setReport(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadReport uses latest query from props
  }, [queryKey, ready, marginPassword]);

  async function onUnlock(password: string) {
    await loadReport(password);
    unlock(password);
  }

  function lockMarginView() {
    lastLoadedKeyRef.current = null;
    lock();
    setReport(null);
    setLoadError(null);
  }

  if (!ready) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  if (!marginPassword) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Margin details</h1>
          <p className="text-sm text-zinc-500">
            Cost and profit from billed lines (lot cost at sale time). Password once while you stay on Margin details.
          </p>
        </div>
        <MarginGate configured={configured} loading={loading} onUnlock={onUnlock} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Margin details</h1>
            <p className="text-sm text-zinc-500">
              {loading ? "Loading margin report…" : loadError ?? "No data to show."}
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={lockMarginView}
          >
            Lock margin view
          </button>
        </div>
        {loadError ? (
          <button
            type="button"
            className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white"
            onClick={() => marginPassword && void loadReport(marginPassword)}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  const today = formatAppDateYmd();
  const extras: Record<string, string> = { view: report.view };
  if (report.from) extras.from = report.from;
  if (report.to) extras.to = report.to;
  if (report.sort) extras.sort = report.sort;
  if (report.dir) extras.dir = report.dir;
  if (report.view === "product" && report.product) extras.product = report.product;
  if (report.view === "bill" && report.bill) extras.bill = report.bill;

  const listPrefs: Record<string, string> = { view: report.view };
  if (report.pageSize !== DEFAULT_LIST_PAGE_SIZE) listPrefs.limit = String(report.pageSize);

  const clearHref = buildMarginsUrl(1, report.pageSize, listPrefs);
  const resetTodayHref = buildMarginsUrl(1, report.pageSize, {
    ...listPrefs,
    from: today,
    to: today,
    ...(report.view === "product" && report.product ? { product: report.product } : {}),
    ...(report.view === "bill" && report.bill ? { bill: report.bill } : {}),
  });

  let activeFilterCount = 0;
  if (report.from !== today || report.to !== today) activeFilterCount += 1;
  if (report.view === "product" && report.product) activeFilterCount += 1;
  if (report.view === "bill" && report.bill) activeFilterCount += 1;

  const productTabHref = buildMarginsUrl(1, report.pageSize, {
    ...extras,
    view: "product",
    sort: "margin",
    dir: "desc",
  });
  const billTabHref = buildMarginsUrl(1, report.pageSize, {
    ...extras,
    view: "bill",
    sort: "createdAt",
    dir: "desc",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Margin details</h1>
          <p className="text-sm text-zinc-500">
            Margin = line gross − discount − GST − cost (lot trade rate). Returns reduce figures in the period.
          </p>
        </div>
        <button
          type="button"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          onClick={lockMarginView}
        >
          Lock margin view
        </button>
      </div>

      <nav
        className="flex gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-1 dark:border-zinc-800 dark:bg-zinc-900/40"
        aria-label="Margin view"
      >
        <Link
          href={productTabHref}
          className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium sm:flex-none ${
            report.view === "product"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          }`}
        >
          By Product
        </Link>
        <Link
          href={billTabHref}
          className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium sm:flex-none ${
            report.view === "bill"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          }`}
        >
          By Bill
        </Link>
      </nav>

      <MobileFilterSheet
        title="Filter margins"
        description={
          report.view === "product" ? "Date range and optional product." : "Date range and optional bill number."
        }
        activeCount={activeFilterCount}
      >
        <MarginsFilterForm
          view={report.view}
          from={report.from}
          to={report.to}
          product={report.view === "product" ? report.product : ""}
          bill={report.view === "bill" ? report.bill : ""}
          initialProducts={report.initialProducts}
          hiddenLimit={report.pageSize !== DEFAULT_LIST_PAGE_SIZE ? String(report.pageSize) : undefined}
          clearHref={clearHref}
          resetTodayHref={resetTodayHref}
        />
      </MobileFilterSheet>

      {report.view === "product" ? (
        <ProductReportView report={report} extras={extras} />
      ) : (
        <BillReportView report={report} extras={extras} />
      )}
    </div>
  );
}

function ProductReportView({
  report,
  extras,
}: {
  report: Extract<MarginsReport, { view: "product" }>;
  extras: Record<string, string>;
}) {
  const { totals } = report;
  return (
    <>
      {report.totalCount > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Products" value={String(totals.productCount)} />
          <SummaryCard label="Net revenue" value={`₹${totals.netRevenue.toFixed(2)}`} />
          <SummaryCard label="Total cost" value={`₹${totals.cost.toFixed(2)}`} />
          <SummaryCard
            label="Total margin"
            value={`₹${totals.margin.toFixed(2)} (${totals.marginPercent.toFixed(1)}%)`}
          />
        </section>
      ) : null}

      <ListPageSizeControls
        basePath="/dashboard/margins"
        currentLimit={report.pageSize}
        totalItems={report.totalCount}
        extraHidden={extras}
      />

      <MarginsProductMobile items={report.items} />

      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <SortTh label="Product" sortKey="name" report={report} extras={extras} />
              <th className="px-4 py-3 text-right">Net qty</th>
              <SortTh label="Bills" sortKey="billCount" report={report} extras={extras} align="right" />
              <SortTh label="Net ₹" sortKey="netRevenue" report={report} extras={extras} align="right" />
              <SortTh label="Cost" sortKey="cost" report={report} extras={extras} align="right" />
              <SortTh label="Margin ₹" sortKey="margin" report={report} extras={extras} align="right" />
              <SortTh label="Margin %" sortKey="marginPercent" report={report} extras={extras} align="right" />
            </tr>
          </thead>
          <tbody>
            {report.items.map((item) => (
              <tr key={item.productId} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 font-medium">{item.productName}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {item.quantity}
                  {item.returnQty > 0 ? (
                    <span className="ml-1 text-xs text-amber-700">(−{item.returnQty})</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{item.billCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{item.netRevenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{item.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-800 dark:text-emerald-300">
                  ₹{item.margin.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{item.marginPercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
          {report.totalCount > 0 ? (
            <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-800">
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-700">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.quantity}</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.netRevenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-800 dark:text-emerald-300">
                  ₹{totals.margin.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.marginPercent.toFixed(1)}%</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        {report.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-zinc-500">No product sales match this filter.</p>
        ) : null}
      </div>

      {report.totalCount > 0 ? (
        <ListPaginationNav
          label="Products"
          page={report.page}
          totalPages={report.totalPages}
          totalItems={report.totalCount}
          basePath="/dashboard/margins"
          extraHidden={extras}
          prevHref={buildMarginsUrl(Math.max(1, report.page - 1), report.pageSize, extras)}
          nextHref={buildMarginsUrl(Math.min(report.totalPages, report.page + 1), report.pageSize, extras)}
        />
      ) : null}
    </>
  );
}

function BillReportView({
  report,
  extras,
}: {
  report: Extract<MarginsReport, { view: "bill" }>;
  extras: Record<string, string>;
}) {
  const { totals } = report;
  return (
    <>
      {report.totalCount > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Bills" value={String(totals.billCount)} />
          <SummaryCard label="Net revenue" value={`₹${totals.netRevenue.toFixed(2)}`} />
          <SummaryCard label="Total cost" value={`₹${totals.cost.toFixed(2)}`} />
          <SummaryCard
            label="Total margin"
            value={`₹${totals.margin.toFixed(2)} (${totals.marginPercent.toFixed(1)}%)`}
          />
        </section>
      ) : null}

      <ListPageSizeControls
        basePath="/dashboard/margins"
        currentLimit={report.pageSize}
        totalItems={report.totalCount}
        extraHidden={extras}
      />

      <MarginsBillMobile items={report.items} />

      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <SortTh label="Bill #" sortKey="billNo" report={report} extras={extras} />
              <SortTh label="Date" sortKey="createdAt" report={report} extras={extras} />
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-right">Lines</th>
              <SortTh label="Net ₹" sortKey="netRevenue" report={report} extras={extras} align="right" />
              <SortTh label="Cost" sortKey="cost" report={report} extras={extras} align="right" />
              <SortTh label="Margin ₹" sortKey="margin" report={report} extras={extras} align="right" />
              <SortTh label="Mrg%" sortKey="marginPercent" report={report} extras={extras} align="right" />
            </tr>
          </thead>
          <tbody>
            {report.items.map((item) => (
              <tr key={item.saleId} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/sales/${item.saleId}`}
                    className="font-medium text-brand-blue-light hover:underline"
                  >
                    #{item.billNo}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums text-zinc-600">
                  {formatAppDateTime(new Date(item.createdAtIso))}
                </td>
                <td className="px-4 py-3 text-zinc-700">{item.customerName ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{item.lineCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{item.netRevenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{item.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-800 dark:text-emerald-300">
                  ₹{item.margin.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{item.marginPercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
          {report.totalCount > 0 ? (
            <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-800">
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-700">
                <td className="px-4 py-3" colSpan={4}>
                  Total ({totals.billCount} bills)
                </td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.netRevenue.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{totals.cost.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-800 dark:text-emerald-300">
                  ₹{totals.margin.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{totals.marginPercent.toFixed(1)}%</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        {report.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-zinc-500">No bills match this filter.</p>
        ) : null}
      </div>

      {report.totalCount > 0 ? (
        <ListPaginationNav
          label="Bills"
          page={report.page}
          totalPages={report.totalPages}
          totalItems={report.totalCount}
          basePath="/dashboard/margins"
          extraHidden={extras}
          prevHref={buildMarginsUrl(Math.max(1, report.page - 1), report.pageSize, extras)}
          nextHref={buildMarginsUrl(Math.min(report.totalPages, report.page + 1), report.pageSize, extras)}
        />
      ) : null}
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <p className="text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function SortTh({
  label,
  sortKey,
  report,
  extras,
  align = "left",
}: {
  label: string;
  sortKey: string;
  report: MarginsReport;
  extras: Record<string, string>;
  align?: "left" | "right";
}) {
  const nextDir = report.sort === sortKey && report.dir === "asc" ? "desc" : "asc";
  const href = buildMarginsUrl(1, report.pageSize, { ...extras, sort: sortKey, dir: nextDir });
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <Link
        href={href}
        className={`inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200 ${
          align === "right" ? "justify-end" : ""
        }`}
      >
        {label} {report.sort === sortKey ? (report.dir === "asc" ? "↑" : "↓") : "↕"}
      </Link>
    </th>
  );
}
