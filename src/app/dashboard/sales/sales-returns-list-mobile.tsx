"use client";

import Link from "next/link";
import { formatAppDateTimeDot } from "@/lib/app-timezone";

export type SalesReturnCardRow = {
  id: string;
  createdAtIso: string;
  saleId: string;
  billNo: number;
  lineCount: number;
  createdByName: string;
  total: number;
};

export function SalesReturnsListMobile({
  returns,
  creditTotal,
}: {
  returns: SalesReturnCardRow[];
  creditTotal: number;
}) {
  if (returns.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        No returns recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {returns.map((r) => (
        <article
          key={r.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatAppDateTimeDot(new Date(r.createdAtIso))}
              </p>
              <Link
                href={`/dashboard/sales/${r.saleId}`}
                className="mt-1 inline-block text-lg font-semibold text-brand-blue-light hover:underline"
              >
                Bill #{r.billNo}
              </Link>
            </div>
            <p className="shrink-0 text-lg font-semibold tabular-nums text-amber-800 dark:text-amber-200">
              ₹{r.total.toFixed(2)}
            </p>
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {r.lineCount} line{r.lineCount === 1 ? "" : "s"} · {r.createdByName}
          </p>
        </article>
      ))}
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Credits (max 100 shown)</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-amber-800 dark:text-amber-200">
          ₹{creditTotal.toFixed(2)}
        </p>
      </section>
    </div>
  );
}
