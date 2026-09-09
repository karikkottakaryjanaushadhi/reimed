import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { formatAppDateTime, formatAppMonthEndYmd, formatAppMonthStartYmd } from "@/lib/app-timezone";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import {
  PurchasesFilterForm,
  type PurchaseDateOn,
  type PurchasePaidFilter,
  type PurchaseStatusFilter,
} from "@/app/dashboard/purchases/purchases-filter-form";
import { PurchasePaidSwitch } from "@/app/dashboard/purchases/purchase-paid-switch";
import {
  PurchasesListMobile,
  type PurchaseListCardRow,
} from "@/app/dashboard/purchases/purchases-list-mobile";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { roundMoney } from "@/lib/bill-round";
import { prisma } from "@/lib/prisma";
import { buildPurchaseFilterWhere, getPurchaseFilterOptions } from "@/lib/purchases-filter-options";
import { purchaseBillTotalsFromLines } from "@/lib/purchase-line";
import { snapProductGstPct } from "@/lib/product-gst-slabs";

const purchaseBillLineSelect = {
  quantity: true,
  costPrice: true,
  pack: true,
  purchaseDiscountPct: true,
  purchaseDiscountRs: true,
  schemeDiscountPct: true,
  schemeDiscountRs: true,
  gstPct: true,
} as const;

function purchaseListExtras(
  from: string,
  to: string,
  dateOn: PurchaseDateOn,
  supplier: string,
  invoice: string,
  product: string,
  status: PurchaseStatusFilter,
  paid: PurchasePaidFilter,
  pageSize: number,
  sort: string,
  dir: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (from) e.from = from;
  if (to) e.to = to;
  if (dateOn !== "recorded") e.dateOn = dateOn;
  if (supplier) e.supplier = supplier;
  if (invoice) e.invoice = invoice;
  if (product) e.product = product;
  if (status) e.status = status;
  if (paid) e.paid = paid;
  if (pageSize !== DEFAULT_LIST_PAGE_SIZE) e.limit = String(pageSize);
  if (sort && sort !== "createdAt") e.sort = sort;
  if (dir && dir !== "desc") e.dir = dir;
  return e;
}

function purchaseOrderBy(sort: string, dir: "asc" | "desc") {
  switch (sort) {
    case "purchaseNo":
      return { purchaseNo: dir };
    case "supplier":
      return { supplier: { name: dir } };
    case "invoiceRef":
      return { invoiceRef: dir };
    case "invoiceDate":
      return { invoiceDate: dir };
    case "createdAt":
    default:
      return { createdAt: dir };
  }
}

function parsePurchaseDateOn(raw: unknown): PurchaseDateOn {
  return raw === "invoice" ? "invoice" : "recorded";
}

function parsePurchaseStatus(raw: unknown): PurchaseStatusFilter {
  if (raw === "complete" || raw === "in_progress") return raw;
  return "";
}

function parsePurchasePaid(raw: unknown): PurchasePaidFilter {
  if (raw === "unpaid" || raw === "paid") return raw;
  return "";
}

function toPurchaseBillLine(line: {
  quantity: number;
  costPrice: { toString(): string };
  pack: number;
  purchaseDiscountPct: { toString(): string };
  purchaseDiscountRs: { toString(): string };
  schemeDiscountPct: { toString(): string };
  schemeDiscountRs: { toString(): string };
  gstPct: { toString(): string };
}) {
  return {
    quantity: line.quantity,
    costPrice: Number(line.costPrice),
    pack: line.pack,
    purchaseDiscountPct: Number(line.purchaseDiscountPct),
    purchaseDiscountRs: Number(line.purchaseDiscountRs),
    schemeDiscountPct: Number(line.schemeDiscountPct),
    schemeDiscountRs: Number(line.schemeDiscountRs),
    gstPct: snapProductGstPct(line.gstPct),
  };
}

function summarizePurchaseBills(
  purchases: ReadonlyArray<{ lines: ReadonlyArray<Parameters<typeof toPurchaseBillLine>[0]> }>,
) {
  let taxable = 0;
  let gst = 0;
  let discount = 0;
  let grandTotal = 0;
  for (const p of purchases) {
    const t = purchaseBillTotalsFromLines(p.lines.map(toPurchaseBillLine));
    taxable += t.netTotal;
    gst += t.gstTotal;
    discount += t.schemeDiscountTotal + t.purchaseDiscountTotal;
    grandTotal += t.grandTotal;
  }
  return {
    taxable: roundMoney(taxable),
    gst: roundMoney(gst),
    discount: roundMoney(discount),
    grandTotal: roundMoney(grandTotal),
  };
}

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    from?: string;
    to?: string;
    dateOn?: string;
    supplier?: string;
    invoice?: string;
    product?: string;
    status?: string;
    paid?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">Purchases are available to store managers only.</p>
    );
  }

  const sp = await searchParams;
  const rawPage = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const pageSize = parseListLimitParam(sp.limit);
  const monthFrom = formatAppMonthStartYmd();
  const monthTo = formatAppMonthEndYmd();
  const from = trimDateParam(sp.from) || monthFrom;
  const to = trimDateParam(sp.to) || monthTo;
  const dateOn = parsePurchaseDateOn(sp.dateOn);
  const supplier = typeof sp.supplier === "string" ? sp.supplier.trim() : "";
  const invoice = typeof sp.invoice === "string" ? sp.invoice.trim() : "";
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  const status = parsePurchaseStatus(sp.status);
  const paid = parsePurchasePaid(sp.paid);
  const sort =
    sp.sort === "purchaseNo" ||
    sp.sort === "supplier" ||
    sp.sort === "invoiceRef" ||
    sp.sort === "invoiceDate" ||
    sp.sort === "createdAt"
      ? sp.sort
      : "createdAt";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "desc";

  const filterParams = {
    storeId: ctx.activeStoreId,
    from,
    to,
    dateOn,
    supplier,
    invoice,
    product,
    status,
    paid,
  };

  const where = buildPurchaseFilterWhere(filterParams);
  const skipGuess = (rawPage - 1) * pageSize;

  const [filterOptions, totalCount, purchasesGuess] = await Promise.all([
    getPurchaseFilterOptions(filterParams),
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      orderBy: purchaseOrderBy(sort, dir),
      skip: skipGuess,
      take: pageSize,
      select: {
        id: true,
        purchaseNo: true,
        createdAt: true,
        invoiceRef: true,
        invoiceDate: true,
        complete: true,
        paid: true,
        paymentMode: true,
        paidAt: true,
        paymentRefLast4: true,
        supplier: { select: { name: true } },
        lines: { select: purchaseBillLineSelect },
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(rawPage, totalPages);
  const skip = (page - 1) * pageSize;
  const purchases =
    skip === skipGuess
      ? purchasesGuess
      : await prisma.purchase.findMany({
          where,
          orderBy: purchaseOrderBy(sort, dir),
          skip,
          take: pageSize,
          select: {
            id: true,
            purchaseNo: true,
            createdAt: true,
            invoiceRef: true,
            invoiceDate: true,
            complete: true,
            paid: true,
            paymentMode: true,
            paidAt: true,
            paymentRefLast4: true,
            supplier: { select: { name: true } },
            lines: { select: purchaseBillLineSelect },
          },
        });

  const extraSummaryLines =
    totalCount > pageSize
      ? await prisma.purchaseLine.findMany({
          where: { purchase: where },
          select: { purchaseId: true, ...purchaseBillLineSelect },
        })
      : null;

  const extraSummaryPurchases = extraSummaryLines
    ? (() => {
        const byPurchase = new Map<string, typeof extraSummaryLines>();
        for (const line of extraSummaryLines) {
          const rows = byPurchase.get(line.purchaseId);
          if (rows) rows.push(line);
          else byPurchase.set(line.purchaseId, [line]);
        }
        return [...byPurchase.values()].map((lines) => ({ lines }));
      })()
    : null;

  const summary = summarizePurchaseBills(extraSummaryPurchases ?? purchases);

  const extras = purchaseListExtras(
    from,
    to,
    dateOn,
    supplier,
    invoice,
    product,
    status,
    paid,
    pageSize,
    sort,
    dir,
  );
  const clearHref = buildSimpleListUrl("/dashboard/purchases", 1, pageSize, {
    ...(pageSize !== DEFAULT_LIST_PAGE_SIZE ? { limit: String(pageSize) } : {}),
    ...(sort !== "createdAt" ? { sort } : {}),
    ...(dir !== "desc" ? { dir } : {}),
  });
  const resetThisMonthHref = buildSimpleListUrl("/dashboard/purchases", 1, pageSize, {
    ...(pageSize !== DEFAULT_LIST_PAGE_SIZE ? { limit: String(pageSize) } : {}),
    ...(sort !== "createdAt" ? { sort } : {}),
    ...(dir !== "desc" ? { dir } : {}),
    ...(dateOn !== "recorded" ? { dateOn } : {}),
    ...(supplier ? { supplier } : {}),
    ...(invoice ? { invoice } : {}),
    ...(product ? { product } : {}),
    ...(status ? { status } : {}),
    ...(paid ? { paid } : {}),
    from: monthFrom,
    to: monthTo,
  });

  const dateOnLabel = dateOn === "invoice" ? "invoice date" : "recorded date";
  const datesAreDefault = from === monthFrom && to === monthTo;
  const hasActiveFilters = !!(
    !datesAreDefault ||
    supplier ||
    invoice ||
    product ||
    status ||
    paid ||
    dateOn !== "recorded"
  );

  let activeFilterCount = 0;
  if (!datesAreDefault) activeFilterCount += 1;
  if (dateOn !== "recorded") activeFilterCount += 1;
  if (supplier) activeFilterCount += 1;
  if (invoice) activeFilterCount += 1;
  if (product) activeFilterCount += 1;
  if (status) activeFilterCount += 1;
  if (paid) activeFilterCount += 1;

  const purchaseCards: PurchaseListCardRow[] = purchases.map((p) => {
    const totals = purchaseBillTotalsFromLines(p.lines.map(toPurchaseBillLine));
    return {
      id: p.id,
      purchaseNo: p.purchaseNo,
      createdAtIso: p.createdAt.toISOString(),
      supplierName: p.supplier.name,
      invoiceRef: p.invoiceRef,
      invoiceDateIso: p.invoiceDate?.toISOString() ?? null,
      totalInclGst: totals.grandTotal,
      complete: p.complete,
      paid: p.paid,
      paymentMode: p.paymentMode,
    };
  });

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Purchase list</h1>
          <Link
            href="/dashboard/purchases/new"
            className="text-sm font-medium text-brand-blue-light hover:underline"
          >
            New purchase →
          </Link>
        </div>

        {totalCount > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-zinc-500 dark:text-zinc-400">Taxable (ex-GST)</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                ₹{summary.taxable.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-zinc-500 dark:text-zinc-400">GST</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                ₹{summary.gst.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <p className="text-zinc-500 dark:text-zinc-400">Grand total (incl. GST)</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                ₹{summary.grandTotal.toFixed(2)}
              </p>
            </div>
          </section>
        ) : null}
        {totalCount > 0 ? (
          <p className="text-xs text-zinc-500">
            {totalCount === 1 ? "1 purchase" : `${totalCount} purchases`} in this filter
            {totalCount > pageSize ? ` (showing page ${page} of ${totalPages})` : ""}. Discount (scheme +
            purchase): ₹{summary.discount.toFixed(2)}.
          </p>
        ) : null}
      </div>

      <MobileFilterSheet
        title="Filter purchases"
        description={`Defaults to this month. Filter by ${dateOnLabel}, supplier, invoice, product, status, or payment.`}
        activeCount={activeFilterCount}
      >
        <PurchasesFilterForm
          key={[from, to, dateOn, supplier, invoice, product, status, paid].join("\0")}
          actionPath="/dashboard/purchases"
          from={from}
          to={to}
          dateOn={dateOn}
          supplier={supplier}
          invoice={invoice}
          product={product}
          status={status}
          paid={paid}
          initialOptions={filterOptions}
          hiddenLimit={pageSize !== DEFAULT_LIST_PAGE_SIZE ? String(pageSize) : undefined}
          hiddenSort={sort !== "createdAt" ? sort : undefined}
          hiddenDir={dir !== "desc" ? dir : undefined}
          clearHref={clearHref}
          resetThisMonthHref={resetThisMonthHref}
        />
      </MobileFilterSheet>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">Saved purchases</h2>
        <ListPageSizeControls
          basePath="/dashboard/purchases"
          currentLimit={pageSize}
          totalItems={totalCount}
          extraHidden={extras}
        />
        <PurchasesListMobile
          purchases={purchaseCards}
          summaryTaxable={summary.taxable}
          summaryGst={summary.gst}
          summaryGrandTotal={summary.grandTotal}
          summaryDiscount={summary.discount}
          totalCount={totalCount}
          emptyMessage={hasActiveFilters ? "No purchases match these filters." : "No purchases this month."}
        />

        <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-3">
                  <Link
                    href={buildSimpleListUrl("/dashboard/purchases", 1, pageSize, {
                      ...extras,
                      sort: "purchaseNo",
                      dir: sort === "purchaseNo" && dir === "asc" ? "desc" : "asc",
                    })}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Purchase # {sort === "purchaseNo" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="px-4 py-3">
                  <Link
                    href={buildSimpleListUrl("/dashboard/purchases", 1, pageSize, {
                      ...extras,
                      sort: "createdAt",
                      dir: sort === "createdAt" && dir === "asc" ? "desc" : "asc",
                    })}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Recorded {sort === "createdAt" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="px-4 py-3">
                  <Link
                    href={buildSimpleListUrl("/dashboard/purchases", 1, pageSize, {
                      ...extras,
                      sort: "supplier",
                      dir: sort === "supplier" && dir === "asc" ? "desc" : "asc",
                    })}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Supplier {sort === "supplier" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="px-4 py-3">
                  <Link
                    href={buildSimpleListUrl("/dashboard/purchases", 1, pageSize, {
                      ...extras,
                      sort: "invoiceRef",
                      dir: sort === "invoiceRef" && dir === "asc" ? "desc" : "asc",
                    })}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Invoice {sort === "invoiceRef" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="px-4 py-3">
                  <Link
                    href={buildSimpleListUrl("/dashboard/purchases", 1, pageSize, {
                      ...extras,
                      sort: "invoiceDate",
                      dir: sort === "invoiceDate" && dir === "asc" ? "desc" : "asc",
                    })}
                    className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200"
                  >
                    Inv. date {sort === "invoiceDate" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                  </Link>
                </th>
                <th className="px-4 py-3 text-right">Total (incl. GST, approx.)</th>
                <th className="px-4 py-3 text-center">Paid</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => {
                const totals = purchaseBillTotalsFromLines(p.lines.map(toPurchaseBillLine));
                const modeLabel =
                  p.paymentMode === "UPI"
                    ? "UPI"
                    : p.paymentMode === "CASH"
                      ? "Cash"
                      : p.paymentMode === "CARD"
                        ? "Card"
                        : p.paymentMode === "CREDIT"
                          ? "Credit"
                          : p.paymentMode;
                return (
                  <tr key={p.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2 font-medium tabular-nums">
                      <Link
                        href={`/dashboard/purchases/${p.id}`}
                        className="text-brand-blue-light hover:underline"
                      >
                        #{p.purchaseNo}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-zinc-600">
                      {formatAppDateTime(p.createdAt)}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-2">{p.supplier.name}</td>
                    <td className="px-4 py-2">{p.invoiceRef?.trim() || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {p.invoiceDate ? format(p.invoiceDate, "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">₹{totals.grandTotal.toFixed(2)}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <PurchasePaidSwitch
                          purchaseId={p.id}
                          initialPaid={p.paid}
                          initialPaymentMode={p.paymentMode}
                          initialPaidAtYmd={p.paidAt ? format(p.paidAt, "yyyy-MM-dd") : null}
                          initialPaymentRefLast4={p.paymentRefLast4}
                          variant="toggle"
                        />
                        <span className="text-[10px] text-zinc-500">{modeLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/dashboard/purchases/${p.id}`}
                        className="font-medium text-brand-blue-light hover:underline"
                      >
                        {p.complete ? "View" : "Edit"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totalCount > 0 ? (
              <tfoot className="bg-zinc-50 text-sm uppercase text-zinc-500 dark:bg-zinc-800">
                <tr className="border-t border-zinc-200 font-semibold dark:border-zinc-700">
                  <td colSpan={5} className="px-4 py-3 text-right">
                    Totals ({totalCount} {totalCount === 1 ? "purchase" : "purchases"})
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">₹{summary.grandTotal.toFixed(2)}</td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
          {purchases.length === 0 ? (
            <p className="px-4 py-8 text-center text-zinc-500">
              {hasActiveFilters ? "No purchases match these filters." : "No purchases this month."}
            </p>
          ) : null}
        </div>
        {totalCount > 0 ? (
          <ListPaginationNav
            label="Purchases"
            page={page}
            totalPages={totalPages}
            totalItems={totalCount}
            basePath="/dashboard/purchases"
            extraHidden={extras}
            prevHref={buildSimpleListUrl("/dashboard/purchases", Math.max(1, page - 1), pageSize, extras)}
            nextHref={buildSimpleListUrl(
              "/dashboard/purchases",
              Math.min(totalPages, page + 1),
              pageSize,
              extras,
            )}
          />
        ) : null}
      </section>
    </div>
  );
}
