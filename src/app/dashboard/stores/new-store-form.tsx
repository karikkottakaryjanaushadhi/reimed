"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewStoreForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [billShopName, setBillShopName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [drugLicenseLine, setDrugLicenseLine] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          billShopName: billShopName || undefined,
          address: address || undefined,
          phone: phone || undefined,
          gstin: gstin || undefined,
          drugLicenseLine: drugLicenseLine || undefined,
          email: email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      await fetch("/api/session/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: data.store.id }),
      });
      setName("");
      setBillShopName("");
      setAddress("");
      setPhone("");
      setGstin("");
      setDrugLicenseLine("");
      setEmail("");
      setMsg("Store created. Switched to new store.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New store / branch</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          required
          placeholder="Store name (short / branch)"
          className="rounded-lg border border-zinc-300 px-2 py-2 sm:col-span-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Bill shop name (optional, printed on bills)"
          className="rounded-lg border border-zinc-300 px-2 py-2 sm:col-span-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={billShopName}
          onChange={(e) => setBillShopName(e.target.value)}
        />
        <textarea
          placeholder="Address"
          rows={2}
          className="rounded-lg border border-zinc-300 px-2 py-2 sm:col-span-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <input
          placeholder="Phone(s)"
          className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          placeholder="Email"
          type="email"
          className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="GSTIN"
          className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={gstin}
          onChange={(e) => setGstin(e.target.value)}
        />
        <input
          placeholder="Drug licence line"
          className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
          value={drugLicenseLine}
          onChange={(e) => setDrugLicenseLine(e.target.value)}
        />
      </div>
      {msg && <p className="mt-2 text-sm text-brand-green">{msg}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-4 py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create store"}
      </button>
    </form>
  );
}
