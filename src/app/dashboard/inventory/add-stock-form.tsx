"use client";

import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExpiryDateInput } from "@/components/expiry-date-input";
import { NumericTableInput } from "@/components/numeric-table-input";
import { anchorRectBelow, floatingDropdownMaxHeight } from "@/lib/floating-dropdown";
import type { ProductCategory } from "@/lib/product-categories";
import type { ProductType } from "@/lib/product-types";
import type { ProductSchedule } from "@/lib/product-schedules";
import {
  patchPurchaseLinePack,
  purchaseLineCostGross,
  purchaseLineFreeQtyFromStrips,
  purchaseLineFreeStripQty,
  purchaseLineMarginPercent,
  purchaseLineQuantityFromStrips,
  purchaseLineSaleRatePerPack,
  purchaseLineStripQty,
  resyncPurchaseLineDiscountPatches,
  syncPurchaseDiscountFromPct,
  syncPurchaseDiscountFromRs,
  syncSalesDiscountFromPct,
  syncSalesDiscountFromRate,
  syncSalesDiscountFromRs,
  syncSchemeDiscountFromPct,
  syncSchemeDiscountFromRs,
} from "@/lib/purchase-line";
import { PurchaseGstSelect } from "../purchases/purchase-gst-select";
import {
  PurchaseNewProductModal,
  type PurchaseNewProductModalInitial,
  type PurchaseNewProductModalResult,
} from "../purchases/purchase-new-product-modal";
import {
  fetchPurchaseProductSearchHits,
  PurchaseProductSearchField,
  PurchaseProductSearchListItem,
  PurchaseSupplierSearchField,
  type PurchaseProductSearchHit,
} from "../purchases/purchase-product-search-ui";

export type AddStockInitialProduct = { id: string; name: string };

type StockLine = {
  productId: string;
  productName: string;
  pack: number;
  batchNo: string;
  expiryYmd: string;
  quantity: number;
  freeQty: number;
  costPrice: number;
  schemeDiscountPct: number;
  schemeDiscountRs: number;
  purchaseDiscountPct: number;
  purchaseDiscountRs: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  gstPct: number;
  mrp: number;
  catalogBrandId?: string | null;
  catalogReorderMin?: number;
  catalogGstPct?: number;
  catalogProductCategory?: ProductCategory;
  catalogProductType?: ProductType;
  catalogProductSchedule?: ProductSchedule;
  catalogDrugCode?: string;
  manufacturer?: string;
};

const slNoCol = "w-[1.25rem] min-w-[1.25rem] max-w-[1.25rem]";
const productCol = "min-w-0 w-[13rem] max-w-[13rem]";
const intCol = "w-[2rem] min-w-[2rem] max-w-[2rem]";
const batchCol = "w-[3.75rem] min-w-[3.75rem] max-w-[3.75rem]";
const expiryCol = "w-[7.25rem] min-w-[7.25rem] max-w-[7.25rem]";
const rateCol = "w-[2.625rem] min-w-[2.625rem] max-w-[2.625rem]";
const pctCol = "w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem]";
const moneyCol = "w-[2.375rem] min-w-[2.375rem] max-w-[2.375rem]";
const marginCol = "w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem]";
const sumCol = "w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem]";
const cellIn =
  "ml-auto min-w-0 w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950";
const supplierFieldCls =
  "relative z-0 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950";

function emptyLine(): StockLine {
  return {
    productId: "",
    productName: "",
    pack: 1,
    batchNo: "",
    expiryYmd: "",
    quantity: 1,
    freeQty: 0,
    costPrice: 0,
    schemeDiscountPct: 0,
    schemeDiscountRs: 0,
    purchaseDiscountPct: 0,
    purchaseDiscountRs: 0,
    salesDiscountPct: 0,
    salesDiscountRs: 0,
    gstPct: 5,
    mrp: 0,
  };
}

async function fetchLineDefaults(productId: string) {
  const res = await fetch(`/api/purchases/line-defaults?productId=${encodeURIComponent(productId)}`);
  const data = await res.json();
  if (!res.ok || !data.defaults) return null;
  return data.defaults as {
    batchNo: string;
    expiryDate: string;
    mrp: number;
    costPrice: number;
    pack: number;
    purchaseDiscountPct: number;
    purchaseDiscountRs: number;
    schemeDiscountPct: number;
    schemeDiscountRs: number;
    salesDiscountPct: number;
    salesDiscountRs: number;
    gstPct: number;
    freeQty: number;
  };
}

export function AddStockForm({
  initialProduct,
  onSaved,
  onCancel,
  showCancel = true,
}: {
  initialProduct?: AddStockInitialProduct | null;
  onSaved: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const supplierSearchId = useId();
  const searchId = useId();
  const productAnchorRef = useRef<HTMLDivElement>(null);
  const supplierAnchorRef = useRef<HTMLDivElement>(null);
  const productHitsListRef = useRef<HTMLUListElement>(null);
  const supplierHitsListRef = useRef<HTMLUListElement>(null);

  const [line, setLine] = useState<StockLine>(() => emptyLine());
  const [addNewProduct, setAddNewProduct] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [productHits, setProductHits] = useState<PurchaseProductSearchHit[]>([]);
  const [productHitHi, setProductHitHi] = useState(-1);
  const [productPopRect, setProductPopRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierHits, setSupplierHits] = useState<{ id: string; name: string }[]>([]);
  const [supplierHitHi, setSupplierHitHi] = useState(-1);
  const [supplierPopRect, setSupplierPopRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [supplierFocused, setSupplierFocused] = useState(false);
  const supplierPickedLabelRef = useRef<string | null>(null);

  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
  const [newProductModalInitial, setNewProductModalInitial] = useState<PurchaseNewProductModalInitial | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const patchLine = useCallback((patch: Partial<StockLine>) => {
    setLine((prev) => ({ ...prev, ...patch }));
    setErr(null);
    setOk(null);
  }, []);

  const applyDefaults = useCallback(async (id: string, name: string) => {
    const defs = await fetchLineDefaults(id);
    setLine((prev) => {
      const base: StockLine = {
        ...prev,
        productId: id,
        productName: name,
        pack: defs?.pack ?? prev.pack,
        batchNo: defs?.batchNo ?? "",
        expiryYmd: defs?.expiryDate ?? "",
        quantity: defs?.pack ? purchaseLineQuantityFromStrips(1, defs.pack) : 1,
        freeQty: defs?.freeQty ?? 0,
        costPrice: defs?.costPrice ?? 0,
        mrp: defs?.mrp ?? 0,
        schemeDiscountPct: defs?.schemeDiscountPct ?? 0,
        schemeDiscountRs: defs?.schemeDiscountRs ?? 0,
        purchaseDiscountPct: defs?.purchaseDiscountPct ?? 0,
        purchaseDiscountRs: defs?.purchaseDiscountRs ?? 0,
        salesDiscountPct: defs?.salesDiscountPct ?? 0,
        salesDiscountRs: defs?.salesDiscountRs ?? 0,
        gstPct: defs?.gstPct ?? 5,
      };
      return base;
    });
  }, []);

  useEffect(() => {
    setLine(emptyLine());
    setAddNewProduct(false);
    setSearchQ("");
    setProductHits([]);
    setSupplierId("");
    setSupplierQ("");
    setSupplierHits([]);
    setErr(null);
    setOk(null);
    if (initialProduct?.id) {
      setSearchQ(initialProduct.name);
      void applyDefaults(initialProduct.id, initialProduct.name);
    }
  }, [initialProduct, applyDefaults]);

  const searchProducts = useCallback(async (query: string, signal?: AbortSignal) => {
    try {
      setProductHits(await fetchPurchaseProductSearchHits(query, signal));
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
    if (line.productId || addNewProduct) return;
    const t = searchQ.trim();
    if (!t) {
      setProductHits([]);
      return;
    }
    const ac = new AbortController();
    const tid = window.setTimeout(() => void searchProducts(t, ac.signal), 280);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [searchQ, line.productId, addNewProduct, searchProducts]);

  useEffect(() => {
    if (productHits.length > 0) setProductHitHi(0);
    else setProductHitHi(-1);
  }, [productHits]);

  useLayoutEffect(() => {
    if (!productAnchorRef.current || productHits.length === 0 || line.productId || addNewProduct) {
      setProductPopRect(null);
      return;
    }
    setProductPopRect(anchorRectBelow(productAnchorRef.current));
  }, [productHits.length, line.productId, addNewProduct, searchQ]);

  const searchSuppliers = useCallback(async (query: string, signal?: AbortSignal) => {
    const q = query.trim();
    if (!q) return;
    try {
      const res = await fetch(`/api/suppliers?q=${encodeURIComponent(q)}`, { signal });
      const data = await res.json();
      if (res.ok) setSupplierHits((data.suppliers ?? []) as { id: string; name: string }[]);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
    const q = supplierQ.trim();
    if (q.length < 1) {
      setSupplierHits([]);
      return;
    }
    if (supplierId && supplierPickedLabelRef.current !== null && q === supplierPickedLabelRef.current) return;
    const ac = new AbortController();
    const tid = window.setTimeout(() => void searchSuppliers(supplierQ, ac.signal), 280);
    return () => {
      window.clearTimeout(tid);
      ac.abort();
    };
  }, [supplierQ, supplierId, searchSuppliers]);

  useEffect(() => {
    if (supplierHits.length > 0) setSupplierHitHi(0);
    else setSupplierHitHi(-1);
  }, [supplierHits]);

  useLayoutEffect(() => {
    const open = supplierFocused && supplierQ.trim().length > 0 && supplierHits.length > 0;
    if (!open || !supplierAnchorRef.current) {
      setSupplierPopRect(null);
      return;
    }
    setSupplierPopRect(anchorRectBelow(supplierAnchorRef.current));
  }, [supplierFocused, supplierQ, supplierHits.length]);

  async function pickProduct(p: PurchaseProductSearchHit) {
    setAddNewProduct(false);
    setSearchQ(p.name);
    setProductHits([]);
    setProductHitHi(-1);
    setProductPopRect(null);
    await applyDefaults(p.id, p.name);
  }

  function clearProductSearch() {
    setSearchQ("");
    setLine(emptyLine());
    setAddNewProduct(false);
    setProductHits([]);
  }

  function openNewProductModal(opts?: { edit?: boolean }) {
    setProductHits([]);
    setProductHitHi(-1);
    setProductPopRect(null);
    if (opts?.edit && addNewProduct) {
      setNewProductModalInitial({
        name: line.productName,
        packSize: line.pack,
        reorderMin: line.catalogReorderMin ?? 0,
        gstPct: line.catalogGstPct ?? line.gstPct ?? 5,
        productCategory: line.catalogProductCategory,
        productType: line.catalogProductType,
        productSchedule: line.catalogProductSchedule,
        brandId: line.catalogBrandId ?? null,
        brandName: line.manufacturer ?? "",
        drugCode: line.catalogDrugCode ?? "",
      });
    } else {
      setNewProductModalInitial({
        name: searchQ.trim(),
        packSize: Math.max(1, line.pack || 1),
      });
    }
    setNewProductModalOpen(true);
  }

  function applyNewProductModal(v: PurchaseNewProductModalResult) {
    setAddNewProduct(true);
    setSearchQ(v.name);
    setProductHits([]);
    patchLine({
      productId: "",
      productName: v.name,
      pack: Math.max(1, v.packSize),
      manufacturer: v.brandName.trim() || undefined,
      catalogBrandId: v.brandId,
      catalogReorderMin: v.reorderMin,
      catalogGstPct: v.gstPct,
      catalogProductCategory: v.productCategory,
      catalogProductType: v.productType,
      catalogProductSchedule: v.productSchedule,
      catalogDrugCode:
        v.productCategory === "JANAUSHADHI" && v.drugCode.trim() ? v.drugCode.trim() : undefined,
      gstPct: v.gstPct,
      quantity: purchaseLineQuantityFromStrips(1, v.packSize),
    });
    setNewProductModalOpen(false);
  }

  function handlePickSupplier(s: { id: string; name: string }) {
    setSupplierId(s.id);
    setSupplierQ(s.name);
    supplierPickedLabelRef.current = s.name.trim();
    setSupplierHits([]);
    setSupplierHitHi(-1);
  }

  function clearSupplierSearch() {
    setSupplierId("");
    setSupplierQ("");
    supplierPickedLabelRef.current = null;
    setSupplierHits([]);
  }

  function onSupplierSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const listOpen = supplierFocused && supplierQ.trim().length > 0 && supplierHits.length > 0;
    if (!listOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSupplierHitHi((h) => (supplierHits.length === 0 ? -1 : h < 0 ? 0 : Math.min(supplierHits.length - 1, h + 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSupplierHitHi((h) => (supplierHits.length === 0 ? -1 : h < 0 ? supplierHits.length - 1 : Math.max(0, h - 1)));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = supplierHits[supplierHitHi >= 0 ? supplierHitHi : 0];
      if (row) handlePickSupplier(row);
    }
  }

  async function resolveProductId(): Promise<string | null> {
    if (line.productId) return line.productId;
    if (!addNewProduct || !line.productName.trim()) return null;

    const body: Record<string, unknown> = {
      name: line.productName.trim(),
      packSize: line.pack,
      reorderMin: line.catalogReorderMin ?? 0,
      productCategory: line.catalogProductCategory,
      productType: line.catalogProductType,
      productSchedule: line.catalogProductSchedule,
      gstPct: line.catalogGstPct ?? line.gstPct,
    };
    if (line.catalogBrandId) body.brandId = line.catalogBrandId;
    else if (line.manufacturer?.trim()) body.brandName = line.manufacturer.trim();
    if (line.catalogProductCategory === "JANAUSHADHI" && line.catalogDrugCode?.trim()) {
      body.drugCode = line.catalogDrugCode.trim();
    }

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(typeof data.error === "string" ? data.error : "Could not create product");
      return null;
    }
    return (data.product as { id: string }).id;
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const hasCatalog = !!line.productId;
    const hasNew = addNewProduct && line.productName.trim().length > 0;
    if (!hasCatalog && !hasNew) {
      setErr("Pick a catalog product from search, or click + to add a new product.");
      return;
    }
    if (!line.batchNo.trim()) {
      setErr("Batch number is required.");
      return;
    }
    if (!line.expiryYmd.trim()) {
      setErr("Expiry date is required.");
      return;
    }
    if (line.quantity <= 0) {
      setErr("Qty must be at least 1 strip.");
      return;
    }

    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const productId = await resolveProductId();
      if (!productId) return;

      const res = await fetch("/api/inventory/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          supplierId: supplierId || undefined,
          batchNo: line.batchNo.trim(),
          expiryDate: line.expiryYmd.trim(),
          quantity: line.quantity,
          freeQty: line.freeQty,
          pack: line.pack,
          costPrice: line.costPrice,
          mrp: line.mrp,
          salesDiscountPct: line.salesDiscountPct,
          salesDiscountRs: line.salesDiscountRs,
          gstPct: line.gstPct,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Could not add stock");
        return;
      }
      setOk("Stock added.");
      onSaved();
    } catch {
      setErr("Could not add stock");
    } finally {
      setBusy(false);
    }
  }

  const lineLocked = !line.productId && !addNewProduct;
  const marginPct = purchaseLineMarginPercent(line);
  const sumGross = purchaseLineCostGross(line);
  const productMenuOpen =
    !line.productId && !addNewProduct && productHits.length > 0 && searchQ.trim().length > 0;
  const supplierMenuOpen = supplierFocused && supplierQ.trim().length > 0 && supplierHits.length > 0;

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Add to stock</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm sm:col-span-2 lg:col-span-1">
          <span className="text-zinc-500">Supplier (optional)</span>
          <div ref={supplierAnchorRef} className="relative mt-1">
            <PurchaseSupplierSearchField
              id={supplierSearchId}
              placeholder="Search supplier name, company, GSTIN…"
              value={supplierQ}
              showClear={supplierQ.trim().length > 0 || !!supplierId}
              onClear={clearSupplierSearch}
              onFocus={() => setSupplierFocused(true)}
              onBlur={() => {
                window.setTimeout(() => {
                  setSupplierFocused(false);
                  setSupplierHits([]);
                  setSupplierHitHi(-1);
                }, 200);
              }}
              onChange={(v) => {
                setSupplierQ(v);
                setSupplierId("");
                supplierPickedLabelRef.current = null;
              }}
              onKeyDown={onSupplierSearchKeyDown}
              inputClassName={supplierFieldCls}
            />
            {supplierMenuOpen && supplierPopRect
              ? createPortal(
                  <ul
                    ref={supplierHitsListRef}
                    role="listbox"
                    aria-label="Matching suppliers"
                    style={{
                      position: "fixed",
                      top: supplierPopRect.top,
                      left: supplierPopRect.left,
                      width: supplierPopRect.width,
                      maxHeight: floatingDropdownMaxHeight(),
                      zIndex: 300,
                    }}
                    className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {supplierHits.map((s, idx) => (
                      <li key={s.id} role="option" aria-selected={idx === supplierHitHi}>
                        <button
                          type="button"
                          data-supplier-hits-idx={idx}
                          className={`flex w-full px-2.5 py-2 text-left ${
                            idx === supplierHitHi
                              ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handlePickSupplier(s)}
                        >
                          {s.name}
                        </button>
                      </li>
                    ))}
                  </ul>,
                  document.body,
                )
              : null}
          </div>
        </label>
      </div>

      <div className="mt-5 overflow-x-auto overflow-y-visible rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="purchase-lines-stack w-full min-w-0 table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-medium leading-tight text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
              <th className={`${slNoCol} px-0 py-2 text-center font-normal`}>No.</th>
              <th className={`sticky left-0 z-10 bg-zinc-50 px-1 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:bg-zinc-800/80 ${productCol}`}>
                Product
              </th>
              <th className={`${intCol} px-0.5 py-1.5`} title="Units per pack">
                Pack
              </th>
              <th className={`${batchCol} px-0.5 py-1.5`}>Batch</th>
              <th className={`${expiryCol} px-0.5 py-1.5`}>Expiry</th>
              <th className={`${intCol} px-0.5 py-1.5 text-right`}>Qty</th>
              <th className={`${intCol} px-0.5 py-1.5 text-right`}>Free</th>
              <th className={`${rateCol} px-0.5 py-1.5 text-right`}>PTR</th>
              <th className={`${pctCol} px-0.5 py-1.5 text-right`}>Sch%</th>
              <th className={`${moneyCol} px-0.5 py-1.5 text-right`}>Sch₹</th>
              <th className={`${pctCol} px-0.5 py-1.5 text-right`}>P.Disc%</th>
              <th className={`${moneyCol} px-0.5 py-1.5 text-right`}>P.Disc₹</th>
              <th className={`${pctCol} px-0.5 py-1.5 text-right`}>S.Disc%</th>
              <th className={`${moneyCol} px-0.5 py-1.5 text-right`}>S.Disc₹</th>
              <th className={`${pctCol} px-0.5 py-1.5 text-right`}>GST</th>
              <th className={`${rateCol} px-0.5 py-1.5 text-right`}>MRP</th>
              <th className={`${rateCol} px-0.5 py-1.5 text-right`}>Rate</th>
              <th className={`${marginCol} px-0.5 py-1.5 text-right normal-case`}>Mrg</th>
              <th className={`${sumCol} px-0.5 py-1.5 text-right`}>Sum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
              <td className={`${slNoCol} align-middle px-0 py-1.5 text-center tabular-nums text-zinc-500`}>1</td>
              <td
                className={`sticky left-0 z-[1] align-middle bg-inherit px-1 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] dark:bg-zinc-900 ${productCol}`}
              >
                <div ref={productAnchorRef} className="relative min-h-[2.5rem]">
                  {addNewProduct ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-medium text-amber-950 dark:text-amber-100"
                          title={line.productName}
                        >
                          {line.productName}
                        </span>
                        <button
                          type="button"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100"
                          title="Edit product details"
                          aria-label="Edit new product details"
                          onClick={() => openNewProductModal({ edit: true })}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="self-start text-xs font-medium text-brand-blue-light hover:underline"
                        onClick={clearProductSearch}
                      >
                        Search catalog instead
                      </button>
                    </div>
                  ) : line.productId ? (
                    <div className="flex min-w-0 items-center gap-1">
                      <span
                        className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-900 dark:text-zinc-50"
                        title={line.productName}
                      >
                        {line.productName}
                      </span>
                      <button
                        type="button"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                        title="Change product"
                        aria-label="Change product"
                        onClick={clearProductSearch}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <PurchaseProductSearchField
                      id={searchId}
                      value={searchQ}
                      onChange={setSearchQ}
                      showClear={searchQ.length > 0}
                      onClear={clearProductSearch}
                      showNewProduct
                      onNewProduct={() => openNewProductModal()}
                      ariaLabel="Search product to add stock"
                      inputClassName="relative z-0 w-full rounded border border-zinc-300 bg-white py-2 pl-2 text-sm dark:border-zinc-600 dark:bg-zinc-950"
                    />
                  )}
                  {productMenuOpen && productPopRect
                    ? createPortal(
                        <ul
                          ref={productHitsListRef}
                          role="listbox"
                          aria-label="Matching products"
                          style={{
                            position: "fixed",
                            top: productPopRect.top,
                            left: productPopRect.left,
                            width: productPopRect.width,
                            maxHeight: floatingDropdownMaxHeight(),
                            zIndex: 300,
                          }}
                          className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          {productHits.map((h, idx) => (
                            <li key={h.id} role="option" aria-selected={idx === productHitHi}>
                              <PurchaseProductSearchListItem
                                hit={h}
                                selected={idx === productHitHi}
                                onSelect={() => void pickProduct(h)}
                                onHover={() => setProductHitHi(idx)}
                                dataIdxAttr="data-add-stock-idx"
                                dataIdxValue={idx}
                              />
                            </li>
                          ))}
                        </ul>,
                        document.body,
                      )
                    : null}
                </div>
              </td>
              <td className={`${intCol} align-middle px-0.5 py-1.5`}>
                <NumericTableInput
                  className="w-full rounded border border-zinc-300 px-1 py-1 text-right text-xs dark:border-zinc-600 dark:bg-zinc-950"
                  min={1}
                  step={1}
                  integer
                  fallback={1}
                  emptyWhenZero={false}
                  disabled={lineLocked}
                  value={line.pack}
                  onChange={(n) =>
                    setLine((prev) => ({ ...prev, ...patchPurchaseLinePack(prev, Math.max(1, Math.floor(n))) }))
                  }
                />
              </td>
              <td className={`${batchCol} align-middle px-0.5 py-1.5`}>
                <input
                  className="w-full rounded border border-zinc-300 px-0.5 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                  placeholder="Batch"
                  disabled={lineLocked}
                  value={line.batchNo}
                  onChange={(e) => patchLine({ batchNo: e.target.value })}
                />
              </td>
              <td className={`${expiryCol} align-middle px-0.5 py-1.5`}>
                <ExpiryDateInput
                  className="w-full rounded border border-zinc-300 px-0.5 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
                  wrapperClassName="min-w-0 w-full"
                  disabled={lineLocked}
                  value={line.expiryYmd}
                  onChange={(e) => patchLine({ expiryYmd: e.target.value })}
                />
              </td>
              <td className={`${intCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className="ml-auto w-full rounded border border-zinc-300 px-1 py-1 text-right text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  min={1}
                  step={1}
                  integer
                  fallback={1}
                  emptyWhenZero={false}
                  disabled={lineLocked}
                  value={purchaseLineStripQty(line)}
                  onChange={(n) =>
                    setLine((prev) => ({
                      ...prev,
                      ...resyncPurchaseLineDiscountPatches(prev, {
                        quantity: purchaseLineQuantityFromStrips(n, prev.pack),
                      }),
                    }))
                  }
                />
              </td>
              <td className={`${intCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className="ml-auto w-full rounded border border-zinc-300 px-1 py-1 text-right text-sm dark:border-zinc-600 dark:bg-zinc-950"
                  min={0}
                  step={1}
                  integer
                  disabled={lineLocked}
                  value={purchaseLineFreeStripQty(line)}
                  onChange={(n) => patchLine({ freeQty: purchaseLineFreeQtyFromStrips(n, line.pack) })}
                />
              </td>
              <td className={`${rateCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.costPrice}
                  onChange={(n) =>
                    setLine((prev) => ({ ...prev, ...resyncPurchaseLineDiscountPatches(prev, { costPrice: n }) }))
                  }
                />
              </td>
              <td className={`${pctCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  max={100}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.schemeDiscountPct}
                  onChange={(n) => setLine((prev) => ({ ...prev, ...syncSchemeDiscountFromPct(prev, n) }))}
                />
              </td>
              <td className={`${moneyCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.schemeDiscountRs}
                  onChange={(n) => setLine((prev) => ({ ...prev, ...syncSchemeDiscountFromRs(prev, n) }))}
                />
              </td>
              <td className={`${pctCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  max={100}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.purchaseDiscountPct}
                  onChange={(n) => setLine((prev) => ({ ...prev, ...syncPurchaseDiscountFromPct(prev, n) }))}
                />
              </td>
              <td className={`${moneyCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.purchaseDiscountRs}
                  onChange={(n) => setLine((prev) => ({ ...prev, ...syncPurchaseDiscountFromRs(prev, n) }))}
                />
              </td>
              <td className={`${pctCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  max={100}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.salesDiscountPct}
                  onChange={(n) => patchLine(syncSalesDiscountFromPct(line, n))}
                />
              </td>
              <td className={`${moneyCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.salesDiscountRs}
                  onChange={(n) => patchLine(syncSalesDiscountFromRs(line, n))}
                />
              </td>
              <td className={`${pctCol} align-middle px-0.5 py-1.5 text-right`}>
                <PurchaseGstSelect className={cellIn} disabled={lineLocked} value={line.gstPct} onChange={(n) => patchLine({ gstPct: n })} />
              </td>
              <td className={`${rateCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  step={0.01}
                  disabled={lineLocked}
                  value={line.mrp}
                  onChange={(n) => setLine((prev) => ({ ...prev, ...resyncPurchaseLineDiscountPatches(prev, { mrp: n }) }))}
                />
              </td>
              <td className={`${rateCol} align-middle px-0.5 py-1.5 text-right`}>
                <NumericTableInput
                  className={cellIn}
                  min={0}
                  step={0.01}
                  disabled={lineLocked}
                  value={purchaseLineSaleRatePerPack(line)}
                  onChange={(n) => patchLine(syncSalesDiscountFromRate(line, n))}
                />
              </td>
              <td
                className={`${marginCol} align-middle px-0.5 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400`}
              >
                {marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}
              </td>
              <td className={`${sumCol} align-middle px-0.5 py-1.5 text-right text-xs tabular-nums text-zinc-800 dark:text-zinc-200`}>
                ₹{sumGross.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        Stock in: <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">{line.quantity + line.freeQty}</span>{" "}
        units (qty + free). Tops up an existing batch when batch and expiry match.
      </p>

      {err ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p> : null}
      {ok ? <p className="mt-3 text-sm text-brand-green">{ok}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {showCancel && onCancel ? (
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={busy || lineLocked}
          className="min-w-[12rem] flex-1 rounded-xl bg-gradient-to-r from-brand-blue to-brand-green py-2.5 text-sm font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50 sm:flex-none sm:px-8"
        >
          {busy ? "Saving…" : "Add to stock"}
        </button>
      </div>

      <PurchaseNewProductModal
        open={newProductModalOpen}
        onClose={() => setNewProductModalOpen(false)}
        onApply={applyNewProductModal}
        initial={newProductModalInitial}
        onValidationError={setErr}
      />
    </form>
  );
}
