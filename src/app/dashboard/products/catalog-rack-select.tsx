"use client";

import { useCallback, useEffect, useState } from "react";

export type CatalogRackOption = { id: string; code: string };

export function CatalogRackSelect({
  value,
  onChange,
  labelCls,
  inputCls,
  wrapClassName,
  selectProps,
}: {
  value: string | null;
  onChange: (rackId: string | null) => void;
  labelCls: string;
  inputCls: string;
  wrapClassName?: string;
  selectProps?: React.SelectHTMLAttributes<HTMLSelectElement> & {
    "data-np-field"?: string;
  };
}) {
  const [racks, setRacks] = useState<CatalogRackOption[]>([]);

  const loadRacks = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/racks", { signal });
      const data = (await res.json().catch(() => ({}))) as { racks?: CatalogRackOption[] };
      if (res.ok) setRacks(data.racks ?? []);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadRacks(ac.signal);
    return () => ac.abort();
  }, [loadRacks]);

  return (
    <label className={wrapClassName ?? "flex min-w-0 flex-1 flex-col gap-1"}>
      <span className={labelCls}>Rack</span>
      <select
        className={inputCls}
        aria-label="Product rack"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? e.target.value : null)}
        {...selectProps}
      >
        <option value="">None</option>
        {racks.map((r) => (
          <option key={r.id} value={r.id}>
            {r.code}
          </option>
        ))}
      </select>
    </label>
  );
}
