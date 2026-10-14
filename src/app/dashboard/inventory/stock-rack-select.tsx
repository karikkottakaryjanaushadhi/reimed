"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function StockRackSelect({
  productId,
  rackId,
  rackCode,
  racks,
  canEdit,
  compact,
}: {
  productId: string;
  rackId: string | null;
  rackCode: string | null;
  racks: { id: string; code: string }[];
  canEdit: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(rackId ?? "");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setValue(rackId ?? "");
  }, [rackId]);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value;
      const nextRackId = v === "" ? null : v;
      setValue(v);
      setErr(null);
      setPending(true);
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rackId: nextRackId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Update failed");
        router.refresh();
      } catch (x) {
        setErr(x instanceof Error ? x.message : "Failed");
        setValue(rackId ?? "");
      } finally {
        setPending(false);
      }
    },
    [productId, rackId, router],
  );

  if (!canEdit) {
    const display = rackCode?.trim() || "—";
    return (
      <span
        className={
          compact
            ? "block max-w-[4.5rem] truncate text-[11px] text-zinc-600 dark:text-zinc-400"
            : "block min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-400"
        }
        title={display}
      >
        {display}
      </span>
    );
  }

  const orphanRack =
    rackId && !racks.some((r) => r.id === rackId)
      ? ({ id: rackId, code: rackCode?.trim() || "Unknown" } as const)
      : null;

  return (
    <div className={compact ? "flex min-w-0 max-w-[4.75rem] flex-col gap-0.5" : "flex w-full min-w-0 flex-col gap-0.5"}>
      <select
        value={value}
        onChange={(e) => void onChange(e)}
        disabled={pending}
        aria-label="Product rack"
        className={
          compact
            ? "w-full max-w-full rounded border border-zinc-300 bg-white px-1 py-1 text-[11px] text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            : "w-full min-w-0 max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 shadow-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        }
      >
        <option value="">None</option>
        {orphanRack ? <option value={orphanRack.id}>{orphanRack.code}</option> : null}
        {racks.map((r) => (
          <option key={r.id} value={r.id}>
            {r.code}
          </option>
        ))}
      </select>
      {err ? <span className="text-[11px] text-red-600 dark:text-red-400">{err}</span> : null}
    </div>
  );
}
