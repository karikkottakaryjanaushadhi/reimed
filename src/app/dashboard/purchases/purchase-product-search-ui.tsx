"use client";

import type { KeyboardEventHandler } from "react";
import { posRateMrpBracketRangeLabel } from "@/app/dashboard/pos/pos-line-helpers";
import { sortByProductSearchRelevance } from "@/lib/search-normalize";

export type PurchaseProductSearchHit = {
  id: string;
  name: string;
  brand?: string | null;
  supplier?: string | null;
  quantity?: number;
  rateMin?: number | null;
  rateMax?: number | null;
  mrpMin?: number | null;
  mrpMax?: number | null;
};

type StockRow = {
  productId: string;
  brand?: string | null;
  supplier?: string | null;
  quantity: number;
  rateMin: number | null;
  rateMax: number | null;
  mrpMin: number | null;
  mrpMax: number | null;
};

export async function fetchPurchaseProductSearchHits(
  query: string,
  signal?: AbortSignal,
): Promise<PurchaseProductSearchHit[]> {
  const enc = encodeURIComponent(query);
  const [productsRes, stockRes] = await Promise.all([
    fetch(`/api/products?q=${enc}&searchSku=0`, { signal }),
    fetch(`/api/inventory/stock?q=${enc}`, { signal }),
  ]);
  const productsData = (await productsRes.json()) as {
    products?: Array<{ id: string; name: string; brand?: { name: string } | null }>;
  };
  const stockData = (await stockRes.json()) as { stock?: StockRow[] };
  const stockByProductId = new Map((stockData.stock ?? []).map((s) => [s.productId, s]));

  const products = productsData.products ?? [];
  const ranked = sortByProductSearchRelevance(products, query, (p) => p.name);

  return ranked.map(({ id, name, brand }) => {
    const st = stockByProductId.get(id);
    return {
      id,
      name,
      brand: brand?.name ?? st?.brand ?? null,
      supplier: st?.supplier ?? null,
      quantity: st?.quantity,
      rateMin: st?.rateMin,
      rateMax: st?.rateMax,
      mrpMin: st?.mrpMin,
      mrpMax: st?.mrpMax,
    };
  });
}

export function purchaseProductHitPriceLabel(hit: PurchaseProductSearchHit): string | null {
  if (hit.mrpMin == null || hit.mrpMax == null) return null;
  return posRateMrpBracketRangeLabel(
    hit.rateMin ?? hit.mrpMin,
    hit.rateMax ?? hit.mrpMax,
    hit.mrpMin,
    hit.mrpMax,
  );
}

export function PurchaseProductHitPrice({ hit }: { hit: PurchaseProductSearchHit }) {
  const label = purchaseProductHitPriceLabel(hit);
  if (!label) return null;
  return <span className="tabular-nums text-[11px] text-zinc-500">{label}</span>;
}

function PurchaseSearchClearButton({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className="absolute top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      style={{ right: "0.25rem" }}
      title={title ?? "Clear"}
      aria-label={title ?? "Clear"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  );
}

const DEFAULT_INPUT_CLASS =
  "relative z-0 w-full rounded border border-zinc-300 bg-white py-2 pl-2 text-sm dark:border-zinc-600 dark:bg-zinc-950";

export function PurchaseProductSearchField({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder = "Search product name…",
  inputClassName = DEFAULT_INPUT_CLASS,
  ariaLabel,
  showClear,
  onClear,
  showNewProduct,
  onNewProduct,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
  inputClassName?: string;
  ariaLabel?: string;
  showClear?: boolean;
  onClear?: () => void;
  showNewProduct?: boolean;
  onNewProduct?: () => void;
}) {
  const padRight = showClear && showNewProduct ? " pr-16" : showClear || showNewProduct ? " pr-9" : "";

  return (
    <div className="relative min-w-0 w-full">
      <input
        id={id}
        className={`${inputClassName}${padRight}`}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {showClear && onClear ? <PurchaseSearchClearButton onClick={onClear} title="Clear search" /> : null}
      {showNewProduct && onNewProduct ? (
        <button
          type="button"
          className="absolute top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-base font-semibold leading-none text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-100 dark:hover:bg-emerald-900"
          style={{ right: showClear ? "2.25rem" : "0.25rem" }}
          title="New product"
          aria-label="Add new product"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onNewProduct}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

export function PurchaseSupplierSearchField({
  id,
  value,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  placeholder,
  inputClassName = "relative z-0 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950",
  showClear,
  onClear,
  ariaRequired,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  inputClassName?: string;
  showClear?: boolean;
  onClear?: () => void;
  ariaRequired?: boolean;
}) {
  return (
    <div className="relative min-w-0 w-full">
      <input
        id={id}
        className={`${inputClassName}${showClear ? " pr-9" : ""}`}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        aria-required={ariaRequired}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {showClear && onClear ? (
        <PurchaseSearchClearButton onClick={onClear} title="Clear supplier" />
      ) : null}
    </div>
  );
}

export function PurchaseProductSearchListItem({
  hit,
  selected,
  onSelect,
  onHover,
  dataIdxAttr,
  dataIdxValue,
}: {
  hit: PurchaseProductSearchHit;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  dataIdxAttr: string;
  dataIdxValue: number;
}) {
  return (
    <button
      type="button"
      {...{ [dataIdxAttr]: dataIdxValue }}
      className={`flex w-full items-start justify-between gap-2 px-2 py-2 text-left ${
        selected
          ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
      }`}
      onMouseEnter={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words font-medium text-zinc-900 dark:text-zinc-100">{hit.name}</span>
        {hit.brand || hit.supplier ? (
          <span className="mt-0.5 block truncate text-[10px] text-zinc-500 dark:text-zinc-400">
            {[hit.brand, hit.supplier].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>
      {hit.quantity != null || purchaseProductHitPriceLabel(hit) ? (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          {hit.quantity != null ? (
            <span
              className={`tabular-nums text-[11px] font-medium ${
                hit.quantity <= 0 ? "text-amber-700 dark:text-amber-400" : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {hit.quantity <= 0 ? "0 stock" : `${hit.quantity} stock`}
            </span>
          ) : null}
          <PurchaseProductHitPrice hit={hit} />
        </span>
      ) : null}
    </button>
  );
}
