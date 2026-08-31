"use client";

import { useState } from "react";

export function MarginGate({
  configured,
  loading,
  onUnlock,
}: {
  configured: boolean;
  loading?: boolean;
  onUnlock: (password: string) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onUnlock(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!configured) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 className="font-semibold">Margin view not configured</h2>
        <p className="mt-2 text-amber-900/90 dark:text-amber-200/90">
          Ask your administrator to set <code className="text-xs">ADMIN_PASSWORD</code> in the server environment,
          then restart the app.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Margin access</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter the margin password to view cost and profit. Required once on this page; filters and tabs will not ask
        again until you leave Margin details.
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Password</span>
          <input
            type="password"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading || submitting}
          />
        </label>
        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || submitting || !password}
          className="touch-manipulation w-full rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading || submitting ? "Loading…" : "View margin details"}
        </button>
      </form>
    </div>
  );
}
