"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BILL_TERMS_PLACEHOLDER } from "@/lib/dotmatrix-receipt";
import { StoreDeleteButton } from "./store-delete-button";

export type StoreEditInitial = {
  id: string;
  name: string;
  billShopName: string | null;
  address: string | null;
  phone: string | null;
  gstin: string | null;
  drugLicenseLine: string | null;
  email: string | null;
  billTerms: string | null;
};

export function StoreEditForm({ initial }: { initial: StoreEditInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [billShopName, setBillShopName] = useState(initial.billShopName ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [gstin, setGstin] = useState(initial.gstin ?? "");
  const [drugLicenseLine, setDrugLicenseLine] = useState(initial.drugLicenseLine ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [billTerms, setBillTerms] = useState(initial.billTerms ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/stores/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          billShopName,
          address,
          phone,
          gstin,
          drugLicenseLine,
          email,
          billTerms,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg((data as { error?: string }).error || "Failed to save");
        return;
      }
      setMsg("Saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">Name (short / branch)</span>
          <input
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">Bill shop name (printed title)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={billShopName}
            onChange={(e) => setBillShopName(e.target.value)}
            placeholder="e.g. PM-JAY Kendra — large heading on dot-matrix bill"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">Address</span>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">Drug licence number(s)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={drugLicenseLine}
            onChange={(e) => setDrugLicenseLine(e.target.value)}
            placeholder="RLF20KL2025002347, RLF21KL2025002336"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Contact number(s)</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="8281182828, 9633058038"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Email</span>
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">GSTIN</span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={gstin}
            onChange={(e) => setGstin(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-zinc-600 dark:text-zinc-400">Bill footer (optional)</span>
          <textarea
            rows={6}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-950"
            value={billTerms}
            onChange={(e) => setBillTerms(e.target.value)}
            placeholder={BILL_TERMS_PLACEHOLDER}
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Saved for reference only — printed bills always use “Get well soon” and “Pharmacist Sign” (jan-bill style).
          </span>
        </label>
      </div>
      {msg && (
        <p className={`text-sm ${msg === "Saved." ? "text-brand-green" : "text-red-600"}`} role="status">
          {msg}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-4 py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save shop details"}
        </button>
        <StoreDeleteButton storeId={initial.id} storeName={initial.name} />
      </div>
    </form>
  );
}
