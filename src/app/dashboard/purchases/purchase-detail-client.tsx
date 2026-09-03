"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { DatePickerInput } from "@/components/date-picker-input";
import { PurchaseEditingInProgressSwitch } from "./purchase-editing-in-progress-switch";
import {
  PurchaseLinesEditor,
  type PurchaseLineDraft,
  type PurchaseLinesEditorHandle,
} from "./purchase-lines-editor";

type SupplierOpt = { id: string; name: string };

const fieldCls =
  "mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const primaryBtnCls =
  "w-full rounded-xl bg-gradient-to-r from-brand-blue to-brand-green py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50";

export function PurchaseDetailClient({
  purchaseId,
  initialSupplierId,
  initialSupplierName,
  initialInvoiceRef,
  initialInvoiceDate,
  initialLocked,
  lines,
}: {
  purchaseId: string;
  initialSupplierId: string;
  initialSupplierName: string;
  initialInvoiceRef: string | null;
  initialInvoiceDate: string | null;
  initialLocked: boolean;
  lines: PurchaseLineDraft[];
}) {
  const router = useRouter();
  const linesEditorRef = useRef<PurchaseLinesEditorHandle>(null);
  const invoiceRefInputRef = useRef<HTMLInputElement>(null);
  const invoiceDateRef = useRef<HTMLInputElement>(null);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([
    { id: initialSupplierId, name: initialSupplierName },
  ]);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [invoiceRef, setInvoiceRef] = useState(initialInvoiceRef ?? "");
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDate ?? "");
  const [locked, setLocked] = useState(initialLocked);
  const [editingInProgress, setEditingInProgress] = useState(!initialLocked);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function clearFeedback() {
    setMsg(null);
    setErr(null);
  }

  function onHeaderFieldEnter(e: KeyboardEvent, next: () => void) {
    if (e.key !== "Enter" || fieldsDisabled) return;
    e.preventDefault();
    next();
  }

  useEffect(() => {
    setLocked(initialLocked);
    setEditingInProgress(!initialLocked);
    setSupplierId(initialSupplierId);
    setInvoiceRef(initialInvoiceRef ?? "");
    setInvoiceDate(initialInvoiceDate ?? "");
    setErr(null);
    setMsg(null);
  }, [
    purchaseId,
    initialLocked,
    initialSupplierId,
    initialInvoiceRef,
    initialInvoiceDate,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/suppliers");
        const data = await res.json();
        if (cancelled || !res.ok) return;
        let list = (data.suppliers ?? []) as SupplierOpt[];
        if (!list.some((s) => s.id === initialSupplierId)) {
          list = [{ id: initialSupplierId, name: initialSupplierName }, ...list];
        }
        setSuppliers(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSupplierId, initialSupplierName]);

  const postPurchase = useCallback(async () => {
    if (locked) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const lineErr = await linesEditorRef.current?.persistLines();
      if (lineErr) {
        setErr(lineErr);
        return;
      }

      const body: Record<string, unknown> = {
        supplierId,
        invoiceRef: invoiceRef.trim() || null,
        invoiceDate: invoiceDate.trim() || null,
      };
      if (!editingInProgress) {
        body.complete = true;
      }
      const res = await fetch(`/api/purchases/${purchaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (!editingInProgress) {
        setLocked(true);
        setMsg("Purchase finalized.");
      } else {
        setMsg("Purchase saved.");
      }
      await router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }, [
    locked,
    purchaseId,
    supplierId,
    invoiceRef,
    invoiceDate,
    editingInProgress,
    router,
  ]);

  const postPurchaseRef = useRef(postPurchase);
  postPurchaseRef.current = postPurchase;

  useEffect(() => {
    const onDoc = (e: globalThis.KeyboardEvent) => {
      if (locked) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      void postPurchaseRef.current();
    };
    window.addEventListener("keydown", onDoc, true);
    return () => window.removeEventListener("keydown", onDoc, true);
  }, [locked]);

  const fieldsDisabled = locked || saving;

  return (
    <div className="space-y-5">
      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <div className="space-y-3">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Supplier &amp; invoice</h2>
          <p className="text-xs text-zinc-500">
            {locked
              ? "This purchase is finalized — supplier and invoice are view only."
              : "Edit supplier and invoice here. Line changes (edit, add, remove) are saved together with Save Purchase below — same workflow as new purchase. Turn off Editing in progress when you want this purchase locked (view only)."}
          </p>
          <div className="mt-1 grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="text-zinc-500">
                Supplier <span className="text-red-600 dark:text-red-400" aria-hidden>*</span>
              </span>
              <select
                className={fieldCls}
                value={supplierId}
                disabled={fieldsDisabled}
                onChange={(e) => {
                  clearFeedback();
                  setSupplierId(e.target.value);
                }}
                onKeyDown={(e) =>
                  onHeaderFieldEnter(e, () => invoiceRefInputRef.current?.focus())
                }
                aria-label="Supplier"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-zinc-500">Invoice ref</span>
              <input
                ref={invoiceRefInputRef}
                className={fieldCls}
                value={invoiceRef}
                disabled={fieldsDisabled}
                onChange={(e) => {
                  clearFeedback();
                  setInvoiceRef(e.target.value);
                }}
                onKeyDown={(e) =>
                  onHeaderFieldEnter(e, () => invoiceDateRef.current?.focus())
                }
              />
            </label>
            <label className="text-sm">
              <span className="text-zinc-500">Invoice date</span>
              <DatePickerInput
                ref={invoiceDateRef}
                className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
                wrapperClassName="mt-1 w-full"
                value={invoiceDate}
                disabled={fieldsDisabled}
                onChange={(e) => {
                  clearFeedback();
                  setInvoiceDate(e.target.value);
                }}
                onKeyDown={(e) =>
                  onHeaderFieldEnter(e, () => linesEditorRef.current?.focusAddProductSearch())
                }
              />
            </label>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200 pt-5 dark:border-zinc-700">
        <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Items</h2>
        <div className={`mt-3 ${!locked ? "pb-28" : ""}`}>
          <PurchaseLinesEditor ref={linesEditorRef} purchaseId={purchaseId} lines={lines} disabled={locked} />
        </div>
      </div>

      {!locked ? (
        <div className="sticky bottom-0 z-20 -mx-4 space-y-3 border-t border-zinc-200 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.15)] backdrop-blur supports-[backdrop-filter]:bg-white/90 dark:border-zinc-700 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/90 sm:-mx-0 sm:rounded-b-2xl sm:px-0">
          <PurchaseEditingInProgressSwitch
            checked={editingInProgress}
            disabled={saving}
            onCheckedChange={(next) => {
              clearFeedback();
              setEditingInProgress(next);
            }}
          />
          {msg ? <p className="text-sm text-brand-green">{msg}</p> : null}
          {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}
          <button
            type="button"
            disabled={saving || !supplierId || !invoiceRef.trim() || !invoiceDate.trim()}
            className={primaryBtnCls}
            onClick={() => void postPurchase()}
          >
            {saving ? "Saving…" : "Save Purchase"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
