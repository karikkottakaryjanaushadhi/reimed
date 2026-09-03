"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useState } from "react";

import { PRODUCT_GST_SLABS } from "@/lib/product-gst-slabs";
import {
  DEFAULT_PRODUCT_CATEGORY,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  type ProductCategory,
} from "@/lib/product-categories";
import {
  DEFAULT_PRODUCT_TYPE,
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  type ProductType,
} from "@/lib/product-types";
import { compactSearchKey } from "@/lib/search-normalize";
import { JANAUSHADHI_DRUG_CODE_REQUIRED_ERROR } from "@/lib/drug-code";
import { CatalogBrandSearchField } from "../products/catalog-brand-search-field";

/** Matches `product-form.tsx` styling for the new-product modal fields. */
const catalogLabelCls = "text-xs font-medium text-zinc-600 dark:text-zinc-400";
const catalogInputCls =
  "w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950";

const NP_MODAL_FIELD_IDS = [
  "name",
  "genericName",
  "brand",
  "category",
  "type",
  "drugCode",
  "pack",
  "reorderMin",
  "gstPct",
  "apply",
] as const;
type NpModalField = (typeof NP_MODAL_FIELD_IDS)[number];

function npModalFields(category: ProductCategory): NpModalField[] {
  const fields: NpModalField[] = ["name", "genericName", "brand", "category", "type"];
  if (category === "JANAUSHADHI") fields.push("drugCode");
  fields.push("pack", "reorderMin", "gstPct", "apply");
  return fields;
}

function focusNpModalField(field: NpModalField) {
  const el = document.querySelector<HTMLElement>(`[data-np-field="${field}"]`);
  if (!el) return;
  el.focus();
  if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number")) {
    try {
      el.select();
    } catch {
      /* ignore */
    }
  }
}

function focusNextNpModalField(current: NpModalField, category: ProductCategory) {
  const fields = npModalFields(category);
  const i = fields.indexOf(current);
  if (i < 0 || i >= fields.length - 1) return;
  focusNpModalField(fields[i + 1]!);
}

export type PurchaseNewProductModalResult = {
  name: string;
  genericName: string;
  drugCode: string;
  brandId: string | null;
  brandName: string;
  productCategory: ProductCategory;
  productType: ProductType;
  packSize: number;
  reorderMin: number;
  gstPct: number;
};

export type PurchaseNewProductModalInitial = Partial<PurchaseNewProductModalResult>;

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (result: PurchaseNewProductModalResult) => void;
  initial?: PurchaseNewProductModalInitial | null;
  onValidationError?: (message: string) => void;
};

export function PurchaseNewProductModal({
  open,
  onClose,
  onApply,
  initial,
  onValidationError,
}: Props) {
  const brandFieldId = useId();

  const [name, setName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [drugCode, setDrugCode] = useState("");
  const [brandQ, setBrandQ] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [lockedBrandName, setLockedBrandName] = useState<string | null>(null);
  const [brandHits, setBrandHits] = useState<{ id: string; name: string }[]>([]);
  const [brandHi, setBrandHi] = useState(0);
  const [packSize, setPackSize] = useState(10);
  const [productCategory, setProductCategory] = useState<ProductCategory>(DEFAULT_PRODUCT_CATEGORY);
  const [productType, setProductType] = useState<ProductType>(DEFAULT_PRODUCT_TYPE);
  const [reorderMin, setReorderMin] = useState(0);
  const [gstPct, setGstPct] = useState(5);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name?.trim() ?? "");
    setGenericName(initial?.genericName?.trim() ?? "");
    setDrugCode(initial?.drugCode?.trim() ?? "");
    setBrandId(initial?.brandId ?? null);
    const bn = initial?.brandName?.trim() ?? "";
    setLockedBrandName(initial?.brandId ? bn || null : null);
    setBrandQ(bn);
    setBrandHits([]);
    setBrandHi(0);
    setPackSize(Math.max(1, initial?.packSize ?? 10));
    setProductCategory(initial?.productCategory ?? DEFAULT_PRODUCT_CATEGORY);
    setProductType(initial?.productType ?? DEFAULT_PRODUCT_TYPE);
    setReorderMin(Math.max(0, initial?.reorderMin ?? 0));
    setGstPct(initial?.gstPct ?? 5);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: Event) {
      if ((ev as globalThis.KeyboardEvent).key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const searchBrands = useCallback(async (query: string, signal?: AbortSignal) => {
    const q = query.trim();
    if (!q) {
      setBrandHits([]);
      return;
    }
    try {
      const res = await fetch(`/api/brands?q=${encodeURIComponent(q)}`, { signal });
      const data = await res.json();
      if (res.ok) {
        setBrandHits((data.brands ?? []) as { id: string; name: string }[]);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = brandQ.trim();
    if (!t) {
      setBrandHits([]);
      return;
    }
    if (brandId && lockedBrandName && compactSearchKey(t) === compactSearchKey(lockedBrandName)) {
      setBrandHits([]);
      return;
    }
    const ac = new AbortController();
    const tid = window.setTimeout(() => void searchBrands(t, ac.signal), 220);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [open, brandQ, brandId, lockedBrandName, searchBrands]);

  useEffect(() => {
    if (brandHits.length > 0) setBrandHi(0);
    else setBrandHi(-1);
  }, [brandHits]);

  const brandListOpen = open && brandQ.trim().length > 0 && brandHits.length > 0;

  function pickBrand(b: { id: string; name: string }) {
    setBrandId(b.id);
    setLockedBrandName(b.name);
    setBrandQ(b.name);
    setBrandHits([]);
  }

  function onBrandInputChange(v: string) {
    setBrandQ(v);
    if (lockedBrandName != null && compactSearchKey(v) !== compactSearchKey(lockedBrandName)) {
      setBrandId(null);
      setLockedBrandName(null);
    }
  }

  function onNpFieldEnter(e: KeyboardEvent<HTMLElement>, field: NpModalField) {
    if (e.key !== "Enter") return;
    if (field === "apply") {
      e.preventDefault();
      handleApply();
      return;
    }
    e.preventDefault();
    focusNextNpModalField(field, productCategory);
  }

  function onBrandKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && brandListOpen) {
      e.preventDefault();
      const i = brandHi >= 0 ? brandHi : 0;
      const row = brandHits[i];
      if (row) pickBrand(row);
      return;
    }
    if (e.key === "Enter" && !brandListOpen) {
      onNpFieldEnter(e, "brand");
      return;
    }
    if (!brandListOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setBrandHi((h) => {
        if (brandHits.length === 0) return -1;
        if (h < 0) return 0;
        return Math.min(brandHits.length - 1, h + 1);
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setBrandHi((h) => {
        if (brandHits.length === 0) return -1;
        if (h < 0) return brandHits.length - 1;
        return Math.max(0, h - 1);
      });
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setBrandHits([]);
    }
  }

  function handleApply() {
    const trimmed = name.trim();
    if (!trimmed) {
      onValidationError?.("Enter a product name.");
      return;
    }
    if (productCategory === "JANAUSHADHI" && !drugCode.trim()) {
      onValidationError?.(JANAUSHADHI_DRUG_CODE_REQUIRED_ERROR);
      return;
    }
    onApply({
      name: trimmed,
      genericName: genericName.trim(),
      drugCode: productCategory === "JANAUSHADHI" ? drugCode.trim() : "",
      brandId,
      brandName: brandId ? (lockedBrandName ?? brandQ).trim() : brandQ.trim(),
      productCategory,
      productType,
      packSize: Math.max(1, Math.floor(Number(packSize)) || 1),
      reorderMin: Math.max(0, Math.floor(Number(reorderMin)) || 0),
      gstPct: Number(gstPct),
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-new-product-title"
    >
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-7xl overflow-x-hidden overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="purchase-new-product-title" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          New product (catalog)
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Same fields as Add product on the Products page. Pack updates this line&apos;s Pack column.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:-mx-1 md:flex md:flex-nowrap md:items-end md:gap-3 md:overflow-x-auto md:px-1 md:pb-1">
          <label className="col-span-2 flex min-w-0 flex-col gap-1 md:min-w-[10rem] md:flex-1">
            <span className={catalogLabelCls}>Name</span>
            <input
              required
              placeholder="Product name"
              className={catalogInputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => onNpFieldEnter(e, "name")}
              autoComplete="off"
              autoFocus
              data-np-field="name"
            />
          </label>
          <label className="col-span-2 flex min-w-0 flex-col gap-1 md:min-w-[10rem] md:flex-1">
            <span className={catalogLabelCls}>Generic name</span>
            <input
              placeholder="Optional"
              className={catalogInputCls}
              value={genericName}
              onChange={(e) => setGenericName(e.target.value)}
              onKeyDown={(e) => onNpFieldEnter(e, "genericName")}
              autoComplete="off"
              data-np-field="genericName"
            />
          </label>
          <CatalogBrandSearchField
            fieldId={brandFieldId}
            labelCls={catalogLabelCls}
            inputCls={catalogInputCls}
            value={brandQ}
            onChange={onBrandInputChange}
            hits={brandHits}
            hi={brandHi}
            onHiChange={setBrandHi}
            onPick={pickBrand}
            onDismissHits={() => setBrandHits([])}
            listOpen={brandListOpen}
            wrapClassName="relative col-span-2 flex min-w-0 w-full flex-col gap-1 md:min-w-[10rem] md:max-w-[20rem] md:flex-1"
            inputProps={{ "data-np-field": "brand", onKeyDown: onBrandKeyDown }}
          />
          <label className="flex min-w-0 flex-col gap-1 md:w-[7.5rem]">
            <span className={catalogLabelCls}>Category</span>
            <select
              className={catalogInputCls}
              aria-label="Product category"
              value={productCategory}
              onChange={(e) => {
                const next = e.target.value as ProductCategory;
                setProductCategory(next);
                if (next !== "JANAUSHADHI") setDrugCode("");
              }}
              onKeyDown={(e) => onNpFieldEnter(e, "category")}
              data-np-field="category"
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PRODUCT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-[7.5rem]">
            <span className={catalogLabelCls}>Type</span>
            <select
              className={catalogInputCls}
              aria-label="Product type"
              value={productType}
              onChange={(e) => setProductType(e.target.value as ProductType)}
              onKeyDown={(e) => onNpFieldEnter(e, "type")}
              data-np-field="type"
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PRODUCT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          {productCategory === "JANAUSHADHI" ? (
            <label className="flex min-w-0 flex-col gap-1 md:w-[5.5rem]">
              <span className={catalogLabelCls}>Drug code</span>
              <input
                required
                placeholder="0000"
                title="Required for Janaushadhi. Stored as JAN…; search at POS by number only (not on bills)"
                className={`${catalogInputCls} tabular-nums`}
                value={drugCode}
                onChange={(e) => setDrugCode(e.target.value)}
                onKeyDown={(e) => onNpFieldEnter(e, "drugCode")}
                inputMode="numeric"
                autoComplete="off"
                data-np-field="drugCode"
              />
            </label>
          ) : null}
          <label className="flex min-w-0 flex-col gap-1 md:w-[5.25rem]">
            <span className={catalogLabelCls}>Pack</span>
            <input
              type="number"
              required
              min={1}
              placeholder="10"
              title="Units per pack (e.g. 10 tablets per strip)"
              aria-label="Pack — units per pack"
              className={`${catalogInputCls} tabular-nums`}
              value={packSize}
              onChange={(e) => setPackSize(Number(e.target.value))}
              onKeyDown={(e) => onNpFieldEnter(e, "pack")}
              data-np-field="pack"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-[7rem]">
            <span className={catalogLabelCls}>Reorder at qty</span>
            <input
              type="number"
              min={0}
              className={`${catalogInputCls} tabular-nums`}
              value={reorderMin}
              onChange={(e) => setReorderMin(Number(e.target.value))}
              onKeyDown={(e) => onNpFieldEnter(e, "reorderMin")}
              data-np-field="reorderMin"
            />
          </label>
          <label
            className={`flex min-w-0 flex-col gap-1 md:w-[6.5rem] ${
              productCategory === "JANAUSHADHI" ? "col-span-2" : ""
            }`}
          >
            <span className={catalogLabelCls}>GST %</span>
            <select
              className={catalogInputCls}
              aria-label="GST percent"
              value={gstPct}
              onChange={(e) => setGstPct(Number(e.target.value))}
              onKeyDown={(e) => onNpFieldEnter(e, "gstPct")}
              data-np-field="gstPct"
            >
              {PRODUCT_GST_SLABS.map((p) => (
                <option key={p} value={p}>
                  {p}%
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            onClick={handleApply}
            onKeyDown={(e) => onNpFieldEnter(e, "apply")}
            data-np-field="apply"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
