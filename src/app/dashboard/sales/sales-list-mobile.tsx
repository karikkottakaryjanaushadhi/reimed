"use client";

import Link from "next/link";
import { formatAppDateShort, formatAppTime } from "@/lib/app-timezone";
import { SaleBillDiscountDisplay } from "@/app/dashboard/sales/sale-bill-discount-display";
import { DotmatrixPrintButton } from "@/components/DotmatrixPrintButton";
import { SalePaidSwitch } from "@/app/dashboard/sales/sale-paid-switch";

export type SalesListCardRow = {
  id: string;
  billNo: number;
  createdAtIso: string;
  customerName: string | null;
  doctorName: string | null;
  createdByName: string;
  paid: boolean;
  subtotal: number;
  discount: number;
  gross: number;
  returnCr: number;
  net: number;
  canEdit: boolean;
};

export function SalesListMobile({
  sales,
  summarySubtotal,
  summaryDiscount,
  summaryGross,
  summaryReturnCredits,
  summaryNet,
  totalCount,
}: {
  sales: SalesListCardRow[];
  summarySubtotal: number;
  summaryDiscount: number;
  summaryGross: number;
  summaryReturnCredits: number;
  summaryNet: number;
  totalCount: number;
}) {
  if (sales.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        No bills match these filters.
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {sales.map((s) => (
        <article
          key={s.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/dashboard/sales/${s.id}`}
                className="text-lg font-semibold text-brand-blue-light hover:underline"
              >
                Bill #{s.billNo}
              </Link>
              <p className="mt-1 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                <span className="block">{formatAppDateShort(new Date(s.createdAtIso))}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-500">
                  {formatAppTime(new Date(s.createdAtIso))}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <p className="text-right text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                ₹{s.net.toFixed(2)}
              </p>
              <SalePaidSwitch saleId={s.id} initialPaid={s.paid} variant="toggle" />
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Customer</dt>
              <dd className="truncate font-medium text-zinc-800 dark:text-zinc-200">{s.customerName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Doctor</dt>
              <dd className="truncate text-zinc-700 dark:text-zinc-300">{s.doctorName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Cashier</dt>
              <dd className="truncate text-zinc-700 dark:text-zinc-300">{s.createdByName}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Discount</dt>
              <dd>
                <SaleBillDiscountDisplay subtotal={s.subtotal} discount={s.discount} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Bill (gross)</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">₹{s.gross.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Returns</dt>
              <dd className="tabular-nums text-amber-800 dark:text-amber-200">
                {s.returnCr > 0 ? `₹${s.returnCr.toFixed(2)}` : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-nowrap items-center gap-3 overflow-x-auto border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <Link
              href={`/dashboard/sales/${s.id}`}
              className="shrink-0 touch-manipulation rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
            >
              View
            </Link>
            {s.canEdit ? (
              <Link
                href={`/dashboard/sales/${s.id}/edit`}
                className="shrink-0 touch-manipulation rounded-lg px-4 py-2 text-sm font-medium text-brand-blue-light"
              >
                Edit
              </Link>
            ) : null}
            <Link
              href={`/dashboard/sales/${s.id}/return`}
              className="shrink-0 touch-manipulation rounded-lg px-4 py-2 text-sm font-medium text-brand-blue-light"
            >
              Return
            </Link>
            <span className="shrink-0 touch-manipulation rounded-lg px-4 py-2 text-sm">
              <DotmatrixPrintButton saleId={s.id} />
            </span>
          </div>
        </article>
      ))}

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Totals ({totalCount} {totalCount === 1 ? "bill" : "bills"})
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-zinc-500">Discount</dt>
            <dd>
              <SaleBillDiscountDisplay subtotal={summarySubtotal} discount={summaryDiscount} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Gross</dt>
            <dd className="font-semibold tabular-nums">₹{summaryGross.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Returns</dt>
            <dd className="font-semibold tabular-nums text-amber-800 dark:text-amber-200">₹{summaryReturnCredits.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Net</dt>
            <dd className="font-semibold tabular-nums">₹{summaryNet.toFixed(2)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
