"use client";

import { useState } from "react";
import { printDotmatrixReceipt } from "@/lib/dotmatrix-print";

export type PosSavedBillSummary = {
  saleId: string;
  customerName: string;
  doctorName: string;
  discount: number;
  total: number;
};

export function PosSavedBillPanel({ bill }: { bill: PosSavedBillSummary }) {
  const [printing, setPrinting] = useState(false);

  async function onPrint() {
    setPrinting(true);
    try {
      await printDotmatrixReceipt(bill.saleId);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-3 py-2.5 text-sm dark:border-emerald-800/60 dark:bg-emerald-950/30"
      aria-live="polite"
    >
      <span className="shrink-0 font-semibold text-emerald-800 dark:text-emerald-200">Bill Saved</span>
      <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
        <span className="text-zinc-500 dark:text-zinc-400">Name</span> {bill.customerName}
      </span>
      <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
        <span className="text-zinc-500 dark:text-zinc-400">Doc</span> {bill.doctorName}
      </span>
      <span className="tabular-nums text-zinc-700 dark:text-zinc-300">
        <span className="text-zinc-500 dark:text-zinc-400">Disc</span> ₹{bill.discount.toFixed(2)}
      </span>
      <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
        <span className="font-normal text-zinc-500 dark:text-zinc-400">Total</span> ₹{bill.total.toFixed(2)}
      </span>
      <button
        type="button"
        disabled={printing}
        onClick={() => void onPrint()}
        className="ml-auto shrink-0 touch-manipulation rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
      >
        {printing ? "Printing…" : "Print"}
      </button>
    </div>
  );
}
