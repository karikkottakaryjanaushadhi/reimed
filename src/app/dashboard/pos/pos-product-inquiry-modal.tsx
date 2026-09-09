"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { displayDrugCode } from "@/lib/drug-code";
import { productCategoryLabel } from "@/lib/product-categories";
import { productScheduleLabel } from "@/lib/product-schedules";
import { productTypeLabel } from "@/lib/product-types";
import type { ProductInquiry, ProductInquiryLot } from "@/lib/inventory-product-inquiry";
import { effectiveSaleRatePerPackValues, formatLotExpiry, posStockAvailabilityLabel } from "./pos-line-helpers";

type Props = {
  open: boolean;
  productId: string | null;
  selectedLotId: string;
  availableQty: (lotId: string, onHand: number) => number;
  onClose: () => void;
  onPickLot: (lotId: string) => void;
};

function rupee(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function lotSellable(lot: ProductInquiryLot, avail: number): boolean {
  return !lot.expired && avail > 0;
}

function InquiryFact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

export function PosProductInquiryModal({
  open,
  productId,
  selectedLotId,
  availableQty,
  onClose,
  onPickLot,
}: Props) {
  const titleId = useId();
  const listRef = useRef<HTMLTableSectionElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ProductInquiry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(0);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !productId) {
      setData(null);
      setErr(null);
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);
    void (async () => {
      try {
        const res = await fetch(`/api/inventory/inquiry?productId=${encodeURIComponent(productId)}`, {
          signal: ac.signal,
        });
        const json = (await res.json()) as ProductInquiry & { error?: string };
        if (!res.ok) {
          setErr(json.error ?? "Could not load product");
          return;
        }
        setData(json);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setErr("Could not load product");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [open, productId]);

  const lots = data?.lots ?? [];

  useEffect(() => {
    if (!open || lots.length === 0) {
      setHi(0);
      return;
    }
    const selected = lots.findIndex((l) => l.id === selectedLotId);
    if (selected >= 0) {
      setHi(selected);
      return;
    }
    const firstSell = lots.findIndex((l) => lotSellable(l, availableQty(l.id, l.quantity)));
    setHi(firstSell >= 0 ? firstSell : 0);
  }, [open, lots, selectedLotId, availableQty]);

  useLayoutEffect(() => {
    if (!open || lots.length === 0) return;
    const row = listRef.current?.querySelector(`[data-inquiry-lot="${hi}"]`) as HTMLElement | null;
    row?.scrollIntoView({ block: "nearest" });
  }, [open, hi, lots.length]);

  useEffect(() => {
    if (!open || loading) return;
    panelRef.current?.focus();
  }, [open, loading, data]);

  const highlighted = lots[hi];
  const highlightedAvail = highlighted ? availableQty(highlighted.id, highlighted.quantity) : 0;
  const canPickHighlighted = highlighted ? lotSellable(highlighted, highlightedAvail) : false;

  const stockSummary = useMemo(() => {
    let sell = 0;
    let expired = 0;
    for (const lot of lots) {
      const avail = availableQty(lot.id, lot.quantity);
      if (lot.expired) expired += Math.max(0, lot.quantity);
      else sell += Math.max(0, avail);
    }
    return posStockAvailabilityLabel(sell, expired);
  }, [lots, availableQty]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        onClose();
        return;
      }
      if (ev.key === "ArrowDown") {
        if (lots.length === 0) return;
        ev.preventDefault();
        setHi((h) => Math.min(lots.length - 1, h + 1));
        return;
      }
      if (ev.key === "ArrowUp") {
        if (lots.length === 0) return;
        ev.preventDefault();
        setHi((h) => Math.max(0, h - 1));
        return;
      }
      if (ev.key === "Home") {
        if (lots.length === 0) return;
        ev.preventDefault();
        setHi(0);
        return;
      }
      if (ev.key === "End") {
        if (lots.length === 0) return;
        ev.preventDefault();
        setHi(lots.length - 1);
        return;
      }
      if (ev.key === "Enter") {
        const target = ev.target as HTMLElement | null;
        if (target?.closest("button")) return;
        const lot = lots[hi];
        if (!lot) return;
        const avail = availableQty(lot.id, lot.quantity);
        if (!lotSellable(lot, avail)) return;
        ev.preventDefault();
        onPickLot(lot.id);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, onPickLot, lots, hi, availableQty]);

  if (!open) return null;

  const p = data?.product;
  const drugCode = p ? displayDrugCode(p.sku, p.productCategory) : "";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close product details" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900 sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Product & batch details</p>
            <h3 id={titleId} className="mt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {p?.name ?? (loading ? "Loading…" : "Product")}
            </h3>
            {p?.genericName ? (
              <p className="mt-0.5 truncate text-xs text-zinc-500">{p.genericName}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? <p className="text-sm text-zinc-500">Loading product and batches…</p> : null}
          {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

          {p ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
                <InquiryFact label="Brand" value={p.brand ?? ""} />
                <InquiryFact label="Type" value={productTypeLabel(p.productType)} />
                <InquiryFact label="Category" value={productCategoryLabel(p.productCategory)} />
                <InquiryFact label="Schedule" value={productScheduleLabel(p.productSchedule)} />
                <InquiryFact label="GST" value={`${p.gstPct}%`} />
                <InquiryFact label="Pack" value={String(p.packSize)} />
                <InquiryFact label="HSN" value={p.hsn ?? ""} />
                <InquiryFact label="Drug code" value={drugCode} />
                <InquiryFact label="Reorder min" value={p.reorderMin > 0 ? String(p.reorderMin) : ""} />
              </dl>
              <p className={`mt-3 text-xs font-medium ${stockSummary.tone === "expired" ? "text-red-700 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                {stockSummary.text}
                {lots.length === 0 ? " · No batches at this store" : ` · ${lots.length} batch${lots.length === 1 ? "" : "es"}`}
              </p>
            </>
          ) : null}

          {lots.length > 0 ? (
            <>
              <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
                  <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/80 dark:text-zinc-400">
                    <tr>
                      <th className="px-2 py-2 font-medium">Batch</th>
                      <th className="px-2 py-2 font-medium">Expiry</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 text-right font-medium">Pack</th>
                      <th className="px-2 py-2 text-right font-medium">Rate</th>
                      <th className="px-2 py-2 text-right font-medium">MRP</th>
                      <th className="px-2 py-2 text-right font-medium">Cost</th>
                      <th className="px-2 py-2 font-medium">Supplier</th>
                    </tr>
                  </thead>
                  <tbody ref={listRef}>
                    {lots.map((lot, idx) => {
                      const avail = availableQty(lot.id, lot.quantity);
                      const sellable = lotSellable(lot, avail);
                      const active = idx === hi;
                      return (
                        <tr
                          key={lot.id}
                          data-inquiry-lot={idx}
                          className={`${
                            lot.expired
                              ? "text-red-800 dark:text-red-200"
                              : sellable
                                ? "cursor-pointer text-zinc-800 dark:text-zinc-100"
                                : "text-zinc-500 dark:text-zinc-400"
                          } ${active ? "bg-emerald-100 dark:bg-emerald-900/50" : "odd:bg-white even:bg-zinc-50/60 dark:odd:bg-zinc-900 dark:even:bg-zinc-800/40"}`}
                          onMouseEnter={() => setHi(idx)}
                          onClick={() => {
                            if (sellable) onPickLot(lot.id);
                          }}
                        >
                          <td className="px-2 py-2 font-mono">{lot.batchNo}</td>
                          <td className="whitespace-nowrap px-2 py-2">
                            {lot.expired ? `Expired ${formatLotExpiry(lot.expiryDate)}` : formatLotExpiry(lot.expiryDate)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{avail}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{lot.packSize}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {rupee(effectiveSaleRatePerPackValues(lot.mrp, lot.saleRate))}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{rupee(lot.mrp)}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{rupee(lot.costPrice)}</td>
                          <td className="max-w-[8rem] truncate px-2 py-2" title={lot.supplierName ?? undefined}>
                            {lot.supplierName ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                {canPickHighlighted
                  ? "Enter or click a batch to bill from it. Esc or F3 closes."
                  : "Arrow keys move between batches. Esc or F3 closes."}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
