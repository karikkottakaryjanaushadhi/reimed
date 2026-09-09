"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PRODUCT_CATEGORY,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  isProductCategory,
  type ProductCategory,
} from "@/lib/product-categories";

function normalizeCategory(raw: string | null | undefined): ProductCategory {
  if (raw && isProductCategory(raw)) return raw;
  return DEFAULT_PRODUCT_CATEGORY;
}

export function StockCategorySelect({
  productId,
  productCategory,
  canEdit,
  compact,
  onUpdated,
}: {
  productId: string;
  productCategory: string | null;
  canEdit: boolean;
  /** Narrow layout for dense tables (e.g. Batches & expiry). */
  compact?: boolean;
  onUpdated?: (productCategory: ProductCategory) => void;
}) {
  const router = useRouter();
  const normalized = normalizeCategory(productCategory);
  const [value, setValue] = useState(normalized);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(normalizeCategory(productCategory));
  }, [productCategory]);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (!isProductCategory(v)) return;
      setValue(v);
      setErr(null);
      setPending(true);
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productCategory: v }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        onUpdated?.(v);
        router.refresh();
      } catch (x) {
        if (!compact) setErr(x instanceof Error ? x.message : "Failed");
        setValue(normalized);
      } finally {
        setPending(false);
      }
    },
    [productId, normalized, router, compact, onUpdated],
  );

  if (!canEdit) {
    return (
      <span
        className={
          compact
            ? "block max-w-[5.5rem] truncate text-[11px] text-zinc-600 dark:text-zinc-400"
            : "block min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400"
        }
        title={PRODUCT_CATEGORY_LABELS[normalized]}
      >
        {PRODUCT_CATEGORY_LABELS[normalized]}
      </span>
    );
  }

  return (
    <div className={compact ? "flex min-w-0 max-w-[5.75rem] flex-col gap-0.5" : "flex w-full min-w-0 flex-col gap-0.5"}>
      <select
        value={value}
        onChange={(e) => void onChange(e)}
        disabled={pending}
        aria-label="Product category"
        className={
          compact
            ? "w-full max-w-full rounded border border-zinc-300 bg-white px-1 py-1 text-[11px] text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
      >
        {PRODUCT_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {PRODUCT_CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      {err && !compact ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
