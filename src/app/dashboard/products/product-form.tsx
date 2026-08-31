"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_GST_SLABS, gstPctNumber } from "@/lib/product-gst-slabs";
import {
  DEFAULT_PRODUCT_CATEGORY,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  type ProductCategory,
} from "@/lib/product-categories";
import { compactSearchKey } from "@/lib/search-normalize";
import { drugCodeFormValue, JANAUSHADHI_DRUG_CODE_REQUIRED_ERROR } from "@/lib/drug-code";
import { CatalogBrandSearchField } from "./catalog-brand-search-field";

const labelCls = "text-xs font-medium text-zinc-600 dark:text-zinc-400";
const inputCls =
  "w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950";

type BrandHit = { id: string; name: string };

export type ProductFormValues = {
  name: string;
  drugCode: string;
  brandId: string | null;
  brandName: string;
  genericName: string;
  productCategory: ProductCategory;
  packSize: number;
  reorderMin: number;
  gstPct: number;
};

type Props = {
  productId?: string;
  initial?: Partial<ProductFormValues>;
  variant?: "page" | "modal";
  onSaved?: () => void;
  onCancel?: () => void;
};

function emptyValues(): ProductFormValues {
  return {
    name: "",
    drugCode: "",
    brandId: null,
    brandName: "",
    genericName: "",
    productCategory: DEFAULT_PRODUCT_CATEGORY,
    packSize: 10,
    reorderMin: 0,
    gstPct: 5,
  };
}

export function ProductForm({
  productId,
  initial,
  variant = "page",
  onSaved,
  onCancel,
}: Props) {
  const router = useRouter();
  const isEdit = !!productId;
  const brandFieldId = useId();

  const [name, setName] = useState(initial?.name ?? "");
  const [drugCode, setDrugCode] = useState(initial?.drugCode ?? "");
  const [genericName, setGenericName] = useState(initial?.genericName ?? "");
  const [productCategory, setProductCategory] = useState<ProductCategory>(
    initial?.productCategory ?? DEFAULT_PRODUCT_CATEGORY,
  );
  const [brandQ, setBrandQ] = useState(initial?.brandName ?? "");
  const [brandId, setBrandId] = useState<string | null>(initial?.brandId ?? null);
  const [lockedBrandName, setLockedBrandName] = useState<string | null>(
    initial?.brandId ? (initial.brandName ?? null) : null,
  );
  const [brandHits, setBrandHits] = useState<BrandHit[]>([]);
  const [brandHi, setBrandHi] = useState(0);
  const [packSize, setPackSize] = useState(initial?.packSize ?? 10);
  const [reorderMin, setReorderMin] = useState(initial?.reorderMin ?? 0);
  const [gstPct, setGstPct] = useState(initial?.gstPct ?? 5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name ?? "");
    setDrugCode(initial.drugCode ?? "");
    setGenericName(initial.genericName ?? "");
    setProductCategory(initial.productCategory ?? DEFAULT_PRODUCT_CATEGORY);
    setBrandQ(initial.brandName ?? "");
    setBrandId(initial.brandId ?? null);
    setLockedBrandName(initial.brandId ? (initial.brandName ?? null) : null);
    setPackSize(initial.packSize ?? 10);
    setReorderMin(initial.reorderMin ?? 0);
    setGstPct(initial.gstPct ?? 5);
  }, [initial, productId]);

  const listOpen = brandQ.trim().length > 0 && brandHits.length > 0;

  const searchBrands = useCallback(async (query: string, signal?: AbortSignal) => {
    const t = query.trim();
    if (!t) {
      setBrandHits([]);
      return;
    }
    try {
      const res = await fetch(`/api/brands?q=${encodeURIComponent(t)}`, { signal });
      const data = await res.json();
      if (res.ok) setBrandHits((data.brands ?? []) as BrandHit[]);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
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
  }, [brandQ, brandId, lockedBrandName, searchBrands]);

  useEffect(() => {
    if (brandHits.length > 0) setBrandHi(0);
    else setBrandHi(-1);
  }, [brandHits]);

  function pickBrand(b: BrandHit) {
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

  function onBrandKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!listOpen) return;
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
    if (e.key === "Enter") {
      e.preventDefault();
      const i = brandHi >= 0 ? brandHi : 0;
      const row = brandHits[i];
      if (row) pickBrand(row);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setBrandHits([]);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (productCategory === "JANAUSHADHI" && !drugCode.trim()) {
      setErr(JANAUSHADHI_DRUG_CODE_REQUIRED_ERROR);
      return;
    }
    setBusy(true);
    try {
      const body = {
        name,
        drugCode: productCategory === "JANAUSHADHI" ? drugCode.trim() : undefined,
        genericName: genericName.trim() || undefined,
        productCategory,
        brandId,
        packSize,
        reorderMin,
        gstPct,
      };
      const res = await fetch(isEdit ? `/api/products/${productId}` : "/api/products", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed");
        return;
      }
      if (isEdit) {
        onSaved?.();
      } else {
        const cleared = emptyValues();
        setName(cleared.name);
        setDrugCode(cleared.drugCode);
        setGenericName(cleared.genericName);
        setProductCategory(cleared.productCategory);
        setBrandQ("");
        setBrandId(null);
        setLockedBrandName(null);
        setBrandHits([]);
        setPackSize(cleared.packSize);
        setReorderMin(cleared.reorderMin);
        setGstPct(cleared.gstPct);
        onSaved?.();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const formClass =
    variant === "modal"
      ? ""
      : "rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <form onSubmit={(e) => void submit(e)} className={formClass}>
      {variant === "page" ? (
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Add product (catalog)</h2>
      ) : null}
      <div className={`flex ${variant === "modal" ? "-mx-1 flex-nowrap overflow-x-auto px-1 pb-1" : "flex-wrap"} items-end gap-3 ${variant === "page" ? "mt-3" : "mt-0"}`}>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className={labelCls}>Name</span>
          <input
            required
            placeholder="Product name"
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={variant === "modal"}
          />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className={labelCls}>Generic name</span>
          <input
            placeholder="Optional"
            className={inputCls}
            value={genericName}
            onChange={(e) => setGenericName(e.target.value)}
          />
        </label>
        <CatalogBrandSearchField
          fieldId={brandFieldId}
          labelCls={labelCls}
          inputCls={inputCls}
          value={brandQ}
          onChange={onBrandInputChange}
          hits={brandHits}
          hi={brandHi}
          onHiChange={setBrandHi}
          onPick={pickBrand}
          onDismissHits={() => setBrandHits([])}
          listOpen={listOpen}
          onKeyDown={onBrandKeyDown}
        />
        <label className="flex w-[7.5rem] flex-col gap-1">
          <span className={labelCls}>Category</span>
          <select
            className={inputCls}
            aria-label="Product category"
            value={productCategory}
            onChange={(e) => {
              const next = e.target.value as ProductCategory;
              setProductCategory(next);
              if (next !== "JANAUSHADHI") setDrugCode("");
            }}
          >
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PRODUCT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        {productCategory === "JANAUSHADHI" ? (
          <label className="flex w-[5.5rem] flex-col gap-1">
            <span className={labelCls}>Drug code</span>
            <input
              required
              placeholder="0000"
              title="Required for Janaushadhi. Stored as JAN…; search at POS by number only (not on bills)"
              className={`${inputCls} tabular-nums`}
              value={drugCode}
              onChange={(e) => setDrugCode(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
        ) : null}
        <label className="flex w-[5.25rem] flex-col gap-1">
          <span className={labelCls}>Pack</span>
          <input
            type="number"
            required
            min={1}
            placeholder="10"
            title="Units per pack (e.g. 10 tablets per strip)"
            className={`${inputCls} tabular-nums`}
            value={packSize}
            onChange={(e) => setPackSize(Number(e.target.value))}
          />
        </label>
        <label className="flex w-[7rem] flex-col gap-1">
          <span className={labelCls}>Reorder at qty</span>
          <input
            type="number"
            min={0}
            className={`${inputCls} tabular-nums`}
            value={reorderMin}
            onChange={(e) => setReorderMin(Number(e.target.value))}
          />
        </label>
        <label className="flex w-[6.5rem] flex-col gap-1">
          <span className={labelCls}>GST %</span>
          <select
            className={inputCls}
            aria-label="GST percent"
            value={gstPct}
            onChange={(e) => setGstPct(Number(e.target.value))}
          >
            {PRODUCT_GST_SLABS.map((p) => (
              <option key={p} value={p}>
                {p}%
              </option>
            ))}
          </select>
        </label>
        <div className="flex shrink-0 gap-2">
          {variant === "modal" && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "Saving…" : isEdit ? "Save" : "Add product"}
          </button>
        </div>
      </div>
      {err ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
    </form>
  );
}

/** Re-export for list row → form initial */
export function productRowToFormValues(row: {
  name: string;
  sku: string;
  brandId: string | null;
  brandName: string | null;
  genericName: string | null;
  productCategory: string | null;
  packSize: number;
  reorderMin: number;
  gstPct: number;
}): ProductFormValues {
  return {
    name: row.name,
    drugCode:
      row.productCategory === "JANAUSHADHI" ? drugCodeFormValue(row.sku) : "",
    brandId: row.brandId,
    brandName: row.brandName ?? "",
    genericName: row.genericName ?? "",
    productCategory:
      row.productCategory && PRODUCT_CATEGORIES.includes(row.productCategory as ProductCategory)
        ? (row.productCategory as ProductCategory)
        : DEFAULT_PRODUCT_CATEGORY,
    packSize: row.packSize,
    reorderMin: row.reorderMin,
    gstPct: row.gstPct,
  };
}
