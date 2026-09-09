"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function StockGenericNameField({
  productId,
  genericName,
  canEdit,
  compact,
}: {
  productId: string;
  genericName: string | null;
  canEdit: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const saved = genericName ?? "";
  const [value, setValue] = useState(saved);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(genericName ?? "");
  }, [genericName, productId]);

  const save = useCallback(async () => {
    const t = value.trim();
    if (t === saved.trim()) {
      setErr(null);
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genericName: t }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setValue(saved);
    } finally {
      setPending(false);
    }
  }, [productId, saved, value, router]);

  const display = genericName?.trim() || "—";

  if (!canEdit) {
    return (
      <span className="block truncate text-zinc-600 dark:text-zinc-400" title={display}>
        {display}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <input
        aria-label="Generic name"
        className={
          compact
            ? "w-full min-w-0 rounded border border-zinc-300 bg-white px-1 py-1 text-[11px] text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
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
      {err ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
