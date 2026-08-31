"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ from }: { from: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Login failed");
        return;
      }
      router.push(from.startsWith("/") ? from : "/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-8 shadow-[0_0_0_1px_rgba(0,120,215,0.15),0_20px_50px_-20px_rgba(50,205,50,0.12)]">
        <div className="mb-6 flex justify-center">
          <Image
            src="/reimed-logo.png"
            alt="REIMED"
            width={476}
            height={389}
            className="h-28 w-auto rounded-lg bg-white p-2 sm:h-32"
            priority
            unoptimized
          />
        </div>
        <h1 className="text-center text-2xl font-semibold text-zinc-50">Sign in</h1>
        <p className="mt-1 text-center text-sm text-zinc-500">Use your store account to continue</p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Login</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-black px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-brand-blue"
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Password</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-black px-3 py-2 text-zinc-50 outline-none focus:ring-2 focus:ring-brand-blue"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-brand-blue to-brand-green py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
