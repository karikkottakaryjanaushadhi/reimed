"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { displayDrugCode, drugCodeFormValue } from "@/lib/drug-code";

export function StockDrugCodeField({
  productId,
  sku,
  productCategory,
  canEdit,
  compact,
}: {
  productId: string;
  sku: string;
  productCategory: string | null;
  canEdit: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const janaushadhi = productCategory === "JANAUSHADHI";
  const shown = displayDrugCode(sku, productCategory);
  const formValue = janaushadhi ? drugCodeFormValue(sku) : "";
  const [value, setValue] = useState(formValue);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(janaushadhi ? drugCodeFormValue(sku) : "");
  }, [sku, productId, janaushadhi]);

  const save = useCallback(async () => {
    if (!janaushadhi) return;
    const t = value.trim();
    if (!janaushadhi || !t) {
      setErr(null);
      if (!t) setValue(formValue);
      return;
    }
    if (t === formValue) {
      setErr(null);
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugCode: t }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setValue(formValue);
    } finally {
      setPending(false);
    }
  }, [productId, janaushadhi, value, formValue, router]);

  if (!janaushadhi) {
    return <span className="text-zinc-400">—</span>;
  }

  if (!canEdit) {
    return (
      <span className="font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400" title={shown}>
        {shown || "—"}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <input
        aria-label="Drug code"
        placeholder="0000"
        title="Required for Janaushadhi. Stored as JAN…; search at POS by number only"
        inputMode="numeric"
        autoComplete="off"
        className={
          compact
            ? "w-full min-w-0 rounded border border-zinc-300 bg-white px-1 py-1 font-mono text-[11px] tabular-nums text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm tabular-nums text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          setErr(null);
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {err && !compact ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
