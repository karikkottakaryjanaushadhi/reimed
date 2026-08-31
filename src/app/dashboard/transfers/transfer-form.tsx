"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatAppDateShort } from "@/lib/app-timezone";
import { isInventoryLotExpiryIsoExpired } from "@/lib/inventory-lot-expiry";

type DestStore = { id: string; name: string };

type LotOption = {
  id: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  expired: boolean;
};

type TransferLine = {
  sourceLotId: string;
  productId: string;
  productName: string;
  batchNo: string;
  expiryDate: string;
  availableQty: number;
  quantity: number;
};

type ProductHit = { id: string; name: string };

export function TransferForm({
  fromStoreName,
  destinationStores,
}: {
  fromStoreName: string;
  destinationStores: DestStore[];
}) {
  const router = useRouter();
  const [toStoreId, setToStoreId] = useState(destinationStores[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductHit | null>(null);
  const [lots, setLots] = useState<LotOption[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [pickLotId, setPickLotId] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usedLotIds = useMemo(() => new Set(lines.map((l) => l.sourceLotId)), [lines]);

  useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 2) {
      setProductHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setProductLoading(true);
        try {
          const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&limit=12`);
          const data = (await res.json().catch(() => null)) as { products?: ProductHit[] } | null;
          if (!cancelled) setProductHits(data?.products ?? []);
        } finally {
          if (!cancelled) setProductLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [productQuery]);

  const loadLots = useCallback(async (productId: string) => {
    setLotsLoading(true);
    try {
      const res = await fetch(
        `/api/inventory/lots?productId=${encodeURIComponent(productId)}&inStockOnly=1`,
      );
      const data = (await res.json().catch(() => null)) as { lots?: LotOption[] } | null;
      const available = (data?.lots ?? []).filter((l) => !l.expired && l.quantity > 0);
      setLots(available);
      setPickLotId(available[0]?.id ?? "");
    } finally {
      setLotsLoading(false);
    }
  }, []);

  function selectProduct(p: ProductHit) {
    setSelectedProduct(p);
    setProductQuery(p.name);
    setProductHits([]);
    void loadLots(p.id);
  }

  function clearProductPicker() {
    setSelectedProduct(null);
    setProductQuery("");
    setLots([]);
    setPickLotId("");
    setPickQty("1");
  }

  function addLine() {
    if (!selectedProduct || !pickLotId) return;
    const lot = lots.find((l) => l.id === pickLotId);
    if (!lot || lot.expired || isInventoryLotExpiryIsoExpired(lot.expiryDate)) return;
    if (usedLotIds.has(lot.id)) {
      setSubmitError("This batch is already on the transfer");
      return;
    }
    const qty = parseInt(pickQty, 10);
    if (!Number.isFinite(qty) || qty < 1 || qty > lot.quantity) {
      setSubmitError(`Enter quantity between 1 and ${lot.quantity}`);
      return;
    }
    setSubmitError(null);
    setLines((prev) => [
      ...prev,
      {
        sourceLotId: lot.id,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        batchNo: lot.batchNo,
        expiryDate: lot.expiryDate,
        availableQty: lot.quantity,
        quantity: qty,
      },
    ]);
    clearProductPicker();
  }

  function removeLine(sourceLotId: string) {
    setLines((prev) => prev.filter((l) => l.sourceLotId !== sourceLotId));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!toStoreId) {
      setSubmitError("Choose a destination store");
      return;
    }
    if (lines.length === 0) {
      setSubmitError("Add at least one batch line");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStoreId,
          notes: notes.trim() || undefined,
          lines: lines.map((l) => ({ sourceLotId: l.sourceLotId, quantity: l.quantity })),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        transfer?: { id: string };
        error?: string;
      } | null;
      if (!res.ok) {
        setSubmitError(data?.error ?? "Transfer failed");
        return;
      }
      if (data?.transfer?.id) {
        router.push(`/dashboard/transfers/${data.transfer.id}`);
        router.refresh();
      }
    } catch {
      setSubmitError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  const pickLot = lots.find((l) => l.id === pickLotId);

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">From</label>
            <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{fromStoreName}</p>
          </div>
          <div>
            <label htmlFor="toStoreId" className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
              To store
            </label>
            <select
              id="toStoreId"
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              required
            >
              {destinationStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="notes" className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Notes (optional)
          </label>
          <input
            id="notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="Reason or reference"
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add batches</h2>
        <p className="mt-1 text-xs text-zinc-500">Search a product, pick a non-expired batch, then add to the transfer.</p>

        <div className="relative mt-4">
          <label htmlFor="productQuery" className="block text-xs font-medium text-zinc-500">
            Product
          </label>
          <input
            id="productQuery"
            type="search"
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value);
              if (selectedProduct && e.target.value !== selectedProduct.name) {
                setSelectedProduct(null);
                setLots([]);
              }
            }}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            placeholder="Type product name…"
            autoComplete="off"
          />
          {productHits.length > 0 && !selectedProduct ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {productHits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    onClick={() => selectProduct(p)}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {productLoading ? <p className="mt-1 text-xs text-zinc-500">Searching…</p> : null}
        </div>

        {selectedProduct ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div>
              <label htmlFor="pickLotId" className="block text-xs font-medium text-zinc-500">
                Batch
              </label>
              <select
                id="pickLotId"
                value={pickLotId}
                onChange={(e) => setPickLotId(e.target.value)}
                disabled={lotsLoading || lots.length === 0}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              >
                {lots.length === 0 ? <option value="">No sellable stock</option> : null}
                {lots.map((l) => (
                  <option key={l.id} value={l.id} disabled={usedLotIds.has(l.id)}>
                    {l.batchNo} · exp {formatAppDateShort(l.expiryDate)} · {l.quantity} avail
                    {usedLotIds.has(l.id) ? " (added)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="pickQty" className="block text-xs font-medium text-zinc-500">
                Qty
              </label>
              <input
                id="pickQty"
                type="number"
                min={1}
                max={pickLot?.quantity ?? 1}
                value={pickQty}
                onChange={(e) => setPickQty(e.target.value)}
                className="mt-1 w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
              />
            </div>
            <button
              type="button"
              onClick={addLine}
              disabled={!pickLot || usedLotIds.has(pickLot.id)}
              className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue/90 disabled:opacity-50"
            >
              Add line
            </button>
          </div>
        ) : null}
      </div>

      {lines.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Batch</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.sourceLotId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3">{l.productName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{l.batchNo}</td>
                  <td className="px-4 py-3">{formatAppDateShort(l.expiryDate)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.quantity}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(l.sourceLotId)}
                      className="text-sm text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No lines yet — add batches above.</p>
      )}

      {submitError ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting || lines.length === 0 || !toStoreId}
          className="rounded-lg bg-brand-green px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Transferring…" : "Complete transfer"}
        </button>
        <Link
          href="/dashboard/transfers"
          className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
