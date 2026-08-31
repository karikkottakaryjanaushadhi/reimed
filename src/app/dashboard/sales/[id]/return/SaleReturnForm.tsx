"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatAppDateTime } from "@/lib/app-timezone";
import { returnLineRefundInclusive } from "@/lib/sale-return";
import { SaleReturnLinesMobile, SaleReturnLinesTable } from "../../sale-return-lines";

type SaleLineApi = {
  id: string;
  lotId: string;
  sku: string;
  name: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  returnedQty: number;
  returnableQty: number;
  rate: number;
  amount: number;
  discountPct: number;
  discountAmount: number;
  gstPct: number;
  gstAmount: number;
};

type SaleApi = {
  id: string;
  billNo: number;
  createdAt: string;
  customerName: string | null;
  total: number;
  returnCreditsTotal: number;
  returnCount: number;
  netTotal: number;
  paymentMode: string;
  lines: SaleLineApi[];
};

export function SaleReturnForm({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sale, setSale] = useState<SaleApi | null>(null);
  const [qtyByLineId, setQtyByLineId] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/sales/${saleId}`);
        const data = (await res.json().catch(() => null)) as { sale?: SaleApi; error?: string } | null;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data?.error ?? "Could not load bill");
          setSale(null);
          return;
        }
        if (!data?.sale) {
          setLoadError("Invalid response");
          setSale(null);
          return;
        }
        setSale(data.sale);
        const init: Record<string, string> = {};
        for (const line of data.sale.lines) {
          init[line.id] = "";
        }
        setQtyByLineId(init);
      } catch {
        if (!cancelled) setLoadError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const previewTotal = useMemo(() => {
    if (!sale) return 0;
    let sum = 0;
    for (const line of sale.lines) {
      const raw = qtyByLineId[line.id] ?? "";
      const q = raw === "" ? 0 : parseInt(raw, 10);
      if (!Number.isFinite(q) || q <= 0) continue;
      sum += returnLineRefundInclusive(line.qty, q, line.amount, line.discountAmount);
    }
    return Math.round(sum * 100) / 100;
  }, [sale, qtyByLineId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!sale) return;

    const lines: { saleLineId: string; qty: number }[] = [];
    for (const line of sale.lines) {
      const raw = qtyByLineId[line.id] ?? "";
      const q = raw === "" ? 0 : parseInt(raw, 10);
      if (!Number.isFinite(q) || q <= 0) continue;
      if (q > line.returnableQty) {
        setSubmitError(`Qty too high for ${line.name} (max ${line.returnableQty})`);
        return;
      }
      lines.push({ saleLineId: line.id, qty: q });
    }

    if (lines.length === 0) {
      setSubmitError("Enter return qty on at least one line");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined, lines }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; saleReturn?: { id: string } } | null;
      if (!res.ok) {
        setSubmitError(data?.error ?? "Return failed");
        return;
      }
      router.push("/dashboard/sales/returns");
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading bill…</p>;
  }
  if (loadError || !sale) {
    return <p className="text-sm text-rose-600 dark:text-rose-400">{loadError ?? "Not found"}</p>;
  }

  const allReturned = sale.lines.every((l) => l.returnableQty <= 0);

  const onQtyChange = (lineId: string, value: string) => {
    setQtyByLineId((prev) => ({ ...prev, [lineId]: value }));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          Bill #{sale.billNo} · {formatAppDateTime(new Date(sale.createdAt))}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm md:hidden">
          <div>
            <dt className="text-xs text-zinc-500">Customer</dt>
            <dd className="font-medium text-zinc-700 dark:text-zinc-300">{sale.customerName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Payment</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{sale.paymentMode}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Bill</dt>
            <dd className="tabular-nums text-zinc-700 dark:text-zinc-300">₹{sale.total.toFixed(2)}</dd>
          </div>
          {sale.returnCreditsTotal > 0 ? (
            <>
              <div>
                <dt className="text-xs text-zinc-500">Credits so far</dt>
                <dd className="tabular-nums text-amber-800 dark:text-amber-200">
                  −₹{sale.returnCreditsTotal.toFixed(2)} ({sale.returnCount} return
                  {sale.returnCount === 1 ? "" : "s"})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Net</dt>
                <dd className="tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
                  ₹{sale.netTotal.toFixed(2)}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        <p className="mt-1 hidden text-zinc-600 dark:text-zinc-400 md:block">
          Customer: {sale.customerName ?? "—"} · Paid: {sale.paymentMode} · Bill ₹{sale.total.toFixed(2)}
          {sale.returnCreditsTotal > 0 ? (
            <>
              {" "}
              · Credits so far −₹{sale.returnCreditsTotal.toFixed(2)} ({sale.returnCount} return
              {sale.returnCount === 1 ? "" : "s"}) · Net ₹{sale.netTotal.toFixed(2)}
            </>
          ) : null}
        </p>
      </div>

      {allReturned ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Everything on this bill has already been returned.</p>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <SaleReturnLinesMobile lines={sale.lines} qtyByLineId={qtyByLineId} onQtyChange={onQtyChange} />
            <SaleReturnLinesTable lines={sale.lines} qtyByLineId={qtyByLineId} onQtyChange={onQtyChange} />
          </div>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Note (optional)</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-950 md:max-w-xl md:text-sm"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason or reference"
            />
          </label>

          <div className="space-y-4">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Credit total (GST-inclusive):{" "}
              <span className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                ₹{previewTotal.toFixed(2)}
              </span>
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="submit"
                disabled={submitting || previewTotal <= 0}
                className="touch-manipulation w-full rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto"
              >
                {submitting ? "Saving…" : "Confirm return & restock"}
              </button>
              <Link
                href="/dashboard/sales"
                className="touch-manipulation text-center text-sm text-brand-blue-light hover:underline sm:text-left"
              >
                Cancel
              </Link>
            </div>
          </div>
        </>
      )}

      {submitError ? <p className="text-sm text-rose-600 dark:text-rose-400">{submitError}</p> : null}
    </form>
  );
}
