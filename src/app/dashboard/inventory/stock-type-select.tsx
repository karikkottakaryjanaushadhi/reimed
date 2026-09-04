"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PRODUCT_TYPE,
  PRODUCT_TYPES,
  PRODUCT_TYPE_LABELS,
  isProductType,
  type ProductType,
} from "@/lib/product-types";

function normalizeType(raw: string | null | undefined): ProductType {
  if (raw && isProductType(raw)) return raw;
  return DEFAULT_PRODUCT_TYPE;
}

export function StockTypeSelect({
  productId,
  productType,
  canEdit,
  compact,
}: {
  productId: string;
  productType: string | null;
  canEdit: boolean;
  /** Narrow layout for dense tables (e.g. Batches & expiry). */
  compact?: boolean;
}) {
  const router = useRouter();
  const normalized = normalizeType(productType);
  const [value, setValue] = useState(normalized);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(normalizeType(productType));
  }, [productType]);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (!isProductType(v)) return;
      setValue(v);
      setErr(null);
      setPending(true);
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productType: v }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        router.refresh();
      } catch (x) {
        setErr(x instanceof Error ? x.message : "Failed");
        setValue(normalized);
      } finally {
        setPending(false);
      }
    },
    [productId, normalized, router],
  );

  if (!canEdit) {
    return (
      <span
        className={
          compact
            ? "block max-w-[5.5rem] truncate text-[11px] text-zinc-600 dark:text-zinc-400"
            : "whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400"
        }
        title={PRODUCT_TYPE_LABELS[normalized]}
      >
        {PRODUCT_TYPE_LABELS[normalized]}
      </span>
    );
  }

  return (
    <div className={compact ? "flex min-w-0 max-w-[5.75rem] flex-col gap-0.5" : "flex min-w-[7.5rem] flex-col gap-0.5"}>
      <select
        value={value}
        onChange={(e) => void onChange(e)}
        disabled={pending}
        aria-label="Product type"
        className={
          compact
            ? "w-full max-w-full rounded border border-zinc-300 bg-white px-1 py-1 text-[11px] text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-[7.5rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
      >
        {PRODUCT_TYPES.map((t) => (
          <option key={t} value={t}>
            {PRODUCT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      {err ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
