"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function StockIntField({
  productId,
  field,
  value,
  min,
  canEdit,
  compact,
  ariaLabel,
}: {
  productId: string;
  field: "packSize" | "reorderMin";
  value: number;
  min: number;
  canEdit: boolean;
  compact?: boolean;
  ariaLabel: string;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState(String(value));
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRaw(String(value));
  }, [value, productId]);

  const save = useCallback(async () => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < min) {
      setErr(min <= 0 ? "Must be 0 or more" : "Must be 1 or more");
      setRaw(String(value));
      return;
    }
    if (n === value) {
      setErr(null);
      setRaw(String(value));
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: n }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setRaw(String(value));
    } finally {
      setPending(false);
    }
  }, [productId, field, min, raw, value, router]);

  if (!canEdit) {
    return <span className="tabular-nums">{value}</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <input
        aria-label={ariaLabel}
        type="number"
        min={min}
        inputMode="numeric"
        className={
          compact
            ? "w-full min-w-0 rounded border border-zinc-300 bg-white px-1 py-1 text-right text-[11px] tabular-nums text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
        value={raw}
        disabled={pending}
        onChange={(e) => {
          setRaw(e.target.value);
          setErr(null);
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {err ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
