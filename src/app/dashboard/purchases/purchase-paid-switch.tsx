"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentMode } from "@/lib/constants";
import {
  paymentRefApplies,
  todayPaidAtYmd,
} from "@/lib/purchase-paid";
import { DatePickerInput } from "@/components/date-picker-input";

const fieldCls =
  "mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

function modeLabel(mode: string): string {
  if (mode === "UPI") return "UPI / GPay";
  if (mode === "CASH") return "Cash";
  if (mode === "CARD") return "Card";
  if (mode === "CREDIT") return "Credit";
  return mode;
}

export function PurchasePaidSwitch({
  purchaseId,
  initialPaid,
  initialPaymentMode,
  initialPaidAtYmd,
  initialPaymentRefLast4,
  variant = "panel",
}: {
  purchaseId: string;
  initialPaid: boolean;
  initialPaymentMode: string;
  initialPaidAtYmd: string | null;
  initialPaymentRefLast4: string | null;
  variant?: "panel" | "toggle";
}) {
  const router = useRouter();
  const [paid, setPaid] = useState(initialPaid);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    (["CASH", "CARD", "UPI", "CREDIT"].includes(initialPaymentMode)
      ? initialPaymentMode
      : "CASH") as PaymentMode,
  );
  const [paidAtYmd, setPaidAtYmd] = useState(initialPaidAtYmd ?? todayPaidAtYmd());
  const [paymentRefLast4, setPaymentRefLast4] = useState(initialPaymentRefLast4 ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(nextPaid: boolean, mode = paymentMode) {
    const prev = { paid, paymentMode, paidAtYmd, paymentRefLast4 };
    setPaid(nextPaid);
    setPaymentMode(mode);
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}/paid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paid: nextPaid,
          paymentMode: mode,
          ...(nextPaid
            ? {
                paidAt: paidAtYmd || todayPaidAtYmd(),
                paymentRefLast4: paymentRefLast4 || undefined,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaid(prev.paid);
        setPaymentMode(prev.paymentMode);
        setPaidAtYmd(prev.paidAtYmd);
        setPaymentRefLast4(prev.paymentRefLast4);
        setErr(data.error || "Could not update payment status");
        return;
      }
      const p = data.purchase as {
        paid: boolean;
        paymentMode: string;
        paidAt: string | null;
        paymentRefLast4: string | null;
      };
      setPaid(p.paid);
      setPaymentMode(
        (["CASH", "CARD", "UPI", "CREDIT"].includes(p.paymentMode)
          ? p.paymentMode
          : mode) as PaymentMode,
      );
      setPaidAtYmd(p.paidAt ? p.paidAt.slice(0, 10) : todayPaidAtYmd());
      setPaymentRefLast4(p.paymentRefLast4 ?? "");
      router.refresh();
    } catch {
      setPaid(prev.paid);
      setPaymentMode(prev.paymentMode);
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
              onChange={(e) => void save(e.target.checked)}
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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/40">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Payment mode</span>
          <select
            className={fieldCls}
            value={paymentMode}
            disabled={busy}
            onChange={(e) => {
              const mode = e.target.value as PaymentMode;
              void save(paid, mode);
            }}
          >
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI / GPay</option>
            <option value="CREDIT">Credit</option>
          </select>
        </label>
        <label
          className={`inline-flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
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
              onChange={(e) => void save(e.target.checked)}
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
      </div>

          {paid ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Paid on</span>
            <DatePickerInput
              className={fieldCls}
              value={paidAtYmd}
              disabled={busy}
              onChange={(e) => setPaidAtYmd(e.target.value)}
              onBlur={() => void save(true)}
            />
          </label>
          {paymentRefApplies(paymentMode) ? (
            <label className="text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Txn last 4</span>
              <input
                className={fieldCls}
                value={paymentRefLast4}
                maxLength={8}
                placeholder="e.g. 1A2B"
                autoComplete="off"
                disabled={busy}
                onChange={(e) => setPaymentRefLast4(e.target.value.toUpperCase())}
                onBlur={() => void save(true)}
              />
            </label>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Unpaid · {modeLabel(paymentMode)}. Mark paid when settled with the supplier.
        </p>
      )}
      {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
    </div>
  );
}
