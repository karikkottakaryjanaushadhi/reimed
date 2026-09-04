"use client";

import Link from "next/link";
import { format } from "date-fns";
import { formatAppDateTimeDot } from "@/lib/app-timezone";

export type PurchaseListCardRow = {
  id: string;
  purchaseNo: number;
  createdAtIso: string;
  supplierName: string;
  invoiceRef: string | null;
  invoiceDateIso: string | null;
  totalInclGst: number;
  complete: boolean;
  paid: boolean;
  paymentMode: string;
};

export function PurchasesListMobile({
  purchases,
  summaryTaxable,
  summaryGst,
  summaryGrandTotal,
  summaryDiscount,
  totalCount,
  emptyMessage,
}: {
  purchases: PurchaseListCardRow[];
  summaryTaxable: number;
  summaryGst: number;
  summaryGrandTotal: number;
  summaryDiscount: number;
  totalCount: number;
  emptyMessage: string;
}) {
  if (purchases.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {purchases.map((p) => (
        <article
          key={p.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-500">Purchase #{p.purchaseNo}</p>
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">{p.supplierName}</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {formatAppDateTimeDot(new Date(p.createdAtIso))}
              </p>
            </div>
            <p className="shrink-0 text-right text-lg font-semibold tabular-nums">₹{p.totalInclGst.toFixed(2)}</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Invoice</dt>
              <dd>{p.invoiceRef?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Inv. date</dt>
              <dd>
                {p.invoiceDateIso ? format(new Date(p.invoiceDateIso), "dd MMM yyyy") : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Status</dt>
              <dd>{p.complete ? "Finalized" : "Editing"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Payment</dt>
              <dd>
                {p.paid ? "Paid" : "Unpaid"}
                {" · "}
                {p.paymentMode === "UPI"
                  ? "UPI / GPay"
                  : p.paymentMode === "CASH"
                    ? "Cash"
                    : p.paymentMode === "CARD"
                      ? "Card"
                      : p.paymentMode === "CREDIT"
                        ? "Credit"
                        : p.paymentMode}
              </dd>
            </div>
          </dl>
          <Link
            href={`/dashboard/purchases/${p.id}`}
            className="mt-4 inline-flex touch-manipulation rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
          >
            {p.complete ? "View" : "Edit"}
          </Link>
        </article>
      ))}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Totals ({totalCount} {totalCount === 1 ? "purchase" : "purchases"})
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-zinc-500">Taxable (ex-GST)</dt>
            <dd className="font-semibold tabular-nums">₹{summaryTaxable.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">GST</dt>
            <dd className="font-semibold tabular-nums">₹{summaryGst.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Discount</dt>
            <dd className="font-semibold tabular-nums">₹{summaryDiscount.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Grand total</dt>
            <dd className="font-semibold tabular-nums">₹{summaryGrandTotal.toFixed(2)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
