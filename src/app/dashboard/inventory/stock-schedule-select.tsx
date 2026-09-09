"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_PRODUCT_SCHEDULE,
  PRODUCT_SCHEDULES,
  PRODUCT_SCHEDULE_LABELS,
  isProductSchedule,
  type ProductSchedule,
} from "@/lib/product-schedules";

function normalizeSchedule(raw: string | null | undefined): ProductSchedule {
  if (raw && isProductSchedule(raw)) return raw;
  return DEFAULT_PRODUCT_SCHEDULE;
}

function compactLabel(s: ProductSchedule): string {
  return s === "NONE" ? "None" : s;
}

export function StockScheduleSelect({
  productId,
  productSchedule,
  canEdit,
  compact,
}: {
  productId: string;
  productSchedule: string | null;
  canEdit: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const normalized = normalizeSchedule(productSchedule);
  const [value, setValue] = useState(normalized);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(normalizeSchedule(productSchedule));
  }, [productSchedule]);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      if (!isProductSchedule(v)) return;
      setValue(v);
      setErr(null);
      setPending(true);
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productSchedule: v }),
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

  const shown = PRODUCT_SCHEDULE_LABELS[normalized];

  if (!canEdit) {
    return (
      <span
        className={
          compact
            ? "block max-w-[4.5rem] truncate text-[11px] text-zinc-600 dark:text-zinc-400"
            : "whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400"
        }
        title={shown}
      >
        {compact ? compactLabel(normalized) : shown}
      </span>
    );
  }

  return (
    <div className={compact ? "flex min-w-0 max-w-[4.75rem] flex-col gap-0.5" : "flex min-w-[7.5rem] flex-col gap-0.5"}>
      <select
        value={value}
        onChange={(e) => void onChange(e)}
        disabled={pending}
        aria-label="Product schedule"
        className={
          compact
            ? "w-full max-w-full rounded border border-zinc-300 bg-white px-1 py-1 text-[11px] text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-[7.5rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
      >
        {PRODUCT_SCHEDULES.map((s) => (
          <option key={s} value={s}>
            {compact ? compactLabel(s) : PRODUCT_SCHEDULE_LABELS[s]}
          </option>
        ))}
      </select>
      {err ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
