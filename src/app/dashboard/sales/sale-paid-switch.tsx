"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SalePaidSwitch({
  saleId,
  initialPaid,
  variant = "panel",
}: {
  saleId: string;
  initialPaid: boolean;
  variant?: "panel" | "inline" | "toggle";
}) {
  const router = useRouter();
  const [paid, setPaid] = useState(initialPaid);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onToggle(next: boolean) {
    const prev = paid;
    setPaid(next);
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaid(prev);
        setErr(data.error || "Could not update payment status");
        return;
      }
      router.refresh();
    } catch {
      setPaid(prev);
      setErr("Could not update payment status");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "toggle") {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <label
          className={`inline-flex items-center justify-center ${busy ? "cursor-wait opacity-60" : "cursor-pointer"}`}
          title={paid ? "Mark as unpaid" : "Mark as paid"}
        >
          <span className="relative inline-flex h-5 w-9 shrink-0">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={paid}
              disabled={busy}
              aria-checked={paid}
              aria-label={paid ? "Bill paid" : "Bill unpaid"}
              onChange={(e) => void onToggle(e.target.checked)}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full bg-zinc-300 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-blue peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-green dark:bg-zinc-600"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out peer-checked:translate-x-4 dark:bg-zinc-100"
            />
          </span>
        </label>
        {err ? <span className="text-xs text-red-600 dark:text-red-400">{err}</span> : null}
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span className="inline-flex flex-col items-start gap-0.5">
        <label
          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 ${
            busy ? "cursor-wait opacity-60" : "cursor-pointer"
          }`}
          title={paid ? "Mark as unpaid" : "Mark as paid"}
        >
          <span className="relative inline-flex h-4 w-7 shrink-0">
            <input
              type="checkbox"
              role="switch"
              className="peer sr-only"
              checked={paid}
              disabled={busy}
              aria-checked={paid}
              aria-label={paid ? "Bill paid" : "Bill unpaid"}
              onChange={(e) => void onToggle(e.target.checked)}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full bg-zinc-300 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-blue peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-green dark:bg-zinc-600"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ease-out peer-checked:translate-x-3 dark:bg-zinc-100"
            />
          </span>
          <span
            className={`text-xs font-medium ${
              paid ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"
            }`}
          >
            {paid ? "Paid" : "Mark paid"}
          </span>
        </label>
        {err ? <span className="text-xs text-red-600 dark:text-red-400">{err}</span> : null}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label
        className={`inline-flex w-fit max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
          paid
            ? "border-emerald-200 bg-emerald-50/90 dark:border-emerald-900 dark:bg-emerald-950/40"
            : "border-amber-200 bg-amber-50/90 dark:border-amber-900 dark:bg-amber-950/40"
        } ${busy ? "cursor-wait opacity-60" : "cursor-pointer"}`}
      >
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Bill paid</span>
        <span className="relative inline-flex h-5 w-9 shrink-0">
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={paid}
            disabled={busy}
            aria-checked={paid}
            onChange={(e) => void onToggle(e.target.checked)}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 rounded-full bg-zinc-300 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-blue peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-green dark:bg-zinc-600"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute left-0.5 top-0.5 z-10 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out peer-checked:translate-x-4 dark:bg-zinc-100"
          />
        </span>
      </label>
      {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
    </div>
  );
}
