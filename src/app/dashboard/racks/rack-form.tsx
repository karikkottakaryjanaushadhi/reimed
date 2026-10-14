"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RackDeleteButton } from "./rack-delete-button";

export type RackFormInitial = {
  id: string;
  code: string;
};

const field =
  "rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950";

export function RackForm({ initial }: { initial?: RackFormInitial }) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const [code, setCode] = useState(initial?.code ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(isEdit ? `/api/racks/${initial!.id}` : "/api/racks", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error || "Failed");
        return;
      }
      if (isEdit) {
        router.push("/dashboard/racks");
        router.refresh();
        return;
      }
      setCode("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {!isEdit ? (
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Add rack</h2>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <input
          required
          placeholder="Rack code (e.g. A1, A2, Z10)"
          className={`min-w-[12rem] flex-1 ${field}`}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add rack"}
        </button>
        {isEdit && initial ? <RackDeleteButton id={initial.id} code={initial.code} /> : null}
      </div>
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
    </form>
  );
}
