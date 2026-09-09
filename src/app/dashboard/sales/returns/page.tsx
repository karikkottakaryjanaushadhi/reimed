import Link from "next/link";
import { redirect } from "next/navigation";
import { formatAppDateTime, formatAppMonthEndYmd, formatAppMonthStartYmd } from "@/lib/app-timezone";
import { ListItemNames } from "@/components/list-item-names";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { SalesReturnsFilterForm } from "@/app/dashboard/sales/returns/sales-returns-filter-form";
import { SalesReturnsListMobile } from "@/app/dashboard/sales/sales-returns-list-mobile";
import { getAuthContext } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import { buildSaleReturnFilterWhere, getSaleReturnFilterOptions } from "@/lib/sale-returns-filter-options";

function saleReturnListExtras(
  from: string,
  to: string,
  billNo: string,
  patient: string,
  doctor: string,
  product: string,
  batch: string,
  recordedBy: string,
  pageSize: number,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (from) e.from = from;
  if (to) e.to = to;
  if (billNo) e.billNo = billNo;
  if (patient) e.patient = patient;
  if (doctor) e.doctor = doctor;
  if (product) e.product = product;
  if (batch) e.batch = batch;
  if (recordedBy) e.recordedBy = recordedBy;
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) e.limit = String(pageSize);
  return e;
}

export default async function SalesReturnsLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    from?: string;
    to?: string;
    billNo?: string;
    patient?: string;
    doctor?: string;
    product?: string;
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
  const billNo = typeof sp.billNo === "string" ? sp.billNo.trim() : "";
  const patient = typeof sp.patient === "string" ? sp.patient.trim() : "";
  const doctor = typeof sp.doctor === "string" ? sp.doctor.trim() : "";
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  const batch = typeof sp.batch === "string" ? sp.batch.trim() : "";
  const recordedBy = typeof sp.recordedBy === "string" ? sp.recordedBy.trim() : "";

  const filterParams = {
    storeId: ctx.activeStoreId,
    from: from || undefined,
    to: to || undefined,
    billNo: billNo || undefined,
    patient: patient || undefined,
    doctor: doctor || undefined,
    product: product || undefined,
    batch: batch || undefined,
    recordedBy: recordedBy || undefined,
  };
  const where = buildSaleReturnFilterWhere(filterParams);
  const skipGuess = (rawPage - 1) * limit;

  const [filterOptions, total, creditAgg, returnsGuess] = await Promise.all([
    getSaleReturnFilterOptions(filterParams),
    prisma.saleReturn.count({ where }),
    prisma.saleReturn.aggregate({ where, _sum: { total: true } }),
    prisma.saleReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: skipGuess,
      take: limit,
      include: {
        sale: { select: { id: true, billNo: true } },
        createdBy: { select: { name: true } },
        lines: {
          select: { saleLine: { select: { product: { select: { id: true, name: true } } } } },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(rawPage, totalPages);
  const skip = (page - 1) * limit;
  const returns =
    skip === skipGuess
      ? returnsGuess
      : await prisma.saleReturn.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            sale: { select: { id: true, billNo: true } },
            createdBy: { select: { name: true } },
            lines: {
              select: { saleLine: { select: { product: { select: { id: true, name: true } } } } },
            },
          },
        });

  const creditTotal = Number(creditAgg._sum.total ?? 0);
  const extras = saleReturnListExtras(from, to, billNo, patient, doctor, product, batch, recordedBy, limit);
  const clearHref = buildSimpleListUrl("/dashboard/sales/returns", 1, limit, {
    ...(limit !== DEFAULT_LIST_PAGE_SIZE ? { limit: String(limit) } : {}),
  });
  const resetThisMonthHref = buildSimpleListUrl("/dashboard/sales/returns", 1, limit, {
    ...extras,
    from: formatAppMonthStartYmd(),
    to: formatAppMonthEndYmd(),
  });

  const hasActiveFilters = !!(from || to || billNo || patient || doctor || product || batch || recordedBy);
  let activeFilterCount = 0;
  if (from || to) activeFilterCount += 1;
  if (billNo) activeFilterCount += 1;
  if (patient) activeFilterCount += 1;
  if (doctor) activeFilterCount += 1;
  if (product) activeFilterCount += 1;
  if (batch) activeFilterCount += 1;
  if (recordedBy) activeFilterCount += 1;

  const emptyMessage = hasActiveFilters ? "No returns match these filters." : "No returns recorded yet.";
  const rows = returns.map((r) => ({
    id: r.id,
    createdAtIso: r.createdAt.toISOString(),
    saleId: r.sale.id,
    billNo: r.sale.billNo,
    products: r.lines.map((l) => l.saleLine.product),
    createdByName: r.createdBy.name,
    total: Number(r.total),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/sales" className="text-sm font-medium text-brand-blue-light hover:underline">
            ← Sales history
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sales returns</h1>
          <p className="mt-1 text-sm text-zinc-500">Returns for this store (newest first).</p>
        </div>
      </div>

      <MobileFilterSheet
        title="Filter sales returns"
        description="Filter by date, bill, patient, doctor, product, batch, or who recorded it."
        activeCount={activeFilterCount}
      >
        <SalesReturnsFilterForm
          key={[from, to, billNo, patient, doctor, product, batch, recordedBy].join("\0")}
          actionPath="/dashboard/sales/returns"
          from={from}
          to={to}
          billNo={billNo}
          patient={patient}
          doctor={doctor}
          product={product}
          batch={batch}
          recordedBy={recordedBy}
          initialOptions={filterOptions}
          hiddenLimit={limit !== DEFAULT_LIST_PAGE_SIZE ? String(limit) : undefined}
          clearHref={clearHref}
          resetThisMonthHref={resetThisMonthHref}
        />
      </MobileFilterSheet>

      <SalesReturnsListMobile returns={rows} creditTotal={creditTotal} emptyMessage={emptyMessage} />

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Original bill</th>
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
                    href={`/dashboard/sales/${r.sale.id}`}
                    className="font-medium text-brand-blue-light hover:underline"
                  >
                    #{r.sale.billNo}
                  </Link>
                </td>
                <td className="max-w-xs px-4 py-3">
                  <ListItemNames products={r.lines.map((l) => l.saleLine.product)} />
                </td>
                <td className="px-4 py-3">{r.createdBy.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{Number(r.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          {total > 0 ? (
            <tfoot className="bg-zinc-50 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <td colSpan={4} className="px-4 py-3 text-right">
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
            basePath="/dashboard/sales/returns"
            currentLimit={limit}
            totalItems={total}
            extraHidden={extras}
          />
          <ListPaginationNav
            label="Returns"
            page={page}
            totalPages={totalPages}
            totalItems={total}
            prevHref={buildSimpleListUrl("/dashboard/sales/returns", page - 1, limit, extras)}
            nextHref={buildSimpleListUrl("/dashboard/sales/returns", page + 1, limit, extras)}
            basePath="/dashboard/sales/returns"
            extraHidden={extras}
          />
        </div>
      ) : null}
    </div>
  );
}
