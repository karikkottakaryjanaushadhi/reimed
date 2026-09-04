"use client";

import type { ReactNode } from "react";

import { ExpiryDateInput } from "@/components/expiry-date-input";
import { NumericTableInput } from "@/components/numeric-table-input";
import {
  patchPurchaseLinePack,
  purchaseLineCostGross,
  purchaseLineFreeQtyFromStrips,
  purchaseLineFreeStripQty,
  purchaseLineMarginPercent,
  purchaseLineQuantityFromStrips,
  purchaseLineSaleRatePerPack,
  purchaseLineStripQty,
  resyncPurchaseLineDiscountPatches,
  syncPurchaseDiscountFromPct,
  syncPurchaseDiscountFromRs,
  syncSalesDiscountFromPct,
  syncSalesDiscountFromRate,
  syncSalesDiscountFromRs,
  syncSchemeDiscountFromPct,
  syncSchemeDiscountFromRs,
} from "@/lib/purchase-line";
import { PurchaseGstSelect } from "./purchase-gst-select";

/** Prefer the on-screen anchor when both mobile and desktop search fields exist. */
export function preferVisibleAnchor(
  primary: HTMLElement | null,
  secondary: HTMLElement | null,
): HTMLElement | null {
  if (primary && primary.getClientRects().length > 0) return primary;
  if (secondary && secondary.getClientRects().length > 0) return secondary;
  return primary ?? secondary;
}

/** Compact touch inputs for purchase mobile cards. */
export const PURCHASE_MOBILE_INPUT_CLASS =
  "mt-0.5 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-base tabular-nums touch-manipulation dark:border-zinc-600 dark:bg-zinc-950";

export const PURCHASE_MOBILE_TEXT_INPUT_CLASS =
  "mt-0.5 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-base touch-manipulation dark:border-zinc-600 dark:bg-zinc-950";

/** Shared numeric shape for create + edit purchase lines. */
export type PurchaseLineMobileModel = {
  pack: number;
  quantity: number;
  freeQty: number;
  costPrice: number;
  mrp: number;
  gstPct: number;
  schemeDiscountPct: number;
  schemeDiscountRs: number;
  purchaseDiscountPct: number;
  purchaseDiscountRs: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  batchNo: string;
};

function MobileField({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className}`} title={hint}>
      <span className="text-[11px] font-medium leading-tight text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export type PurchaseLineMobileCardProps = {
  line: PurchaseLineMobileModel;
  /** ISO date (YYYY-MM-DD) for expiry. */
  expiryYmd: string;
  onExpiryChange: (ymd: string) => void;
  /** Apply a patch (from sync helpers or simple field updates). */
  onPatch: (patch: Partial<PurchaseLineMobileModel>) => void;
  disabled?: boolean;
  /** Draft / add row styling. */
  isDraft?: boolean;
  /** Serial number for committed items. */
  index?: number;
  /** Trade units already returned (view purchase). */
  returnedQty?: number;
  /** Product header — name, search, badges. */
  product: ReactNode;
  /** Remove / Add button. */
  action?: ReactNode;
  className?: string;
};

export function PurchaseLineMobileCard({
  line,
  expiryYmd,
  onExpiryChange,
  onPatch,
  disabled = false,
  isDraft = false,
  index,
  returnedQty = 0,
  product,
  action,
  className = "",
}: PurchaseLineMobileCardProps) {
  const marginPct = purchaseLineMarginPercent(line);
  const itemSum = purchaseLineCostGross(line);
  const locked = disabled;

  return (
    <article
      className={`rounded-xl p-3 shadow-sm ${
        isDraft
          ? "border-2 border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/20"
          : "border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
      } ${className}`}
    >
      <div className="space-y-1.5">
        {(index != null || isDraft || (!isDraft && action)) && (
          <div className="flex items-center justify-between gap-2">
            {index != null ? (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Item {index}
              </p>
            ) : isDraft ? (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Add item
              </p>
            ) : (
              <span />
            )}
            {!isDraft && action ? <div className="shrink-0">{action}</div> : null}
          </div>
        )}
        {product}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
        <MobileField label="Pack" hint="Units per pack (e.g. 10 for a strip)">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={1}
            step={1}
            integer
            fallback={1}
            emptyWhenZero={false}
            disabled={locked}
            value={line.pack}
            onChange={(n) => onPatch(patchPurchaseLinePack(line, Math.max(1, Math.floor(n))))}
          />
        </MobileField>
        <MobileField label="Batch">
          <input
            className={PURCHASE_MOBILE_TEXT_INPUT_CLASS}
            disabled={locked}
            value={line.batchNo}
            onChange={(e) => onPatch({ batchNo: e.target.value })}
            placeholder="Batch no."
          />
        </MobileField>
        <MobileField label="Expiry" className="col-span-2" hint="Expiry month / year">
          <ExpiryDateInput
            className={PURCHASE_MOBILE_TEXT_INPUT_CLASS}
            wrapperClassName="min-w-0 w-full"
            disabled={locked}
            value={expiryYmd}
            onChange={(e) => onExpiryChange(e.target.value)}
          />
        </MobileField>
        <MobileField label="Qty (strips)" hint="Number of strips / packs received">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={1}
            step={1}
            integer
            fallback={1}
            emptyWhenZero={false}
            disabled={locked}
            value={purchaseLineStripQty(line)}
            onChange={(n) =>
              onPatch(
                resyncPurchaseLineDiscountPatches(line, {
                  quantity: purchaseLineQuantityFromStrips(n, line.pack),
                }),
              )
            }
          />
        </MobileField>
        <MobileField label="Free (strips)" hint="Free scheme strips, same unit as Qty">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            step={1}
            integer
            disabled={locked}
            value={purchaseLineFreeStripQty(line)}
            onChange={(n) => onPatch({ freeQty: purchaseLineFreeQtyFromStrips(n, line.pack) })}
          />
        </MobileField>
        <MobileField label="Bill rate" hint="Rate per pack, excluding GST">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            step={0.01}
            disabled={locked}
            value={line.costPrice}
            onChange={(n) => onPatch(resyncPurchaseLineDiscountPatches(line, { costPrice: n }))}
          />
        </MobileField>
        <MobileField label="GST %">
          <PurchaseGstSelect
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            disabled={locked}
            value={line.gstPct}
            onChange={(n) => onPatch({ gstPct: n })}
          />
        </MobileField>
        <MobileField label="Scheme %" hint="Scheme discount % on trade item gross">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            max={100}
            step={0.01}
            disabled={locked}
            value={line.schemeDiscountPct}
            onChange={(n) => onPatch(syncSchemeDiscountFromPct(line, n))}
          />
        </MobileField>
        <MobileField label="Scheme ₹" hint="Scheme discount amount">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            step={0.01}
            disabled={locked}
            value={line.schemeDiscountRs}
            onChange={(n) => onPatch(syncSchemeDiscountFromRs(line, n))}
          />
        </MobileField>
        <MobileField label="Purchase disc %" hint="Purchase discount % after scheme">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            max={100}
            step={0.01}
            disabled={locked}
            value={line.purchaseDiscountPct}
            onChange={(n) => onPatch(syncPurchaseDiscountFromPct(line, n))}
          />
        </MobileField>
        <MobileField label="Purchase disc ₹" hint="Purchase discount amount">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            step={0.01}
            disabled={locked}
            value={line.purchaseDiscountRs}
            onChange={(n) => onPatch(syncPurchaseDiscountFromRs(line, n))}
          />
        </MobileField>
        <MobileField label="MRP" hint="Printed MRP per pack">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            step={0.01}
            disabled={locked}
            value={line.mrp}
            onChange={(n) => onPatch(resyncPurchaseLineDiscountPatches(line, { mrp: n }))}
          />
        </MobileField>
        <MobileField label="Sale rate" hint="Selling rate per pack; updates sale discount vs MRP">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            step={0.01}
            disabled={locked}
            value={purchaseLineSaleRatePerPack(line)}
            onChange={(n) => onPatch(syncSalesDiscountFromRate(line, n))}
          />
        </MobileField>
        <MobileField label="Sale disc %" hint="Retail sale discount % per pack">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            max={100}
            step={0.01}
            disabled={locked}
            value={line.salesDiscountPct}
            onChange={(n) => onPatch(syncSalesDiscountFromPct(line, n))}
          />
        </MobileField>
        <MobileField label="Sale disc ₹" hint="Retail sale discount ₹ per pack">
          <NumericTableInput
            className={`${PURCHASE_MOBILE_INPUT_CLASS} text-right`}
            min={0}
            step={0.01}
            disabled={locked}
            value={line.salesDiscountRs}
            onChange={(n) => onPatch(syncSalesDiscountFromRs(line, n))}
          />
        </MobileField>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-zinc-200/80 pt-2 text-sm dark:border-zinc-700">
        <div>
          <p className="text-[11px] leading-tight text-zinc-500">Margin</p>
          <p className="tabular-nums text-zinc-800 dark:text-zinc-200">
            {marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}
          </p>
        </div>
        {returnedQty > 0 ? (
          <div>
            <p className="text-[11px] leading-tight text-zinc-500">Returned qty</p>
            <p className="tabular-nums text-zinc-600 dark:text-zinc-400">{returnedQty}</p>
          </div>
        ) : null}
        <div className="text-right">
          <p className="text-[11px] leading-tight text-zinc-500">Item total</p>
          <p className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
            ₹{itemSum.toFixed(2)}
          </p>
        </div>
      </div>

      {isDraft && action ? <div className="mt-2.5">{action}</div> : null}
    </article>
  );
}
