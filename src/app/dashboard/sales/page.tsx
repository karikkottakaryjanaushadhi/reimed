import Link from "next/link";
import { redirect } from "next/navigation";
import { formatAppDateYmd, formatAppDateShort, formatAppTime } from "@/lib/app-timezone";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { DotmatrixPrintButton } from "@/components/DotmatrixPrintButton";
import { SalesFilterForm } from "@/app/dashboard/sales/sales-filter-form";
import { SalesListMobile, type SalesListCardRow } from "@/app/dashboard/sales/sales-list-mobile";
import { SaleBillDiscountDisplay } from "@/app/dashboard/sales/sale-bill-discount-display";
import { SalePaidSwitch } from "@/app/dashboard/sales/sale-paid-switch";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { getAuthContext } from "@/lib/auth-context";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { canEditSale } from "@/lib/sale-editable";
import {
  netSaleTotal,
  returnCreditsBySaleIds,
  roundMoney,
} from "@/lib/sale-return-aggregates";
import { prisma } from "@/lib/prisma";
import { buildSalesFilterWhere, getSalesFilterOptions } from "@/lib/sales-filter-options";

function salesExtras(
  from: string,
  to: string,
  pageSize: number,
  doctor: string,
  patient: string,
  product: string,
  unpaidOnly: boolean,
  sort: string,
  dir: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (from) e.from = from;
  if (to) e.to = to;
  if (doctor) e.doctor = doctor;
  if (patient) e.patient = patient;
  if (product) e.product = product;
  if (unpaidOnly) e.unpaid = "1";
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) e.limit = String(pageSize);
  if (sort && sort !== "createdAt") e.sort = sort;
  if (dir && dir !== "desc") e.dir = dir;
  return e;
}

function salesOrderBy(sort: string, dir: "asc" | "desc") {
  switch (sort) {
    case "billNo":
      return { billNo: dir };
    case "customerName":
      return { customerName: dir };
    case "doctorName":
      return { doctorName: dir };
    case "createdBy":
      return { createdBy: { name: dir } };
    case "total":
      return { total: dir };
    case "createdAt":
    default:
      return { createdAt: dir };
  }
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    from?: string;
    to?: string;
    doctor?: string;
    patient?: string;
    product?: string;
    unpaid?: string;
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
  const doctor = typeof sp.doctor === "string" ? sp.doctor.trim() : "";
  const patient = typeof sp.patient === "string" ? sp.patient.trim() : "";
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  const unpaidOnly = sp.unpaid === "1" || sp.unpaid === "true";
  const sort =
    sp.sort === "billNo" ||
    sp.sort === "createdAt" ||
    sp.sort === "customerName" ||
    sp.sort === "doctorName" ||
    sp.sort === "createdBy" ||
    sp.sort === "total"
      ? sp.sort
      : "createdAt";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "desc";
  const from = fromRaw || today;
  const to = toRaw || today;

  const filterParams = {
    storeId: ctx.activeStoreId,
    from,
    to,
    doctor,
    patient,
    product,
    unpaid: unpaidOnly,
  };

  const where = buildSalesFilterWhere(filterParams);
  const skipGuess = (rawPage - 1) * pageSize;

  const [filterOptions, totalCount, salesAgg, returnsAgg, salesGuess] = await Promise.all([
    getSalesFilterOptions(filterParams),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({ where, _sum: { total: true, tax: true, discount: true, subtotal: true } }),
    prisma.saleReturn.aggregate({
      where: { storeId: ctx.activeStoreId, sale: where },
      _sum: { total: true },
    }),
    prisma.sale.findMany({
      where,
      orderBy: salesOrderBy(sort, dir),
      skip: skipGuess,
      take: pageSize,
      include: {
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(rawPage, totalPages);
  const skip = (page - 1) * pageSize;
  const sales =
    skip === skipGuess
      ? salesGuess
      : await prisma.sale.findMany({
          where,
          orderBy: salesOrderBy(sort, dir),
          skip,
          take: pageSize,
          include: {
            createdBy: { select: { name: true } },
          },
        });

  const returnCreditsBySale = await returnCreditsBySaleIds(
    ctx.activeStoreId,
    sales.map((s) => s.id),
  );

  const summaryGross = Number(salesAgg._sum.total ?? 0);
  const summarySubtotal = Number(salesAgg._sum.subtotal ?? 0);
  const summaryDiscount = Number(salesAgg._sum.discount ?? 0);
  const summaryReturnCredits = Number(returnsAgg._sum.total ?? 0);
  const summaryNet = roundMoney(summaryGross - summaryReturnCredits);
  const summaryTax = Number(salesAgg._sum.tax ?? 0);
  const listPrefs: Record<string, string> = {};
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) listPrefs.limit = String(pageSize);
  if (sort !== "createdAt") listPrefs.sort = sort;
  if (dir !== "desc") listPrefs.dir = dir;

  const clearHref = buildSimpleListUrl("/dashboard/sales", 1, pageSize, listPrefs);
  const resetTodayHref = buildSimpleListUrl("/dashboard/sales", 1, pageSize, {
    ...listPrefs,
    ...(doctor ? { doctor } : {}),
    ...(patient ? { patient } : {}),
    ...(product ? { product } : {}),
    ...(unpaidOnly ? { unpaid: "1" } : {}),
    from: today,
    to: today,
  });

  let activeFilterCount = 0;
  if (from !== today || to !== today) activeFilterCount += 1;
  if (doctor) activeFilterCount += 1;
  if (patient) activeFilterCount += 1;
  if (product) activeFilterCount += 1;
  if (unpaidOnly) activeFilterCount += 1;

  const extras = salesExtras(from, to, pageSize, doctor, patient, product, unpaidOnly, sort, dir);

  const salesCardRows: SalesListCardRow[] = sales.map((s) => {
    const gross = Number(s.total);
    const returnCr = returnCreditsBySale.get(s.id) ?? 0;
    const net = netSaleTotal(gross, returnCr);
    const canEdit = canEditSale({ createdAt: s.createdAt, returnCount: returnCr > 0 ? 1 : 0 });

    return {
      id: s.id,
      billNo: s.billNo,
      createdAtIso: s.createdAt.toISOString(),
      customerName: s.customerName,
      doctorName: s.doctorName,
      createdByName: s.createdBy.name,
      paid: s.paid,
      subtotal: Number(s.subtotal),
      discount: Number(s.discount),
      gross,
      returnCr,
      net,
      canEdit,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sales (billing history)</h1>
        <Link href="/dashboard/pos" className="text-sm font-medium text-brand-blue-light hover:underline">
          New bill →
        </Link>
      </div>

      {totalCount > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Bill total (gross)</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">₹{summaryGross.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Return credits</p>
            <p className="mt-2 text-lg font-semibold text-amber-800 dark:text-amber-200">₹{summaryReturnCredits.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <p className="text-zinc-500 dark:text-zinc-400">Net sales</p>
            <p className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">₹{summaryNet.toFixed(2)}</p>
          </div>
        </section>
      ) : null}
      {totalCount > 0 ? (
        <p className="text-xs text-zinc-500">
          {totalCount === 1 ? "1 bill" : `${totalCount} bills`} in this filter
          {totalCount > pageSize ? ` (showing page ${page} of ${totalPages})` : ""}. Billed GST (unchanged): ₹
          {summaryTax.toFixed(2)} — return credits reduce revenue, not this line-by-line tax figure.
        </p>
      ) : null}

      <MobileFilterSheet
        title="Filter sales"
        description="Defaults to today. Search by doctor, patient, or product name."
        activeCount={activeFilterCount}
      >
        <SalesFilterForm
          actionPath="/dashboard/sales"
          from={from}
          to={to}
          doctor={doctor}
          patient={patient}
          product={product}
          unpaidOnly={unpaidOnly}
          initialOptions={filterOptions}
          hiddenLimit={pageSize !== DEFAULT_LIST_PAGE_SIZE ? String(pageSize) : undefined}
          clearHref={clearHref}
          resetTodayHref={resetTodayHref}
        />
      </MobileFilterSheet>

      <ListPageSizeControls
        basePath="/dashboard/sales"
        currentLimit={pageSize}
        totalItems={totalCount}
        extraHidden={extras}
      />

      <SalesListMobile
        sales={salesCardRows}
        summarySubtotal={summarySubtotal}
        summaryDiscount={summaryDiscount}
        summaryGross={summaryGross}
        summaryReturnCredits={summaryReturnCredits}
        summaryNet={summaryNet}
        totalCount={totalCount}
      />

      <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">
                <Link
                  href={buildSimpleListUrl("/dashboard/sales", 1, pageSize, {
                    ...extras,
                    sort: "billNo",
                    dir: sort === "billNo" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Bill {sort === "billNo" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link
                  href={buildSimpleListUrl("/dashboard/sales", 1, pageSize, {
                    ...extras,
                    sort: "createdAt",
                    dir: sort === "createdAt" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  When {sort === "createdAt" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link
                  href={buildSimpleListUrl("/dashboard/sales", 1, pageSize, {
                    ...extras,
                    sort: "customerName",
                    dir: sort === "customerName" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Customer {sort === "customerName" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link
                  href={buildSimpleListUrl("/dashboard/sales", 1, pageSize, {
                    ...extras,
                    sort: "doctorName",
                    dir: sort === "doctorName" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Doctor {sort === "doctorName" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link
                  href={buildSimpleListUrl("/dashboard/sales", 1, pageSize, {
                    ...extras,
                    sort: "createdBy",
                    dir: sort === "createdBy" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Cashier {sort === "createdBy" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">
                <Link
                  href={buildSimpleListUrl("/dashboard/sales", 1, pageSize, {
                    ...extras,
                    sort: "total",
                    dir: sort === "total" && dir === "asc" ? "desc" : "asc",
                  })}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                >
                  Bill ₹ {sort === "total" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3 text-right">Returns</th>
              <th className="px-4 py-3 text-right">Net ₹</th>
              <th className="min-w-[17rem] whitespace-nowrap px-4 py-3 text-right" />
              <th className="w-14 px-2 py-3 text-center">Paid</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => {
              const gross = Number(s.total);
              const subtotal = Number(s.subtotal);
              const discount = Number(s.discount);
              const returnCr = returnCreditsBySale.get(s.id) ?? 0;
              const net = netSaleTotal(gross, returnCr);
              const canEdit = canEditSale({ createdAt: s.createdAt, returnCount: returnCr > 0 ? 1 : 0 });

              return (
                <tr key={s.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/dashboard/sales/${s.id}`}
                      className="text-brand-blue-light hover:underline"
                      title="View bill"
                    >
                      #{s.billNo}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                    <span className="block leading-snug">{formatAppDateShort(s.createdAt)}</span>
                    <span className="block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                      {formatAppTime(s.createdAt)}
                    </span>
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-zinc-800 dark:text-zinc-200" title={s.customerName ?? ""}>
                    {s.customerName ?? "—"}
                  </td>
                  <td className="max-w-[10rem] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400" title={s.doctorName ?? ""}>
                    {s.doctorName ?? "—"}
                  </td>
                  <td className="px-4 py-3">{s.createdBy.name}</td>
                  <td className="px-4 py-3 text-right">
                    <SaleBillDiscountDisplay subtotal={subtotal} discount={discount} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">₹{gross.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-800 dark:text-amber-200">
                    {returnCr > 0 ? `₹${returnCr.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">₹{net.toFixed(2)}</td>
                  <td className="min-w-[17rem] whitespace-nowrap px-4 py-3 text-right">
                    <span className="inline-flex flex-nowrap items-center justify-end gap-x-5">
                      <Link
                        href={`/dashboard/sales/${s.id}`}
                        className="shrink-0 text-sm font-medium text-brand-blue-light hover:underline"
                      >
                        View
                      </Link>
                      {canEdit ? (
                        <Link
                          href={`/dashboard/sales/${s.id}/edit`}
                          className="shrink-0 text-sm font-medium text-brand-blue-light hover:underline"
                        >
                          Edit
                        </Link>
                      ) : null}
                      <Link
                        href={`/dashboard/sales/${s.id}/return`}
                        className="shrink-0 text-sm font-medium text-brand-blue-light hover:underline"
                      >
                        Return
                      </Link>
                      <span className="shrink-0">
                        <DotmatrixPrintButton saleId={s.id} />
                      </span>
                    </span>
                  </td>
                  <td className="w-14 px-2 py-3 text-center">
                    <SalePaidSwitch saleId={s.id} initialPaid={s.paid} variant="toggle" />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totalCount > 0 ? (
            <tfoot className="bg-zinc-50 text-sm uppercase text-zinc-500 dark:bg-zinc-800">
              <tr className="border-t border-zinc-200 font-semibold dark:border-zinc-700">
                <td colSpan={5} className="px-4 py-3 text-right">
                  Totals ({totalCount} {totalCount === 1 ? "bill" : "bills"})
                </td>
                <td className="px-4 py-3 text-right">
                  <SaleBillDiscountDisplay subtotal={summarySubtotal} discount={summaryDiscount} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">₹{summaryGross.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-800 dark:text-amber-200">₹{summaryReturnCredits.toFixed(2)}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{summaryNet.toFixed(2)}</td>
                <td className="px-4 py-3" />
                <td className="px-2 py-3" />
              </tr>
            </tfoot>
          ) : null}
        </table>
        {sales.length === 0 && (
          <p className="px-4 py-8 text-center text-zinc-500">
            {from || to ? "No bills in this date range." : "No sales yet."}
          </p>
        )}
      </div>
      {totalCount > 0 ? (
        <ListPaginationNav
          label="Sales"
          page={page}
          totalPages={totalPages}
          totalItems={totalCount}
          basePath="/dashboard/sales"
          extraHidden={extras}
          prevHref={buildSimpleListUrl("/dashboard/sales", Math.max(1, page - 1), pageSize, extras)}
          nextHref={buildSimpleListUrl("/dashboard/sales", Math.min(totalPages, page + 1), pageSize, extras)}
        />
      ) : null}
    </div>
  );
}
