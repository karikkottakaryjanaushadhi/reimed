"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SupplierDeleteButton } from "./supplier-delete-button";

export type SupplierFormInitial = {
  id: string;
  name: string;
  company: string | null;
  contactPerson: string | null;
  phone: string | null;
  phoneAlt: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  drugLicense1: string | null;
  drugLicense2: string | null;
};

const field =
  "rounded-lg border border-zinc-300 px-2 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950";

export function SupplierForm({ initial }: { initial?: SupplierFormInitial }) {
  const router = useRouter();
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [phoneAlt, setPhoneAlt] = useState(initial?.phoneAlt ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [gstin, setGstin] = useState(initial?.gstin ?? "");
  const [drugLicense1, setDrugLicense1] = useState(initial?.drugLicense1 ?? "");
  const [drugLicense2, setDrugLicense2] = useState(initial?.drugLicense2 ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      name,
      company: company || undefined,
      contactPerson: contactPerson || undefined,
      phone: phone || undefined,
      phoneAlt: phoneAlt || undefined,
      email: email || undefined,
      address: address || undefined,
      gstin: gstin || undefined,
      drugLicense1: drugLicense1 || undefined,
      drugLicense2: drugLicense2 || undefined,
    };
    try {
      const res = await fetch(isEdit ? `/api/suppliers/${initial!.id}` : "/api/suppliers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error || "Failed");
        return;
      }
      if (isEdit) {
        router.push("/dashboard/suppliers");
        router.refresh();
        return;
      }
      setName("");
      setCompany("");
      setContactPerson("");
      setPhone("");
      setPhoneAlt("");
      setEmail("");
      setAddress("");
      setGstin("");
      setDrugLicense1("");
      setDrugLicense2("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input
          required
          placeholder="Supplier name *"
          className={`min-w-0 sm:col-span-2 lg:col-span-1 ${field}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Company / trade name"
          className={`min-w-0 ${field}`}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <input
          placeholder="Contact person"
          className={`min-w-0 ${field}`}
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
        />
        <input
          placeholder="Phone"
          className={`min-w-0 ${field}`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          placeholder="Alt. phone"
          className={`min-w-0 ${field}`}
          value={phoneAlt}
          onChange={(e) => setPhoneAlt(e.target.value)}
        />
        <input
          placeholder="Email"
          type="email"
          className={`min-w-0 ${field}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="GSTIN / TIN"
          className={`min-w-0 ${field}`}
          value={gstin}
          onChange={(e) => setGstin(e.target.value)}
        />
        <input
          placeholder="Drug licence 1"
          className={`min-w-0 ${field}`}
          value={drugLicense1}
          onChange={(e) => setDrugLicense1(e.target.value)}
        />
        <input
          placeholder="Drug licence 2"
          className={`min-w-0 ${field}`}
          value={drugLicense2}
          onChange={(e) => setDrugLicense2(e.target.value)}
        />
        <input
          placeholder="Address"
          className={`min-w-0 sm:col-span-2 lg:col-span-3 ${field}`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-4 py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add supplier"}
        </button>
        {isEdit && initial ? (
          <SupplierDeleteButton id={initial.id} name={initial.name} />
        ) : null}
      </div>
    </form>
  );
}
