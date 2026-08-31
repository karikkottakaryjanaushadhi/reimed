"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StaffDeleteButton({
  storeId,
  storeUserId,
  name,
}: {
  storeId: string;
  storeUserId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      `Remove “${name}” from this store?\n\nThey can no longer sign in to this branch. Their login may still work at other stores. This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/stores/${storeId}/staff/${storeUserId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error || "Delete failed");
        return;
      }
      router.push("/dashboard/staff");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onDelete()}
        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
      >
        {busy ? "Removing…" : "Delete"}
      </button>
      {err ? <span className="ml-2 text-xs text-red-600 dark:text-red-400">{err}</span> : null}
    </span>
  );
}
