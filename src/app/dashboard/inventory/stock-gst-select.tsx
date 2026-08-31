"use client";

import { gstPctNumber, PRODUCT_GST_SLABS, type ProductGstSlab } from "@/lib/product-gst-slabs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function matchesSlab(n: number): ProductGstSlab | null {
  const x = gstPctNumber(n);
  for (const s of PRODUCT_GST_SLABS) {
    if (Math.abs(x - s) < 0.001) return s;
  }
  return null;
}

export function StockGstSelect({
  productId,
  gstPct,
  canEdit,
  compact,
}: {
  productId: string;
  gstPct: number;
  canEdit: boolean;
  /** Narrow layout for dense tables (e.g. Batches & expiry). */
  compact?: boolean;
}) {
  const router = useRouter();
  const normalized = gstPctNumber(gstPct);
  const matched = matchesSlab(normalized);

  const [value, setValue] = useState(() =>
    matched !== null ? String(matched) : "",
  );
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const m = matchesSlab(gstPctNumber(gstPct));
    setValue(m !== null ? String(m) : "");
  }, [gstPct]);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const raw = e.target.value;
      if (raw === "") return;
      const v = Number(raw);
      setValue(raw);
      setErr(null);
      setPending(true);
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gstPct: v }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        router.refresh();
      } catch (x) {
        setErr(x instanceof Error ? x.message : "Failed");
        const m = matchesSlab(normalized);
        setValue(m !== null ? String(m) : "");
      } finally {
        setPending(false);
      }
    },
    [productId, normalized, router],
  );

  const disp =
    normalized % 1 === 0 ? `${normalized}` : normalized.toFixed(2).replace(/\.?0+$/, "");

  if (!canEdit) {
    return (
      <span
        className={
          compact
            ? "inline-block min-w-0 max-w-[2.75rem] truncate text-center text-[11px] text-zinc-600 dark:text-zinc-400"
            : "whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400"
        }
        title={`GST ${disp}%`}
      >
        {matched !== null ? `${matched}%` : `${disp}%`}
      </span>
    );
  }

  return (
    <div className={compact ? "flex min-w-0 max-w-[3.25rem] flex-col gap-0" : "flex min-w-[6rem] flex-col gap-0.5"}>
      {matched === null ? (
        <span
          className={
            compact
              ? "truncate text-[9px] leading-tight text-amber-800 dark:text-amber-400"
              : "text-[10px] leading-tight text-amber-800 dark:text-amber-400"
          }
          title="Not a standard slab"
        >
          {compact ? `${disp}%` : `Saved ${disp}%`}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(e) => void onChange(e)}
        disabled={pending}
        aria-label="GST percent"
        className={
          compact
            ? "w-full min-w-0 max-w-full rounded border border-zinc-300 bg-white px-0.5 py-1 text-center text-[11px] tabular-nums text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-[6rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
      >
        {matched === null ? <option value="">Set slab…</option> : null}
        {PRODUCT_GST_SLABS.map((s) => (
          <option key={s} value={String(s)}>
            {s}%
          </option>
        ))}
      </select>
      {err ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
