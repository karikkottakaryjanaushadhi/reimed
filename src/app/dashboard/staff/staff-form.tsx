"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StaffDeleteButton } from "./staff-delete-button";

export type StaffFormInitial = {
  storeUserId: string;
  email: string;
  name: string;
  role: "MANAGER" | "CASHIER";
  active: boolean;
};

export function StaffForm({
  storeId,
  initial,
}: {
  storeId: string;
  initial?: StaffFormInitial;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const [username, setUsername] = useState(initial?.email ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"MANAGER" | "CASHIER">(initial?.role ?? "CASHIER");
  const [active, setActive] = useState(initial?.active ?? true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      if (isEdit && initial) {
        const res = await fetch(`/api/stores/${storeId}/staff/${initial.storeUserId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            role,
            active,
            ...(password.trim() ? { password: password.trim() } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErr((data as { error?: string }).error || "Failed");
          return;
        }
        router.push("/dashboard/staff");
        router.refresh();
        return;
      }

      const res = await fetch(`/api/stores/${storeId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, name, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Failed");
        return;
      }
      setMsg("Staff saved.");
      setUsername("");
      setName("");
      setPassword("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {isEdit ? "Edit staff" : "Invite / add staff"}
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          required={!isEdit}
          readOnly={isEdit}
          type="text"
          autoComplete="username"
          placeholder="User Name"
          className={`rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950 ${
            isEdit ? "text-zinc-500" : ""
          }`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          required
          placeholder="Display name"
          className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          required={!isEdit}
          type="password"
          placeholder={isEdit ? "New password (optional)" : "Temp password"}
          className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={role}
          onChange={(e) => setRole(e.target.value as "MANAGER" | "CASHIER")}
        >
          <option value="CASHIER">Cashier (billing only)</option>
          <option value="MANAGER">Manager (full store)</option>
        </select>
        {isEdit ? (
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:col-span-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Active (can sign in)
          </label>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-sm text-brand-green">{msg}</p> : null}
      {err ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-4 py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add to store"}
        </button>
        {isEdit && initial ? (
          <StaffDeleteButton storeId={storeId} storeUserId={initial.storeUserId} name={initial.name} />
        ) : null}
      </div>
    </form>
  );
}
