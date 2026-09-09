"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function StockBrandSelect({
  productId,
  brandId,
  brandName,
  brands,
  canEdit,
  compact,
}: {
  productId: string;
  brandId: string | null;
  brandName: string | null;
  brands: { id: string; name: string }[];
  canEdit: boolean;
  /** Narrow layout for dense tables (e.g. Batches & expiry). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(brandId ?? "");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(brandId ?? "");
  }, [brandId]);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      const nextBrandId = v === "" ? null : v;
      setValue(v);
      setErr(null);
      setPending(true);
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: nextBrandId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        router.refresh();
      } catch (x) {
        setErr(x instanceof Error ? x.message : "Failed");
        setValue(brandId ?? "");
      } finally {
        setPending(false);
      }
    },
    [productId, brandId, router],
  );

  if (!canEdit) {
    const display = brandName?.trim() || "—";
    return (
      <span
        className={
          compact
            ? "block max-w-[6.25rem] truncate text-[11px] text-zinc-600 dark:text-zinc-400"
            : "block min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400"
        }
        title={display}
      >
        {display}
      </span>
    );
  }

  const orphanBrand =
    brandId && !brands.some((b) => b.id === brandId)
      ? ({ id: brandId, name: brandName?.trim() || "Unknown brand" } as const)
      : null;

  return (
    <div className={compact ? "flex min-w-0 max-w-[6.5rem] flex-col gap-0.5" : "flex w-full min-w-0 flex-col gap-0.5"}>
      <select
        value={value}
        onChange={(e) => void onChange(e)}
        disabled={pending}
        aria-label="Brand"
        className={
          compact
            ? "w-full max-w-full rounded border border-zinc-300 bg-white px-1 py-1 text-[11px] text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
      >
        <option value="">No brand</option>
        {orphanBrand ? (
          <option value={orphanBrand.id}>{orphanBrand.name}</option>
        ) : null}
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {err ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
