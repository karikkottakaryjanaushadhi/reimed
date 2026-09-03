"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatAppDateTime } from "@/lib/app-timezone";
import { returnLinePurchaseCreditInclusive } from "@/lib/purchase-return";
import { PurchaseReturnLinesMobile, PurchaseReturnLinesTable } from "../../purchase-return-lines";

type PurchaseLineApi = {
  id: string;
  sku: string;
  name: string;
  batchNo: string;
  expiryDate: string;
  qty: number;
  freeQty: number;
  returnedQty: number;
  returnableQty: number;
  linePayable: number;
};

type PurchaseApi = {
  id: string;
  purchaseNo: number;
  complete: boolean;
  createdAt: string;
  supplierName: string;
  invoiceRef: string | null;
  billGrandTotal: number;
  returnCreditsTotal: number;
  returnCount: number;
  netTotal: number;
  lines: PurchaseLineApi[];
};

export function PurchaseReturnForm({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<PurchaseApi | null>(null);
  const [qtyByLineId, setQtyByLineId] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [creditNoteNo, setCreditNoteNo] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/purchases/${purchaseId}`);
        const data = (await res.json().catch(() => null)) as {
          purchase?: {
            id: string;
            purchaseNo: number;
            complete: boolean;
            createdAt: string;
            invoiceRef: string | null;
            billGrandTotal: number;
            returnCreditsTotal: number;
            returnCount: number;
            netTotal: number;
            supplier?: { name: string };
            lines: Array<{
              id: string;
              batchNo: string;
              expiryDate: string;
              quantity: number;
              freeQty: number;
              returnedQty: number;
              returnableQty: number;
              linePayable: number;
              product?: { sku: string; name: string };
            }>;
          };
          error?: string;
        } | null;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data?.error ?? "Could not load purchase");
          setPurchase(null);
          return;
        }
        if (!data?.purchase) {
          setLoadError("Invalid response");
          setPurchase(null);
          return;
        }
        const p = data.purchase;
        setPurchase({
          id: p.id,
          purchaseNo: p.purchaseNo,
          complete: p.complete,
          createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date(p.createdAt).toISOString(),
          supplierName: p.supplier?.name ?? "—",
          invoiceRef: p.invoiceRef,
          billGrandTotal: p.billGrandTotal,
          returnCreditsTotal: p.returnCreditsTotal,
          returnCount: p.returnCount,
          netTotal: p.netTotal,
          lines: p.lines.map((l) => ({
            id: l.id,
            sku: l.product?.sku ?? "",
            name: l.product?.name ?? "",
            batchNo: l.batchNo,
            expiryDate:
              typeof l.expiryDate === "string" ? l.expiryDate : new Date(l.expiryDate).toISOString(),
            qty: l.quantity,
            freeQty: l.freeQty,
            returnedQty: l.returnedQty,
            returnableQty: l.returnableQty,
            linePayable: l.linePayable,
          })),
        });
        const init: Record<string, string> = {};
        for (const line of p.lines) {
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
  }, [purchaseId]);

  const previewTotal = useMemo(() => {
    if (!purchase) return 0;
    let sum = 0;
    for (const line of purchase.lines) {
      const raw = qtyByLineId[line.id] ?? "";
      const q = raw === "" ? 0 : parseInt(raw, 10);
      if (!Number.isFinite(q) || q <= 0) continue;
      sum += returnLinePurchaseCreditInclusive(line.qty, q, line.linePayable);
    }
    return Math.round(sum * 100) / 100;
  }, [purchase, qtyByLineId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!purchase) return;

    if (!purchase.complete) {
      setSubmitError("Finalize the purchase before recording a return");
      return;
    }

    const lines: { purchaseLineId: string; qty: number }[] = [];
    for (const line of purchase.lines) {
      const raw = qtyByLineId[line.id] ?? "";
      const q = raw === "" ? 0 : parseInt(raw, 10);
      if (!Number.isFinite(q) || q <= 0) continue;
      if (q > line.returnableQty) {
        setSubmitError(`Qty too high for ${line.name} (max ${line.returnableQty})`);
        return;
      }
      lines.push({ purchaseLineId: line.id, qty: q });
    }

    if (lines.length === 0) {
      setSubmitError("Enter return qty on at least one line");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/purchases/${purchaseId}/returns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || undefined,
          creditNoteNo: creditNoteNo.trim() || undefined,
          creditNoteDate: creditNoteDate.trim() || undefined,
          lines,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        purchaseReturn?: { id: string };
      } | null;
      if (!res.ok) {
        setSubmitError(data?.error ?? "Return failed");
        return;
      }
      router.push("/dashboard/purchases/returns");
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading purchase…</p>;
  }
  if (loadError || !purchase) {
    return <p className="text-sm text-rose-600 dark:text-rose-400">{loadError ?? "Not found"}</p>;
  }

  if (!purchase.complete) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Finalize this purchase before recording a supplier return.{" "}
        <Link href={`/dashboard/purchases/${purchaseId}`} className="text-brand-blue-light hover:underline">
          Open purchase
        </Link>
      </p>
    );
  }

  const allReturned = purchase.lines.every((l) => l.returnableQty <= 0);

  const onQtyChange = (lineId: string, value: string) => {
    setQtyByLineId((prev) => ({ ...prev, [lineId]: value }));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <p className="font-medium text-zinc-800 dark:text-zinc-200">
          Purchase #{purchase.purchaseNo} · {formatAppDateTime(new Date(purchase.createdAt))}
        </p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Supplier: {purchase.supplierName}
          {purchase.invoiceRef?.trim() ? ` · Invoice ${purchase.invoiceRef.trim()}` : ""} · Bill ₹
          {purchase.billGrandTotal.toFixed(2)}
          {purchase.returnCreditsTotal > 0 ? (
            <>
              {" "}
              · Credits so far −₹{purchase.returnCreditsTotal.toFixed(2)} ({purchase.returnCount} return
              {purchase.returnCount === 1 ? "" : "s"}) · Net ₹{purchase.netTotal.toFixed(2)}
            </>
          ) : null}
        </p>
      </div>

      {allReturned ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          All trade quantity on this purchase has already been returned.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <PurchaseReturnLinesMobile
              lines={purchase.lines}
              qtyByLineId={qtyByLineId}
              onQtyChange={onQtyChange}
            />
            <PurchaseReturnLinesTable
              lines={purchase.lines}
              qtyByLineId={qtyByLineId}
              onQtyChange={onQtyChange}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:max-w-xl">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Supplier credit note no. (optional)
              </span>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-950 md:text-sm"
                maxLength={120}
                value={creditNoteNo}
                onChange={(e) => setCreditNoteNo(e.target.value)}
                placeholder="CN / credit note reference"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Credit note date (optional)
              </span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-950 md:text-sm"
                value={creditNoteDate}
                onChange={(e) => setCreditNoteDate(e.target.value)}
              />
            </label>
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
                {submitting ? "Saving…" : "Confirm return & reduce stock"}
              </button>
              <Link
                href={`/dashboard/purchases/${purchaseId}`}
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
