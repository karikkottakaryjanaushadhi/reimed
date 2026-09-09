"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function StockProductNameField({
  productId,
  name,
  canEdit,
  compact,
}: {
  productId: string;
  name: string;
  canEdit: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(name);
  }, [name, productId]);

  const save = useCallback(async () => {
    const t = value.trim();
    if (!t) {
      setErr("Name required");
      setValue(name);
      return;
    }
    if (t === name.trim()) {
      setErr(null);
      return;
    }
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: t }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setValue(name);
    } finally {
      setPending(false);
    }
  }, [productId, name, value, router]);

  if (!canEdit) {
    return (
      <span className="break-words" title={name}>
        {name}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <input
        aria-label="Product name"
        className={
          compact
            ? "w-full min-w-0 rounded border border-zinc-300 bg-white px-1 py-1 text-[11px] text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
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
