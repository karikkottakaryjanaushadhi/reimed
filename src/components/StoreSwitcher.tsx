"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Store = { id: string; name: string; role: string };

export function StoreSwitcher({ stores, activeStoreId }: { stores: Store[]; activeStoreId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(storeId: string) {
    if (storeId === activeStoreId) return;
    setBusy(true);
    try {
      await fetch("/api/session/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex min-w-0 items-center gap-1.5 text-sm sm:gap-2">
      <span className="hidden shrink-0 text-zinc-500 sm:inline">Store</span>
      <select
        className="max-w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        value={activeStoreId}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.role})
          </option>
        ))}
      </select>
    </label>
  );
}
