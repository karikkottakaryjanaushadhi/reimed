"use client";

import Link from "next/link";
import { formatAppDateTimeDot } from "@/lib/app-timezone";

export type MarginProductCard = {
  productId: string;
  productName: string;
  quantity: number;
  returnQty: number;
  billCount: number;
  netRevenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
};

export type MarginBillCard = {
  saleId: string;
  billNo: number;
  createdAtIso: string;
  customerName: string | null;
  lineCount: number;
  netRevenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
  returnCredits: number;
};

export function MarginsProductMobile({ items }: { items: MarginProductCard[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        No product sales match this filter.
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {items.map((item) => (
        <article
          key={item.productId}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">{item.productName}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Net qty</dt>
              <dd className="tabular-nums">
                {item.quantity}
                {item.returnQty > 0 ? (
                  <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(−{item.returnQty})</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Bills</dt>
              <dd className="tabular-nums">{item.billCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Net revenue</dt>
              <dd className="tabular-nums">₹{item.netRevenue.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Cost</dt>
              <dd className="tabular-nums">₹{item.cost.toFixed(2)}</dd>
            </div>
            <div className="col-span-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <dt className="text-xs text-zinc-500">Margin</dt>
              <dd className="text-lg font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                ₹{item.margin.toFixed(2)}{" "}
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                  ({item.marginPercent.toFixed(1)}%)
                </span>
              </dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export function MarginsBillMobile({ items }: { items: MarginBillCard[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        No bills match this filter.
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {items.map((item) => (
        <article
          key={item.saleId}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link
                href={`/dashboard/sales/${item.saleId}`}
                className="text-lg font-semibold text-brand-blue-light hover:underline"
              >
                Bill #{item.billNo}
              </Link>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {formatAppDateTimeDot(new Date(item.createdAtIso))}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.customerName ?? "—"}</p>
            </div>
            <p className="shrink-0 text-right text-lg font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
              ₹{item.margin.toFixed(2)}
              <span className="block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {item.marginPercent.toFixed(1)}% Mrg
              </span>
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Lines</dt>
              <dd className="tabular-nums">{item.lineCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Net revenue</dt>
              <dd className="tabular-nums">₹{item.netRevenue.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Cost</dt>
              <dd className="tabular-nums">₹{item.cost.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Mrg%</dt>
              <dd className="tabular-nums">{item.marginPercent.toFixed(1)}%</dd>
            </div>
            {item.returnCredits > 0 ? (
              <div className="col-span-2">
                <dt className="text-xs text-zinc-500">Returns</dt>
                <dd className="tabular-nums text-amber-800 dark:text-amber-200">₹{item.returnCredits.toFixed(2)}</dd>
              </div>
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  );
}
