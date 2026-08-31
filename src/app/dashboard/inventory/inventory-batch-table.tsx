"use client";

import Link from "next/link";
import { differenceInCalendarDays, isValid, parseISO, startOfDay } from "date-fns";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ExpiryDateInput } from "@/components/expiry-date-input";
import { NumericTableInput } from "@/components/numeric-table-input";
import { expiryTintFromDays } from "@/lib/inventory-expiry-filter";
import {
  round2,
  saleDiscountFromMrpRate,
  saleRateFromMrpDiscountPct,
} from "@/lib/inventory-lot-pricing";
import { inventoryLotMarginPercent } from "@/lib/inventory-lot-margin";
import { StockBrandSelect } from "./stock-brand-select";
import { StockCategorySelect } from "./stock-category-select";
import { StockGstSelect } from "./stock-gst-select";

export type BatchRow = {
  id: string;
  productId: string;
  productName: string;
  brandId: string | null;
  brandName: string | null;
  productCategory: string | null;
  gstPct: number;
  packSize: number;
  supplierName: string | null;
  batchNo: string;
  expiryDate: string;
  days: number;
  quantity: number;
  reorderMin: number;
  costPrice: number;
  mrp: number;
  saleRate: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  stockCorrected: boolean;
  expiryTint: "expired" | "soon" | "ok";
};

/** Precomputed hrefs from the server page (sort toggles asc/desc per column). */
export type BatchTableSortHrefs = {
  productName: string;
  brand: string;
  productCategory: string;
  gstPct: string;
  packSize: string;
  supplier: string;
  batchNo: string;
  expiryDate: string;
  days: string;
  quantity: string;
  reorderMin: string;
  costPrice: string;
  mrp: string;
  saleRate: string;
  salesDiscountPct: string;
  salesDiscountRs: string;
  marginPercent: string;
  stockCorrected: string;
};

function SortHeaderLink({
  href,
  label,
  active,
  dir,
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  className?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-zinc-600 hover:text-brand-blue-light dark:text-zinc-300 dark:hover:text-brand-blue-light ${className ?? ""}`}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
    </Link>
  );
}

const cellProduct =
  "w-full min-w-0 truncate rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-950";
const cellIn =
  "w-full min-w-0 rounded border border-zinc-300 bg-white px-1 py-1 text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950";
const cellInMoney = `${cellIn} max-w-[3.5rem]`;

function rowTintClasses(corrected: boolean, tint: BatchRow["expiryTint"]) {
  if (corrected) {
    return "bg-sky-50 ring-1 ring-inset ring-sky-300/60 dark:bg-sky-950/40 dark:ring-sky-500/45";
  }
  if (tint === "expired") return "bg-red-50 dark:bg-red-950/30";
  if (tint === "soon") return "bg-amber-50 dark:bg-amber-950/20";
  return "";
}


export function InventoryBatchTable({
  rows,
  canAdjust,
  brands,
  canEditProductMeta,
  sortHeaders,
}: {
  rows: BatchRow[];
  canAdjust: boolean;
  brands: { id: string; name: string }[];
  canEditProductMeta: boolean;
  sortHeaders?: { activeSort: string; dir: "asc" | "desc"; hrefs: BatchTableSortHrefs };
}) {
  const router = useRouter();
  const sh = sortHeaders;
  const d = sh?.dir ?? "asc";

  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <BatchRowCells
            key={row.id}
            row={row}
            canAdjust={canAdjust}
            brands={brands}
            canEditProductMeta={canEditProductMeta}
            layout="card"
            onSaved={() => router.refresh()}
          />
        ))}
        {rows.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            No batches match these filters.
          </p>
        ) : null}
      </div>

      <div className="hidden overflow-y-visible rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[5.5rem]" />
          <col className="w-[5rem]" />
          <col className="w-[3rem]" />
          <col className="w-[2.25rem]" />
          <col className="w-[9rem]" />
          <col className="w-[5.5rem]" />
          <col className="w-[7.5rem]" />
          <col className="w-[2rem]" />
          <col className="w-[3.25rem]" />
          <col className="w-[3.75rem]" />
          <col className="w-[3.5rem]" />
          <col className="w-[3.5rem]" />
          <col className="w-[3.25rem]" />
          <col className="w-[3.25rem]" />
          <col className="w-[2.25rem]" />
          <col className="w-[2.5rem]" />
          <col className="w-[2.75rem]" />
          <col className="w-[3rem]" />
          {canAdjust ? <col className="w-[2.25rem]" /> : null}
        </colgroup>
        <thead className="bg-zinc-50 text-[10px] font-medium uppercase leading-tight tracking-wide text-zinc-500 dark:bg-zinc-800">
          <tr>
            <th className="min-w-0 px-2 py-2">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.productName}
                  label="Product"
                  active={sh.activeSort === "productName"}
                  dir={d}
                />
              ) : (
                "Product"
              )}
            </th>
            <th className="min-w-0 px-1 py-2">
              {sh ? (
                <SortHeaderLink href={sh.hrefs.brand} label="Brand" active={sh.activeSort === "brand"} dir={d} />
              ) : (
                "Brand"
              )}
            </th>
            <th className="min-w-0 px-1 py-2">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.productCategory}
                  label="Category"
                  active={sh.activeSort === "productCategory"}
                  dir={d}
                />
              ) : (
                "Category"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-center">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.gstPct}
                  label="GST"
                  active={sh.activeSort === "gstPct"}
                  dir={d}
                  className="justify-center"
                />
              ) : (
                "GST"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-center normal-case" title="Units per pack (POS billing)">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.packSize}
                  label="Pack"
                  active={sh.activeSort === "packSize"}
                  dir={d}
                  className="justify-center"
                />
              ) : (
                "Pack"
              )}
            </th>
            <th className="min-w-0 px-1 py-2">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.supplier}
                  label="Supplier"
                  active={sh.activeSort === "supplier"}
                  dir={d}
                />
              ) : (
                "Supplier"
              )}
            </th>
            <th className="min-w-0 px-1 py-2">
              {sh ? (
                <SortHeaderLink href={sh.hrefs.batchNo} label="Batch" active={sh.activeSort === "batchNo"} dir={d} />
              ) : (
                "Batch"
              )}
            </th>
            <th className="min-w-0 px-1 py-2">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.expiryDate}
                  label="Expiry"
                  active={sh.activeSort === "expiryDate"}
                  dir={d}
                />
              ) : (
                "Expiry"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.days}
                  label="Days"
                  active={sh.activeSort === "days"}
                  dir={d}
                  className="justify-end"
                />
              ) : (
                "Days"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.quantity}
                  label="Qty"
                  active={sh.activeSort === "quantity"}
                  dir={d}
                  className="w-full justify-end"
                />
              ) : (
                "Qty"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.costPrice}
                  label="Cost"
                  active={sh.activeSort === "costPrice"}
                  dir={d}
                  className="w-full justify-end"
                />
              ) : (
                "Cost"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.mrp}
                  label="MRP"
                  active={sh.activeSort === "mrp"}
                  dir={d}
                  className="w-full justify-end"
                />
              ) : (
                "MRP"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right" title="Selling rate per pack (vs MRP)">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.saleRate}
                  label="Rate"
                  active={sh.activeSort === "saleRate"}
                  dir={d}
                  className="w-full justify-end"
                />
              ) : (
                "Rate"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right normal-case" title="Sale discount % (vs MRP)">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.salesDiscountPct}
                  label="Dc%"
                  active={sh.activeSort === "salesDiscountPct"}
                  dir={d}
                  className="w-full justify-end normal-case"
                />
              ) : (
                "Dc%"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right normal-case" title="Sale discount ₹ (vs MRP)">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.salesDiscountRs}
                  label="DC₹"
                  active={sh.activeSort === "salesDiscountRs"}
                  dir={d}
                  className="w-full justify-end normal-case"
                />
              ) : (
                "DC₹"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-right" title="Product reorder minimum">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.reorderMin}
                  label="RO"
                  active={sh.activeSort === "reorderMin"}
                  dir={d}
                  className="w-full justify-end"
                />
              ) : (
                "RO"
              )}
            </th>
            <th
              className="min-w-0 px-0.5 py-2 text-right normal-case"
              title="Margin % vs net revenue at current rate (1 pack)"
            >
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.marginPercent}
                  label="Mrg"
                  active={sh.activeSort === "marginPercent"}
                  dir={d}
                  className="w-full justify-end normal-case"
                />
              ) : (
                "Mrg"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-center">
              {sh ? (
                <SortHeaderLink
                  href={sh.hrefs.stockCorrected}
                  label="OK"
                  active={sh.activeSort === "stockCorrected"}
                  dir={d}
                  className="justify-center"
                />
              ) : (
                "OK"
              )}
            </th>
            <th className="min-w-0 px-0.5 py-2 text-center">Save</th>
            {canAdjust ? (
              <th className="min-w-0 px-0.5 py-2 text-center">
                <span className="sr-only">Delete</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <BatchRowCells
              key={[
                row.id,
                row.quantity,
                row.batchNo,
                row.expiryDate,
                row.mrp,
                row.packSize,
                row.reorderMin,
                row.saleRate,
                row.costPrice,
                row.productName,
                row.brandId ?? "",
                row.productCategory ?? "",
                String(row.gstPct),
                row.supplierName,
                row.salesDiscountPct,
                row.salesDiscountRs,
                row.stockCorrected,
              ].join("|")}
              row={row}
              canAdjust={canAdjust}
              brands={brands}
              canEditProductMeta={canEditProductMeta}
              onSaved={() => router.refresh()}
            />
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function BatchRowCells({
  row,
  canAdjust,
  brands,
  canEditProductMeta,
  layout = "table",
  onSaved,
}: {
  row: BatchRow;
  canAdjust: boolean;
  brands: { id: string; name: string }[];
  canEditProductMeta: boolean;
  layout?: "table" | "card";
  onSaved: () => void;
}) {
  const [productName, setProductName] = useState(row.productName);
  const [batchNo, setBatchNo] = useState(row.batchNo);
  const [expiryYmd, setExpiryYmd] = useState(row.expiryDate.slice(0, 10));
  const [qty, setQty] = useState(String(row.quantity));
  const [cost, setCost] = useState(String(row.costPrice));
  const [mrp, setMrp] = useState(String(row.mrp));
  const [rateStr, setRateStr] = useState(String(row.saleRate));
  const [salePct, setSalePct] = useState(String(row.salesDiscountPct));
  const [saleRs, setSaleRs] = useState(String(row.salesDiscountRs));
  const [packSize, setPackSize] = useState(String(row.packSize));
  const [reorderMin, setReorderMin] = useState(row.reorderMin);
  const [corrected, setCorrected] = useState(row.stockCorrected);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const expiryAtNoon = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryYmd)) return null;
    const d = parseISO(`${expiryYmd}T12:00:00`);
    return isValid(d) ? d : null;
  }, [expiryYmd]);

  const daysLive = useMemo(() => {
    if (!expiryAtNoon) return row.days;
    return differenceInCalendarDays(expiryAtNoon, today);
  }, [expiryAtNoon, today, row.days]);

  const tintLive = expiryTintFromDays(daysLive);
  const tintClass = rowTintClasses(corrected, tintLive);

  const marginPctLive = useMemo(() => {
    const costN = Number.parseFloat(cost);
    const mrpN = Number.parseFloat(mrp);
    const rateN = Number.parseFloat(rateStr);
    const packN = Number.parseInt(packSize, 10);
    return inventoryLotMarginPercent(costN, mrpN, rateN, packN, row.gstPct);
  }, [cost, mrp, rateStr, packSize, row.gstPct]);

  function applyDiscountFromMrpAndRate(mrpVal: string, rateVal: string) {
    const m = Number.parseFloat(mrpVal);
    const r = Number.parseFloat(rateVal);
    const { pct, rs } = saleDiscountFromMrpRate(m, r);
    setSalePct(String(pct));
    setSaleRs(String(rs));
  }

  async function saveRow() {
    const n = Number.parseInt(qty, 10);
    if (!Number.isFinite(n) || n < 0) {
      setErr("Invalid qty");
      return;
    }
    const costN = Number.parseFloat(cost);
    const mrpN = Number.parseFloat(mrp);
    const rateN = Number.parseFloat(rateStr);
    if (!Number.isFinite(costN) || costN < 0 || !Number.isFinite(mrpN) || mrpN < 0) {
      setErr("Invalid cost/MRP");
      return;
    }
    if (!Number.isFinite(rateN) || rateN < 0) {
      setErr("Invalid rate");
      return;
    }
    const pctN = Number.parseFloat(salePct);
    const rsN = Number.parseFloat(saleRs);
    if (!Number.isFinite(pctN) || pctN < 0 || pctN > 100 || !Number.isFinite(rsN) || rsN < 0) {
      setErr("Invalid sale discount");
      return;
    }
    const packN = Number.parseInt(packSize, 10);
    if (!Number.isFinite(packN) || packN < 1) {
      setErr("Invalid pack");
      return;
    }
    if (!Number.isFinite(reorderMin) || reorderMin < 0) {
      setErr("Invalid RO");
      return;
    }
    const bn = batchNo.trim();
    if (!bn) {
      setErr("Batch required");
      return;
    }
    const pn = productName.trim();
    if (!pn) {
      setErr("Product name required");
      return;
    }
    setBusy(true);
    setErr(null);
    setDeleteErr(null);
    try {
      const res = await fetch(`/api/inventory/lots/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: pn,
          packSize: packN,
          batchNo: bn,
          expiryDate: expiryYmd,
          quantity: n,
          costPrice: costN,
          mrp: mrpN,
          saleRate: rateN,
          salesDiscountPct: pctN,
          salesDiscountRs: rsN,
          reorderMin,
          stockCorrected: corrected,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Save failed");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow() {
    const ok = window.confirm(
      `Remove this batch line?\n\n${row.productName}\nBatch ${row.batchNo}\n\nThis cannot be undone. Batches used on past bills cannot be deleted.`,
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    setDeleteErr(null);
    try {
      const res = await fetch(`/api/inventory/lots/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteErr(d.error ?? "Delete failed");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function toggleCorrected(next: boolean) {
    setBusy(true);
    setErr(null);
    setDeleteErr(null);
    try {
      const res = await fetch(`/api/inventory/lots/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCorrected: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Update failed");
        return;
      }
      setCorrected(next);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  if (layout === "card") {
    return (
      <article className={`rounded-xl border border-zinc-200 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${tintClass}`}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {row.supplierName ?? "No supplier"} · {daysLive}d to expiry
          </p>
          <label className="inline-flex shrink-0 items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={corrected}
              disabled={busy}
              className="rounded border-zinc-400 accent-sky-500"
              onChange={(e) => void toggleCorrected(e.target.checked)}
            />
            Counted OK
          </label>
        </div>
        <div className="grid gap-3">
          <label className="block text-xs text-zinc-500">
            Product
            <input
              className={`${cellProduct} mt-1 text-base`}
              value={productName}
              disabled={busy}
              title={productName.trim() || row.productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="block text-xs text-zinc-500">
              Brand
              <div className="mt-1">
                <StockBrandSelect productId={row.productId} brandId={row.brandId} brandName={row.brandName} brands={brands} canEdit={canEditProductMeta} />
              </div>
            </label>
            <label className="block text-xs text-zinc-500">
              Category
              <div className="mt-1">
                <StockCategorySelect productId={row.productId} productCategory={row.productCategory} canEdit={canEditProductMeta} />
              </div>
            </label>
            <label className="block text-xs text-zinc-500">
              GST %
              <div className="mt-1">
                <StockGstSelect productId={row.productId} gstPct={row.gstPct} canEdit={canEditProductMeta} />
              </div>
            </label>
            <label className="block text-xs text-zinc-500">
              Pack
              <input
                type="number"
                min={1}
                step={1}
                className={`${cellIn} mt-1 w-full text-base text-center tabular-nums`}
                value={packSize}
                disabled={busy}
                title="Units per pack"
                onChange={(e) => setPackSize(e.target.value)}
                onWheel={(e) => e.preventDefault()}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-500">
              Batch
              <input className={`${cellIn} mt-1 w-full font-mono text-base`} value={batchNo} disabled={busy} onChange={(e) => setBatchNo(e.target.value)} />
            </label>
            <label className="block text-xs text-zinc-500">
              Expiry
              <ExpiryDateInput className={`${cellIn} mt-1 text-base`} wrapperClassName="mt-1 w-full" value={expiryYmd} disabled={busy} onChange={(e) => setExpiryYmd(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block text-xs text-zinc-500">
              Qty
              <input type="number" min={0} className={`${cellIn} mt-1 w-full text-base`} value={qty} disabled={busy} onChange={(e) => { setQty(e.target.value); setErr(null); }} />
            </label>
            <label className="block text-xs text-zinc-500">
              Cost
              <input type="number" min={0} step={0.01} className={`${cellIn} mt-1 w-full text-base`} value={cost} disabled={busy} onChange={(e) => setCost(e.target.value)} />
            </label>
            <label className="block text-xs text-zinc-500">
              MRP
              <input type="number" min={0} step={0.01} className={`${cellIn} mt-1 w-full text-base`} value={mrp} disabled={busy} onChange={(e) => { const v = e.target.value; setMrp(v); applyDiscountFromMrpAndRate(v, rateStr); }} />
            </label>
            <label className="block text-xs text-zinc-500">
              Rate
              <input type="number" min={0} step={0.01} className={`${cellIn} mt-1 w-full text-base`} value={rateStr} disabled={busy} onChange={(e) => { const v = e.target.value; setRateStr(v); applyDiscountFromMrpAndRate(mrp, v); }} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-500">
              S.Disc %
              <input type="number" min={0} max={100} step={0.01} className={`${cellIn} mt-1 w-full text-base`} value={salePct} disabled={busy} onChange={(e) => { const v = e.target.value; setSalePct(v); const m = Number.parseFloat(mrp); const pct = Number.parseFloat(v); if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(pct)) return; const newR = saleRateFromMrpDiscountPct(m, pct); setRateStr(String(newR)); setSaleRs(String(round2(m - newR))); }} />
            </label>
            <label className="block text-xs text-zinc-500">
              Reorder min
              <NumericTableInput
                min={0}
                step={1}
                integer
                className={`${cellIn} mt-1 w-full text-base`}
                value={reorderMin}
                disabled={busy}
                onChange={setReorderMin}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Mrg%
              <div className="mt-1 rounded border border-transparent py-2 text-right text-base tabular-nums text-zinc-800 dark:text-zinc-200">
                {marginPctLive != null ? `${marginPctLive.toFixed(1)}%` : "—"}
              </div>
            </label>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="touch-manipulation rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900" onClick={() => void saveRow()}>
            Save
          </button>
          {canAdjust ? (
            <button type="button" disabled={busy} className="touch-manipulation rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-400" onClick={() => void deleteRow()}>
              Delete
            </button>
          ) : null}
        </div>
        {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
        {deleteErr ? <p className="mt-2 text-xs text-red-500">{deleteErr}</p> : null}
      </article>
    );
  }

  return (
    <tr className={`border-t border-zinc-100 dark:border-zinc-800 ${tintClass}`}>
      <td className="min-w-0 px-2 py-1.5 align-middle">
        <input
          className={cellProduct}
          value={productName}
          disabled={busy}
          title={productName.trim() || row.productName}
          onChange={(e) => setProductName(e.target.value)}
        />
      </td>
      <td className="min-w-0 px-1 py-1.5 align-top">
        <StockBrandSelect
          productId={row.productId}
          brandId={row.brandId}
          brandName={row.brandName}
          brands={brands}
          canEdit={canEditProductMeta}
          compact
        />
      </td>
      <td className="min-w-0 px-1 py-1.5 align-top">
        <StockCategorySelect
          productId={row.productId}
          productCategory={row.productCategory}
          canEdit={canEditProductMeta}
          compact
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 align-top">
        <StockGstSelect productId={row.productId} gstPct={row.gstPct} canEdit={canEditProductMeta} compact />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 align-middle">
        <input
          type="number"
          min={1}
          step={1}
          className={`${cellIn} w-full min-w-0 px-0.5 text-center text-[11px] tabular-nums`}
          value={packSize}
          disabled={busy}
          title="Units per pack (POS)"
          onChange={(e) => setPackSize(e.target.value)}
          onWheel={(e) => e.preventDefault()}
        />
      </td>
      <td
        className="min-w-0 truncate px-1 py-1.5 align-middle text-[11px] text-zinc-600 dark:text-zinc-400"
        title={row.supplierName ?? ""}
      >
        {row.supplierName ?? "—"}
      </td>
      <td className="min-w-0 px-1 py-1.5 align-middle">
        <input className={`${cellIn} font-mono`} value={batchNo} disabled={busy} onChange={(e) => setBatchNo(e.target.value)} />
      </td>
      <td className="min-w-0 px-1 py-1.5 align-middle">
        <ExpiryDateInput
          className={cellIn}
          wrapperClassName="min-w-0 w-full"
          value={expiryYmd}
          disabled={busy}
          onChange={(e) => setExpiryYmd(e.target.value)}
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400">
        {daysLive}
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right align-middle">
        <input
          type="number"
          min={0}
          className={`${cellInMoney} text-right`}
          value={qty}
          disabled={busy}
          onChange={(e) => {
            setQty(e.target.value);
            setErr(null);
          }}
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right align-middle">
        <input
          type="number"
          min={0}
          step="0.01"
          className={`${cellInMoney} text-right`}
          value={cost}
          disabled={busy}
          onChange={(e) => setCost(e.target.value)}
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right align-middle">
        <input
          type="number"
          min={0}
          step="0.01"
          className={`${cellInMoney} text-right`}
          value={mrp}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            setMrp(v);
            applyDiscountFromMrpAndRate(v, rateStr);
          }}
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right align-middle">
        <input
          type="number"
          min={0}
          step="0.01"
          className={`${cellInMoney} text-right`}
          value={rateStr}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            setRateStr(v);
            applyDiscountFromMrpAndRate(mrp, v);
          }}
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right align-middle">
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          className={`${cellInMoney} text-right`}
          value={salePct}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            setSalePct(v);
            const m = Number.parseFloat(mrp);
            const pct = Number.parseFloat(v);
            if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(pct)) return;
            const newR = saleRateFromMrpDiscountPct(m, pct);
            setRateStr(String(newR));
            setSaleRs(String(round2(m - newR)));
          }}
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right align-middle">
        <input
          type="number"
          min={0}
          step="0.01"
          className={`${cellInMoney} text-right`}
          value={saleRs}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            setSaleRs(v);
            const m = Number.parseFloat(mrp);
            let rs = Number.parseFloat(v);
            if (!Number.isFinite(m) || m <= 0 || !Number.isFinite(rs) || rs < 0) return;
            if (rs > m) rs = m;
            const newR = round2(m - rs);
            setRateStr(String(newR));
            setSalePct(String(m > 0 ? round2((rs / m) * 100) : 0));
          }}
        />
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-right align-middle">
        <NumericTableInput
          min={0}
          step={1}
          integer
          className={`${cellInMoney} text-right ${
            Number.parseInt(qty, 10) <= reorderMin
              ? "font-semibold text-amber-700 dark:text-amber-400"
              : ""
          }`}
          value={reorderMin}
          disabled={busy}
          title="Product reorder minimum"
          onChange={setReorderMin}
        />
      </td>
      <td
        className="min-w-0 px-0.5 py-1.5 text-right align-middle text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400"
        title="Margin % vs net revenue at current rate (1 pack)"
      >
        {marginPctLive != null ? `${marginPctLive.toFixed(1)}%` : "—"}
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-center align-middle">
        <label className="inline-flex cursor-pointer items-center gap-0.5 text-[11px]">
          <input
            type="checkbox"
            checked={corrected}
            disabled={busy}
            className="rounded border-zinc-400 accent-sky-500 focus:ring-sky-500"
            onChange={(e) => void toggleCorrected(e.target.checked)}
          />
          <span className="text-zinc-600 dark:text-zinc-400">OK</span>
        </label>
      </td>
      <td className="min-w-0 px-0.5 py-1.5 text-center align-middle">
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[11px] font-medium text-zinc-900 hover:bg-zinc-300 disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600"
            onClick={() => void saveRow()}
          >
            Save
          </button>
          {err && <span className="max-w-[5.5rem] text-[9px] leading-tight text-red-500">{err}</span>}
        </div>
      </td>
      {canAdjust ? (
        <td className="min-w-0 px-0.5 py-1.5 text-center align-middle">
          <div className="flex flex-col items-center gap-0.5">
            <button
              type="button"
              disabled={busy}
              title="Delete this batch line"
              aria-label="Delete batch"
              className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white p-1 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={() => void deleteRow()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006.5 3.75v.443c-.795.077-1.584.176-2.365.315a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.502l.841-10.52.149.023a.75.75 0 00.23-1.482A41.5 41.5 0 0014.25 4.193V3.75A2.75 2.75 0 0011.5 1h-2.75zM8 3.75A1.25 1.25 0 019.25 2.5h1.5A1.25 1.25 0 0112 3.75v.243a41.5 41.5 0 00-4 0V3.75zM5.5 5.5l.721 9.022a1.25 1.25 0 001.242 1.151h4.074a1.25 1.25 0 001.242-1.15L14.5 5.5h-9z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {deleteErr && <span className="max-w-[4.5rem] text-[9px] leading-tight text-red-500">{deleteErr}</span>}
          </div>
        </td>
      ) : null}
    </tr>
  );
}
