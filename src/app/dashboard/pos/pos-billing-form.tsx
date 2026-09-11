"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NumericTableInput } from "@/components/numeric-table-input";
import { roundBillGrandTotal } from "@/lib/bill-round";
import { defaultSalePaid } from "@/lib/sale-paid";
import { computePosSaleLineMoney } from "@/lib/sale-checkout-resolve";
import { saleLineMarginPercent } from "@/lib/sale-line";
import {
  isPlaceholderCustomerName,
  isPlaceholderDoctorName,
} from "@/lib/sale-placeholders";
import type { CartLine } from "./cart-types";
import {
  applyMrpDiscountAmountToLine,
  applyMrpDiscountPctToLine,
  discountPctOffMrpFromSavedLine,
  effectiveLineDiscountPct,
  formatLotExpiry,
  round2,
  syncMrpDiscountFields,
} from "./pos-line-helpers";
import {
  DraftLineController,
  DraftLineMobileCard,
  DraftLinePortals,
  DraftLineTableRow,
} from "./pos-draft-line";

import {
  POS_CUSTOMER_FIELD_CLASS,
  POS_CUSTOMER_GRID_CLASS,
  POS_FIELD_INPUT_CLASS,
  POS_PRIMARY_CTA_CLASS,
  POS_TABLE_CLASS,
  POS_TABLE_SCROLL_WRAP_CLASS,
  LINE_TABLE_SLNO_COL,
} from "./pos-billing-ui";
import { PosSavedBillPanel, type PosSavedBillSummary } from "./pos-saved-bill-panel";
import { PosNameCombobox } from "./pos-name-combobox";
import { FormDraftResumeBanner } from "@/components/form-draft-resume-banner";
import { useFormDraft } from "@/hooks/use-form-draft";
import {
  buildPosBillingDraft,
  isPosBillingDraftEmpty,
  posBillingDraftKey,
  type PosBillingDraft,
} from "./pos-billing-draft";

type SaleLoadLine = {
  productId: string;
  lotId: string;
  name: string;
  packSize: number;
  batchNo: string;
  expiryDate: string;
  mrp: number;
  costPrice: number;
  lotQuantity: number;
  qty: number;
  rate: number;
  discountAmount: number;
  gstPct: number;
};

export function PosBillingForm({
  editSaleId,
  storeId,
}: {
  editSaleId?: string;
  storeId?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(editSaleId);
  const billingTableScrollRef = useRef<HTMLDivElement>(null);
  const customerNameRef = useRef<HTMLInputElement>(null);
  const doctorNameRef = useRef<HTMLInputElement>(null);
  const customerPhoneRef = useRef<HTMLInputElement>(null);
  const paymentModeRef = useRef<HTMLSelectElement>(null);
  const cashReceivedRef = useRef<HTMLInputElement>(null);
  const paidCheckboxRef = useRef<HTMLInputElement>(null);
  const checkoutBtnRef = useRef<HTMLButtonElement>(null);
  const paidTouchedRef = useRef(false);

  const focusCustomerName = useCallback(() => {
    requestAnimationFrame(() => customerNameRef.current?.focus());
  }, []);

  function onCustomerFieldEnter(e: KeyboardEvent, next: () => void) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    next();
  }
  const [cart, setCart] = useState<CartLine[]>([]);
  /** Bump to reset draft row state after a line is committed */
  const [draftKey, setDraftKey] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [paid, setPaid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editBillNo, setEditBillNo] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [savedBill, setSavedBill] = useState<PosSavedBillSummary | null>(null);

  const posDraftEnabled = !isEdit && Boolean(storeId);

  const posDraftSnapshot = useMemo(
    () =>
      buildPosBillingDraft({
        cart,
        customerName,
        customerPhone,
        doctorName,
        paymentMode,
        paid,
        cashReceived: cashReceivedInput,
      }),
    [cart, customerName, customerPhone, doctorName, paymentMode, paid, cashReceivedInput],
  );

  const {
    pendingRestore: pendingPosDraft,
    hasPendingRestore: hasPendingPosDraft,
    restoreDraft: restorePosDraft,
    discardDraft: discardPosDraft,
    clearSavedDraft: clearPosSavedDraft,
  } = useFormDraft({
    storageKey: storeId ? posBillingDraftKey(storeId) : "reimed:v1:draft:pos-billing:disabled",
    value: posDraftSnapshot,
    isEmpty: isPosBillingDraftEmpty,
    enabled: posDraftEnabled,
  });

  const applyPosBillingDraft = useCallback((d: PosBillingDraft) => {
    setCart(d.cart);
    setCustomerName(d.customerName);
    setCustomerPhone(d.customerPhone);
    setDoctorName(d.doctorName);
    setPaymentMode(d.paymentMode);
    setPaid(d.paid ?? defaultSalePaid(d.paymentMode));
    setCashReceivedInput(d.cashReceived ?? "");
    paidTouchedRef.current = true;
    setDraftKey((k) => k + 1);
    setMsg(null);
    setSavedBill(null);
  }, []);

  useEffect(() => {
    if (paidTouchedRef.current) return;
    setPaid(defaultSalePaid(paymentMode));
  }, [paymentMode]);

  useEffect(() => {
    if (!editSaleId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/sales/${editSaleId}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || "Could not load bill");
          return;
        }
        const sale = data.sale as {
          editable: boolean;
          billNo: number;
          customerName: string | null;
          customerPhone: string | null;
          doctorName: string | null;
          paymentMode: string;
          paid: boolean;
          cashReceived: number | null;
          lines: SaleLoadLine[];
        };
        if (!sale.editable) {
          setLoadError("Bills with returns cannot be edited.");
          return;
        }
        setEditBillNo(sale.billNo);
        setCustomerName(isPlaceholderCustomerName(sale.customerName) ? "" : (sale.customerName ?? ""));
        setCustomerPhone(sale.customerPhone ?? "");
        setDoctorName(isPlaceholderDoctorName(sale.doctorName) ? "" : (sale.doctorName ?? ""));
        setPaymentMode(sale.paymentMode || "CASH");
        setPaid(sale.paid);
        setCashReceivedInput(
          sale.cashReceived != null && Number.isFinite(sale.cashReceived)
            ? String(sale.cashReceived)
            : "",
        );
        paidTouchedRef.current = true;
        setCart(
          sale.lines.map((l) => ({
            productId: l.productId,
            lotId: l.lotId,
            name: l.name,
            batchNo: l.batchNo,
            expiryDate: l.expiryDate.slice(0, 10),
            packSize: l.packSize,
            gstPct: l.gstPct,
            qty: l.qty,
            reservedQty: l.qty,
            maxQty: l.lotQuantity + l.qty,
            mrp: l.mrp,
            costPrice: l.costPrice,
            rate: l.rate,
            discountPct: discountPctOffMrpFromSavedLine({ rate: l.rate, mrp: l.mrp }),
            discountFromLotOnly: true,
          })),
        );
      } catch {
        if (!cancelled) setLoadError("Could not load bill");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editSaleId]);

  function upsertCartLine(line: CartLine) {
    setCart((c) => {
      const existing = c.find((x) => x.lotId === line.lotId);
      if (existing) {
        const cap = Math.max(
          existing.maxQty > 0 ? existing.maxQty : 0,
          line.maxQty > 0 ? line.maxQty : 0,
        ) || 999999;
        const mergedQty = Math.min(cap, existing.qty + line.qty);
        const merged: CartLine = {
          ...existing,
          qty: mergedQty,
          maxQty: cap === 999999 ? existing.maxQty : cap,
        };
        return c.map((x) => (x.lotId === line.lotId ? merged : x));
      }
      return [...c.filter((x) => x.lotId !== line.lotId), line];
    });
    setMsg(null);
    setSavedBill(null);
  }

  function removeCartLine(lotId: string) {
    setCart((c) => c.filter((x) => x.lotId !== lotId));
    setMsg(null);
    setSavedBill(null);
  }

  /** Line gross before discount; updates implied rate for API */
  function updateCartLineGross(lotId: string, raw: number) {
    setCart((c) =>
      c.map((line) => {
        if (line.lotId !== lotId) return line;
        let gross = Number(raw);
        if (!Number.isFinite(gross) || gross < 0) gross = 0;
        const q = Math.max(1, line.qty);
        const ps = Math.max(1, Math.trunc(line.packSize) || 1);
        const rate = round2((gross * ps) / q);
        const synced = syncMrpDiscountFields(line.mrp, rate < 0 ? 0 : rate);
        return { ...line, ...synced, discountFromLotOnly: true };
      }),
    );
    setMsg(null);
  }

  function updateCartQty(lotId: string, raw: string) {
    setCart((c) =>
      c.map((line) => {
        if (line.lotId !== lotId) return line;
        if (raw.trim() === "") return { ...line, qty: 0 };
        let q = Math.floor(Number(raw));
        if (!Number.isFinite(q)) return line;
        if (q < 0) q = 0;
        const cap = line.maxQty > 0 ? line.maxQty : 999999;
        if (q > cap) q = cap;
        return { ...line, qty: q };
      }),
    );
    setMsg(null);
  }

  function commitCartQty(lotId: string) {
    setCart((c) =>
      c.map((line) => {
        if (line.lotId !== lotId) return line;
        return normalizeCartLineQty(line);
      }),
    );
    setMsg(null);
  }

  function normalizeCartLineQty(line: CartLine): CartLine {
    let q = line.qty;
    if (!Number.isFinite(q) || q < 1) q = 1;
    const cap = line.maxQty > 0 ? line.maxQty : 999999;
    if (q > cap) q = cap;
    return { ...line, qty: q };
  }

  function updateCartDiscountPct(lotId: string, raw: number) {
    setCart((c) =>
      c.map((line) => {
        if (line.lotId !== lotId) return line;
        const { rate, discountPct } = applyMrpDiscountPctToLine(line.mrp, raw);
        return { ...line, rate, discountPct, discountFromLotOnly: true };
      }),
    );
    setMsg(null);
  }

  function updateCartDiscountAmount(lotId: string, raw: number) {
    setCart((c) =>
      c.map((line) => {
        if (line.lotId !== lotId) return line;
        const { rate, discountPct } = applyMrpDiscountAmountToLine(
          line.qty,
          line.mrp,
          line.packSize,
          raw,
        );
        return { ...line, rate, discountPct, discountFromLotOnly: true };
      }),
    );
    setMsg(null);
  }

  const { discountSum, taxSum, roundOff, total, netExclusiveTotal } = useMemo(() => {
    let disc = 0;
    let gst = 0;
    let netSum = 0;
    let netEx = 0;
    for (const l of cart) {
      const gstPct = l.gstPct ?? 0;
      const eff = effectiveLineDiscountPct(l.rate, l.mrp, l.discountPct, l.discountFromLotOnly);
      const m = computePosSaleLineMoney({
        qty: l.qty,
        rate: l.rate,
        mrp: l.mrp,
        packSize: l.packSize,
        discountPctOffRate: eff,
        gstPct,
      });
      disc += m.discountAmount;
      gst += m.gstAmount;
      netSum += round2(m.lineInclusiveTotal);
      netEx += m.netExclusive;
    }
    const rounded = roundBillGrandTotal(round2(netSum));
    return {
      discountSum: round2(disc),
      taxSum: round2(gst),
      roundOff: rounded.roundOff,
      total: rounded.total,
      netExclusiveTotal: round2(netEx),
    };
  }, [cart]);

  const cashReceivedAmount = useMemo(() => {
    const t = cashReceivedInput.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return null;
    return round2(n);
  }, [cashReceivedInput]);

  const cashBalance =
    paymentMode === "CASH" && cashReceivedAmount != null
      ? round2(cashReceivedAmount - total)
      : null;

  const checkout = useCallback(async () => {
    const normalizedCart = cart.map(normalizeCartLineQty);
    setCart(normalizedCart);
    setBusy(true);
    setMsg(null);
    const parsedCash = (() => {
      const t = cashReceivedInput.trim();
      if (!t) return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) return null;
      return round2(n);
    })();
    const payload = {
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      doctorName: doctorName || undefined,
      paymentMode,
      paid,
      cashReceived: paymentMode === "CASH" ? parsedCash : null,
      lines: normalizedCart.map((l) => ({
        productId: l.productId,
        lotId: l.lotId,
        qty: l.qty,
        rate: l.rate,
        discountPct: effectiveLineDiscountPct(l.rate, l.mrp, l.discountPct, l.discountFromLotOnly),
      })),
    };
    try {
      const res = await fetch(isEdit ? `/api/sales/${editSaleId}` : "/api/sales", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || (isEdit ? "Update failed" : "Sale failed"));
        return;
      }
      if (isEdit) {
        setMsg(`Bill #${data.sale.billNo} updated.`);
        router.push(`/dashboard/sales/${data.sale.id}`);
        return;
      }
      setSavedBill({
        saleId: data.sale.id,
        customerName: customerName.trim() || "—",
        doctorName: doctorName.trim() || "—",
        discount: discountSum,
        total,
      });
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setDoctorName("");
      setPaymentMode("CASH");
      setPaid(true);
      setCashReceivedInput("");
      paidTouchedRef.current = false;
      clearPosSavedDraft();
    } finally {
      setBusy(false);
    }
  }, [cart, cashReceivedInput, clearPosSavedDraft, customerName, customerPhone, discountSum, doctorName, editSaleId, isEdit, paid, paymentMode, router, total]);

  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      const saveBill = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s";
      if (!saveBill) return;
      if (busy || cart.length === 0 || total < 0) return;
      e.preventDefault();
      e.stopPropagation();
      void checkout();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [busy, cart.length, checkout, total]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading bill…</p>;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
        <Link href="/dashboard/sales" className="text-sm font-medium text-brand-blue-light hover:underline">
          ← Sales history
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-3">
      {hasPendingPosDraft && pendingPosDraft ? (
        <FormDraftResumeBanner
          title="Unsaved sales bill found on this device"
          savedAt={pendingPosDraft.savedAt}
          onRestore={() => {
            const data = restorePosDraft();
            if (data) applyPosBillingDraft(data);
          }}
          onDiscard={discardPosDraft}
        />
      ) : null}
      {isEdit ? (
        <div className="flex flex-wrap items-baseline gap-3">
          <Link href={`/dashboard/sales/${editSaleId}`} className="text-sm font-medium text-brand-blue-light hover:underline">
            ← Bill #{editBillNo ?? "…"}
          </Link>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Edit bill #{editBillNo ?? "…"}
          </h1>
        </div>
      ) : (
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Billing (POS)</h1>
      )}

      <DraftLineController
        key={draftKey}
        cart={cart}
        tableScrollRef={billingTableScrollRef}
        focusCustomerName={focusCustomerName}
        onCommit={(line) => {
          upsertCartLine(line);
          setDraftKey((k) => k + 1);
        }}
      >
        {(draft) => (
          <>
            <section className="space-y-2 md:hidden" aria-label="Add product">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Add product</h2>
              <DraftLineMobileCard draft={draft} />
            </section>

            {cart.length > 0 ? (
        <section className="space-y-3 md:hidden" aria-label="Bill lines">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Current bill</h2>
          {cart.map((l) => {
            const gstPct = l.gstPct ?? 0;
            const eff = effectiveLineDiscountPct(l.rate, l.mrp, l.discountPct, l.discountFromLotOnly);
            const m = computePosSaleLineMoney({
              qty: l.qty,
              rate: l.rate,
              mrp: l.mrp,
              packSize: l.packSize,
              discountPctOffRate: eff,
              gstPct,
            });
            const discRsDisplay = m.discountAmount;
            const marginPct = saleLineMarginPercent(
              m.amount,
              m.discountAmount,
              m.gstAmount,
              l.qty,
              l.costPrice ?? 0,
              l.packSize,
            );
            return (
              <div
                key={l.lotId}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">{l.name}</p>
                    <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {l.batchNo} · Exp {formatLotExpiry(l.expiryDate)} · Pack {l.packSize}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 touch-manipulation rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    onClick={() => removeCartLine(l.lotId)}
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block text-xs text-zinc-500">
                    Qty
                    <input
                      type="number"
                      min={0}
                      title={`Max ${l.maxQty} (lot stock when added)`}
                      className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right`}
                      value={l.qty < 1 ? "" : l.qty}
                      onChange={(e) => updateCartQty(l.lotId, e.target.value)}
                      onBlur={() => commitCartQty(l.lotId)}
                    />
                  </label>
                  <label className="block text-xs text-zinc-500">
                    MRP
                    <div className="mt-1 rounded border border-transparent py-2 text-right text-base font-medium tabular-nums text-zinc-800 md:py-1 md:text-sm dark:text-zinc-200">
                      ₹{l.mrp.toFixed(2)}
                    </div>
                  </label>
                  <label className="block text-xs text-zinc-500">
                    Amount
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right font-medium`}
                      value={m.grossRate}
                      onChange={(n) => updateCartLineGross(l.lotId, n)}
                    />
                  </label>
                  <label className="block text-xs text-zinc-500">
                    Disc%
                    <NumericTableInput
                      min={0}
                      max={100}
                      step={0.01}
                      className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right`}
                      value={l.discountPct}
                      onChange={(n) => updateCartDiscountPct(l.lotId, n)}
                    />
                  </label>
                  <label className="block text-xs text-zinc-500">
                    Disc ₹
                    <NumericTableInput
                      min={0}
                      max={Math.max(m.amount, discRsDisplay)}
                      step={0.01}
                      className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right`}
                      value={discRsDisplay}
                      onChange={(n) => updateCartDiscountAmount(l.lotId, n)}
                    />
                  </label>
                  <label className="block text-xs text-zinc-500">
                    Mrg%
                    <div className="mt-1 rounded border border-transparent py-2 text-right text-base tabular-nums text-zinc-800 md:py-1 md:text-sm dark:text-zinc-200">
                      {marginPct.toFixed(1)}%
                    </div>
                  </label>
                  <div className="col-span-2 flex justify-between border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
                    <span className="text-zinc-500">Sum</span>
                    <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
                      ₹{m.lineInclusiveTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

            <div
              ref={billingTableScrollRef}
              className={`hidden md:block ${POS_TABLE_SCROLL_WRAP_CLASS}`}
            >
        <table className={POS_TABLE_CLASS}>
          <colgroup>
            <col className={LINE_TABLE_SLNO_COL} />
            <col className="min-w-0 w-[21%]" />
            <col className="min-w-0 w-[13%]" />
            <col className="w-[7%]" />
            <col className="w-[4%]" />
            <col className="w-[5%]" />
            <col className="w-[5%]" />
            <col className="w-[8%]" />
            <col className="w-[5%]" />
            <col className="w-[5%]" />
            <col className="w-[4%]" />
            <col className="w-[4%]" />
            <col className="w-[4%]" />
            <col className="w-[6%]" />
            <col className="w-[7%]" />
          </colgroup>
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-zinc-200 bg-zinc-50 font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
              <th className={`${LINE_TABLE_SLNO_COL} px-0 py-2 text-center font-normal`}>No.</th>
              <th className="align-middle px-2 py-2">Product</th>
              <th className="align-middle px-1 py-2">Batch</th>
              <th className="align-middle px-1 py-2">Exp</th>
              <th className="align-middle px-1 py-2 text-right" title="Units per pack (from product)">
                Pack
              </th>
              <th
                className="align-middle px-1 py-2 text-right"
                title="Quantity in smallest units (e.g. tablets); Pack = units per pack."
              >
                Qty
              </th>
              <th className="align-middle px-1 py-2 text-right" title="Printed MRP per pack from batch">
                MRP
              </th>
              <th className="align-middle px-1 py-2 text-right" title="Gross line amount before discount; rate is GST-inclusive (MRP-style) per pack.">
                Amount
              </th>
              <th className="align-middle px-1 py-2 text-right" title="Discount %">
                Disc%
              </th>
              <th className="align-middle px-1 py-2 text-right">Disc₹</th>
              <th
                className="align-middle px-1 py-2 text-right"
                title="Mrg % = (gross − discount − GST − cost) ÷ (gross − discount), using lot cost."
              >
                Mrg%
              </th>
              <th
                className="align-middle px-1 py-2 text-right"
                title="GST % from product master (per line). EasyTab: GST_MASTER.GSTRATE via GSTID."
              >
                Gst%
              </th>
              <th
                className="align-middle px-1 py-2 text-right"
                title="GST extracted from inclusive amount after discount; bill total = sum of this column."
              >
                Gst₹
              </th>
              <th
                className="align-middle px-1 py-2 text-right"
                title="After discount, GST-inclusive line payable (matches bill total sum)."
              >
                Sum
              </th>
              <th className="align-middle px-1 py-2 text-center" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {cart.map((l, i) => {
              const gstPct = l.gstPct ?? 0;
              const eff = effectiveLineDiscountPct(l.rate, l.mrp, l.discountPct, l.discountFromLotOnly);
              const m = computePosSaleLineMoney({
                qty: l.qty,
                rate: l.rate,
                mrp: l.mrp,
                packSize: l.packSize,
                discountPctOffRate: eff,
                gstPct,
              });
              const discRsDisplay = m.discountAmount;
              const marginPct = saleLineMarginPercent(
                m.amount,
                m.discountAmount,
                m.gstAmount,
                l.qty,
                l.costPrice ?? 0,
                l.packSize,
              );
              return (
                <tr key={l.lotId} className="hidden bg-white md:table-row dark:bg-zinc-900/50">
                  <td className={`${LINE_TABLE_SLNO_COL} px-0 py-2 text-center align-middle tabular-nums text-xs text-zinc-500 dark:text-zinc-400`}>
                    {i + 1}
                  </td>
                  <td
                    className="min-w-0 max-w-none truncate px-2 py-2 align-middle text-sm font-medium text-zinc-900 dark:text-zinc-50"
                    title={l.name}
                  >
                    {l.name}
                  </td>
                  <td className="min-w-0 truncate px-1 py-2 align-middle font-mono text-xs text-zinc-700 dark:text-zinc-200">
                    {l.batchNo}
                  </td>
                  <td className="whitespace-nowrap px-1 py-2 align-middle tabular-nums text-zinc-600 dark:text-zinc-300">
                    {formatLotExpiry(l.expiryDate)}
                  </td>
                  <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                    {l.packSize}
                  </td>
                  <td className="px-1 py-2 align-middle text-right">
                    <input
                      type="number"
                      min={0}
                      title={`Max ${l.maxQty} (lot stock when added)`}
                      className={`ml-auto w-14 max-w-full text-right ${POS_FIELD_INPUT_CLASS}`}
                      value={l.qty < 1 ? "" : l.qty}
                      onChange={(e) => updateCartQty(l.lotId, e.target.value)}
                      onBlur={() => commitCartQty(l.lotId)}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    ₹{l.mrp.toFixed(2)}
                  </td>
                  <td className="px-1 py-2 align-middle text-right">
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      title="Gross before discount (GST-inclusive per pack)"
                      className={`ml-auto w-full min-w-0 max-w-[5rem] text-right font-medium text-zinc-900 dark:text-zinc-50 ${POS_FIELD_INPUT_CLASS}`}
                      value={m.grossRate}
                      onChange={(n) => updateCartLineGross(l.lotId, n)}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle text-right">
                    <NumericTableInput
                      min={0}
                      max={100}
                      step={0.01}
                      className={`ml-auto w-full min-w-0 max-w-[3.25rem] text-right ${POS_FIELD_INPUT_CLASS}`}
                      value={l.discountPct}
                      onChange={(n) => updateCartDiscountPct(l.lotId, n)}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle text-right">
                    <NumericTableInput
                      min={0}
                      max={Math.max(m.amount, discRsDisplay)}
                      step={0.01}
                      title="Discount amount (updates %)"
                      className={`ml-auto w-full min-w-0 max-w-[4rem] text-right ${POS_FIELD_INPUT_CLASS}`}
                      value={discRsDisplay}
                      onChange={(n) => updateCartDiscountAmount(l.lotId, n)}
                    />
                  </td>
                  <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {marginPct.toFixed(1)}%
                  </td>
                  <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                    {gstPct}%
                  </td>
                  <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    ₹{m.gstAmount.toFixed(2)}
                  </td>
                  <td className="px-1 py-2 align-middle text-right tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
                    ₹{m.lineInclusiveTotal.toFixed(2)}
                  </td>
                  <td className="px-1 py-2 text-center align-middle">
                    <button
                      type="button"
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                      onClick={() => removeCartLine(l.lotId)}
                      aria-label={`Remove ${l.name}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            <DraftLineTableRow draft={draft} />
          </tbody>
          <tfoot className="hidden border-t-2 border-zinc-300 bg-zinc-50 dark:border-zinc-600 md:table-footer-group dark:bg-zinc-800/90">
            <tr>
              <td colSpan={15} className="px-3 py-3 align-top">
                <dl className="ml-auto max-w-xs space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  <div className="flex justify-between gap-10 tabular-nums">
                    <dt className="font-medium text-zinc-600 dark:text-zinc-400">Net Total:</dt>
                    <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{netExclusiveTotal.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between gap-10 tabular-nums">
                    <dt className="font-medium text-zinc-600 dark:text-zinc-400">Total GST:</dt>
                    <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{taxSum.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between gap-10 tabular-nums">
                    <dt className="font-medium text-zinc-600 dark:text-zinc-400">Discount:</dt>
                    <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{discountSum.toFixed(2)}</dd>
                  </div>
                  {roundOff !== 0 ? (
                    <div className="flex justify-between gap-10 tabular-nums">
                      <dt className="font-medium text-zinc-600 dark:text-zinc-400">Round off:</dt>
                      <dd className="text-right text-zinc-900 dark:text-zinc-50">
                        {roundOff > 0 ? "+" : ""}₹{roundOff.toFixed(2)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-10 border-t border-zinc-200 pt-2 text-base font-semibold tabular-nums dark:border-zinc-600">
                    <dt className="text-zinc-800 dark:text-zinc-100">Grand Total:</dt>
                    <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{total.toFixed(2)}</dd>
                  </div>
                </dl>
              </td>
            </tr>
          </tfoot>
        </table>
              <DraftLinePortals draft={draft} />
            </div>
          </>
        )}
      </DraftLineController>

      {cart.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/90 md:hidden">
          <dl className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex justify-between gap-6 tabular-nums">
              <dt className="font-medium">Net Total:</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">₹{netExclusiveTotal.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-6 tabular-nums">
              <dt className="font-medium">Total GST:</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">₹{taxSum.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between gap-6 tabular-nums">
              <dt className="font-medium">Discount:</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">₹{discountSum.toFixed(2)}</dd>
            </div>
            {roundOff !== 0 ? (
              <div className="flex justify-between gap-6 tabular-nums">
                <dt className="font-medium">Round off:</dt>
                <dd className="text-zinc-900 dark:text-zinc-50">
                  {roundOff > 0 ? "+" : ""}₹{roundOff.toFixed(2)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-6 border-t border-zinc-200 pt-3 text-base font-semibold text-zinc-800 tabular-nums dark:border-zinc-600 dark:text-zinc-100">
              <dt>Grand Total:</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">₹{total.toFixed(2)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className={POS_CUSTOMER_GRID_CLASS}>
        <label className="text-sm">
          <span className="text-zinc-500">Customer name</span>
          <PosNameCombobox
            field="patient"
            value={customerName}
            onChange={setCustomerName}
            inputRef={customerNameRef}
            className={POS_CUSTOMER_FIELD_CLASS}
            ariaLabel="Patient names"
            onEnterNext={(e) =>
              onCustomerFieldEnter(e, () => doctorNameRef.current?.focus())
            }
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-500">Doctor name</span>
          <PosNameCombobox
            field="doctor"
            value={doctorName}
            onChange={setDoctorName}
            inputRef={doctorNameRef}
            className={POS_CUSTOMER_FIELD_CLASS}
            ariaLabel="Doctor names"
            onEnterNext={(e) =>
              onCustomerFieldEnter(e, () => customerPhoneRef.current?.focus())
            }
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-500">Phone</span>
          <input
            ref={customerPhoneRef}
            className={POS_CUSTOMER_FIELD_CLASS}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            onKeyDown={(e) =>
              onCustomerFieldEnter(e, () => paymentModeRef.current?.focus())
            }
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-500">Payment</span>
          <select
            ref={paymentModeRef}
            className={POS_CUSTOMER_FIELD_CLASS}
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
            onKeyDown={(e) =>
              onCustomerFieldEnter(e, () => {
                if (paymentMode === "CASH" || e.currentTarget.value === "CASH") {
                  // Focus cash field after mode settles; use next tick target from current mode change
                  const nextMode = (e.target as HTMLSelectElement).value;
                  if (nextMode === "CASH") {
                    cashReceivedRef.current?.focus();
                  } else {
                    paidCheckboxRef.current?.focus();
                  }
                } else if (paymentMode === "CASH") {
                  cashReceivedRef.current?.focus();
                } else {
                  paidCheckboxRef.current?.focus();
                }
              })
            }
          >
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="UPI">UPI</option>
            <option value="CREDIT">Credit</option>
          </select>
        </label>
        {paymentMode === "CASH" ? (
          <>
            <label className="text-sm">
              <span className="text-zinc-500">Cash received</span>
              <input
                ref={cashReceivedRef}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className={POS_CUSTOMER_FIELD_CLASS}
                value={cashReceivedInput}
                onChange={(e) => setCashReceivedInput(e.target.value)}
                onKeyDown={(e) =>
                  onCustomerFieldEnter(e, () => paidCheckboxRef.current?.focus())
                }
              />
            </label>
            <div className="text-sm">
              <span className="text-zinc-500">Balance</span>
              <div
                className={`${POS_CUSTOMER_FIELD_CLASS} flex items-center tabular-nums ${
                  cashBalance != null && cashBalance < 0
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-zinc-900 dark:text-zinc-50"
                }`}
                aria-live="polite"
              >
                {cashBalance != null ? `₹${cashBalance.toFixed(2)}` : "—"}
              </div>
            </div>
          </>
        ) : null}
        <label className="flex items-end gap-2 text-sm sm:col-span-2 lg:col-span-1">
          <span className="inline-flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/90 px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-800/50">
            <input
              ref={paidCheckboxRef}
              type="checkbox"
              checked={paid}
              onChange={(e) => {
                paidTouchedRef.current = true;
                setPaid(e.target.checked);
              }}
              onKeyDown={(e) =>
                onCustomerFieldEnter(e, () => checkoutBtnRef.current?.focus())
              }
              className="h-4 w-4 rounded border-zinc-300 text-brand-blue focus:ring-brand-blue"
            />
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Bill paid</span>
          </span>
        </label>
      </div>

      {msg ? (
        <p className="text-sm text-red-600 dark:text-red-400">{msg}</p>
      ) : null}
      <button
        ref={checkoutBtnRef}
        type="button"
        disabled={busy || cart.length === 0 || total < 0}
        onClick={() => void checkout()}
        title={isEdit ? "Save changes (Ctrl+S or ⌘S)" : "Save bill (Ctrl+S or ⌘S)"}
        className={POS_PRIMARY_CTA_CLASS}
      >
        {busy ? "Saving…" : isEdit ? "Save changes" : "Complete sale"}
      </button>
      {savedBill && !isEdit ? <PosSavedBillPanel bill={savedBill} /> : null}
    </div>
  );
}
