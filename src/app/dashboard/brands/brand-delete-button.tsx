"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BrandDeleteButton({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      `Delete brand “${name}”?\n\nProducts using this brand will have their brand cleared. This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error || "Delete failed");
        return;
      }
      router.push("/dashboard/brands");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onDelete()}
        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {err ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">{err}</span> : null}
    </span>
  );
}
