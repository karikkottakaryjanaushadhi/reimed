"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  buildImportMetaNotes,
  coercePackFromImport,
  expiryMmYyToIso,
  normalizeInvoiceProductName,
  parseDdMmYyyyToIso,
  type InvoiceBillJson,
  INVOICE_GEMINI_EXTRACTION_PROMPT,
} from "@/lib/invoice-bill";
import { DatePickerInput } from "@/components/date-picker-input";
import { ExpiryDateInput } from "@/components/expiry-date-input";
import { NumericTableInput } from "@/components/numeric-table-input";
import { anchorRectBelow, floatingDropdownMaxHeight } from "@/lib/floating-dropdown";
import {
  purchaseBillTotalsFromLines,
  purchaseLineCostGross,
  purchaseLineMarginPercent,
  purchaseLineSaleRatePerPack,
  patchPurchaseLinePack,
  purchaseLineFreeQtyFromStrips,
  purchaseLineFreeStripQty,
  purchaseLineQuantityFromStrips,
  purchaseLineStripQty,
  resyncPurchaseLineDiscountPatches,
  syncPurchaseDiscountFromPct,
  syncPurchaseDiscountFromRs,
  syncSchemeDiscountFromPct,
  syncSchemeDiscountFromRs,
  syncSalesDiscountFromPct,
  syncSalesDiscountFromRate,
  syncSalesDiscountFromRs,
} from "@/lib/purchase-line";
import { navigatePurchaseTable } from "@/lib/purchase-table-nav";
import type { ProductCategory } from "@/lib/product-categories";
import type { ProductType } from "@/lib/product-types";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import {
  PurchaseNewProductModal,
  type PurchaseNewProductModalInitial,
  type PurchaseNewProductModalResult,
} from "./purchase-new-product-modal";
import { PurchaseBillTotalsPanel } from "./purchase-bill-totals-panel";
import { PurchaseGstSelect } from "./purchase-gst-select";
import { PurchaseLineMobileCard, preferVisibleAnchor } from "./purchase-line-mobile-card";
import { PurchaseEditingInProgressSwitch } from "./purchase-editing-in-progress-switch";
import { FormDraftResumeBanner } from "@/components/form-draft-resume-banner";
import { useFormDraft } from "@/hooks/use-form-draft";
import {
  buildPurchaseFormDraft,
  isPurchaseFormDraftEmpty,
  purchaseFormDraftKey,
  type PurchaseFormDraft,
} from "./purchase-form-draft";
import {
  fetchPurchaseProductSearchHits,
  PurchaseProductSearchField,
  PurchaseProductSearchListItem,
  PurchaseSupplierSearchField,
  type PurchaseProductSearchHit,
} from "./purchase-product-search-ui";

const SEARCH_DEBOUNCE_MS = 350;
const purchaseFormSlNoCol = "w-[1.25rem] min-w-[1.25rem] max-w-[1.25rem]";
const purchaseFormProductCol = "min-w-0 w-[13rem] max-w-[13rem]";
const purchaseFormIntCol = "w-[2rem] min-w-[2rem] max-w-[2rem]";
const purchaseFormBatchCol = "w-[3.75rem] min-w-[3.75rem] max-w-[3.75rem]";
const purchaseFormExpiryCol = "w-[7.25rem] min-w-[7.25rem] max-w-[7.25rem]";
const purchaseFormRateCol = "w-[2.625rem] min-w-[2.625rem] max-w-[2.625rem]";
const purchaseFormPctCol = "w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem]";
const purchaseFormMoneyCol = "w-[2.375rem] min-w-[2.375rem] max-w-[2.375rem]";
const purchaseFormMarginCol = "w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem]";
const purchaseFormSumCol = "w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem]";
const purchaseFormActionCol = "w-[2.75rem] min-w-[2.75rem] max-w-[2.75rem]";
const purchaseFormNumIn =
  "ml-auto min-w-0 w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950";

const PURCHASE_FORM_LINE_FIELDS = [
  "pack",
  "batchNo",
  "expiryDate",
  "quantity",
  "freeQty",
  "costPrice",
  "schemeDiscountPct",
  "schemeDiscountRs",
  "purchaseDiscountPct",
  "purchaseDiscountRs",
  "salesDiscountPct",
  "salesDiscountRs",
  "gstPct",
  "mrp",
  "saleRate",
] as const;

type Supplier = { id: string; name: string };

type LineDefaults = {
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
  /** Per-pack sale rate from latest inventory lot, when saved. */
  saleRate?: number;
  gstPct: number;
  freeQty: number;
};

function applySavedSalePricingFromDefaults(line: Line, d: LineDefaults): Line {
  const saleRate = d.saleRate;
  if (saleRate != null && Number.isFinite(saleRate) && saleRate > 0 && line.mrp > 0) {
    return { ...line, ...syncSalesDiscountFromRate(line, saleRate) };
  }
  if ((d.salesDiscountPct ?? 0) > 0 || (d.salesDiscountRs ?? 0) > 0) {
    return {
      ...line,
      salesDiscountPct: d.salesDiscountPct ?? 0,
      salesDiscountRs: d.salesDiscountRs ?? 0,
    };
  }
  return line;
}

type Line = {
  key: string;
  productId: string | null;
  labelName: string;
  manufacturer?: string;
  /** Brand picked from /api/brands when creating new catalog product via purchase modal */
  catalogBrandId?: string | null;
  catalogReorderMin?: number;
  /** GST % stored on Product for lines created as newProduct */
  catalogGstPct?: number;
  /** Category stored on Product for lines created as newProduct */
  catalogProductCategory?: ProductCategory;
  /** Type stored on Product for lines created as newProduct */
  catalogProductType?: ProductType;
  /** Drug code stored on Product.sku for lines created as newProduct */
  catalogDrugCode?: string;
  genericName?: string;
  /** Units per billable pack (e.g. 10 for a 10-tab strip; 1 for ML/GM bottles). */
  pack: number;
  /** Billing unit label stored on Product when creating via purchase (e.g. TAB, ML). */
  unit?: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  mrp: number;
  hsn?: string;
  purchaseDiscountPct: number;
  purchaseDiscountRs: number;
  schemeDiscountPct: number;
  schemeDiscountRs: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  freeQty: number;
  gstPct: number;
};

function randomKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `l-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDraftLine(): Line {
  return {
    key: "draft",
    productId: null,
    labelName: "",
    pack: 1,
    batchNo: "",
    expiryDate: "",
    quantity: 1,
    costPrice: 0,
    mrp: 0,
    purchaseDiscountPct: 0,
    purchaseDiscountRs: 0,
    schemeDiscountPct: 0,
    schemeDiscountRs: 0,
    salesDiscountPct: 0,
    salesDiscountRs: 0,
    freeQty: 0,
    gstPct: 5,
  };
}

async function fetchProductMatch(name: string): Promise<{ id: string; name: string } | null> {
  const res = await fetch(`/api/products/match?name=${encodeURIComponent(name)}`);
  const data = await res.json();
  if (!res.ok) return null;
  const p = data.product as { id: string; name: string } | null;
  return p ?? null;
}

async function fetchLineDefaults(productId: string): Promise<LineDefaults | null> {
  const res = await fetch(`/api/purchases/line-defaults?productId=${encodeURIComponent(productId)}`);
  const data = await res.json();
  if (!res.ok || !data.defaults) return null;
  const d = data.defaults as LineDefaults;
  return d;
}

export function PurchaseForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const jsonInputId = useId();
  const draftSearchId = useId();
  const draftSearchIdMobile = useId();
  const linkSearchId = useId();
  const linkSearchIdMobile = useId();
  const supplierSearchId = useId();
  const draftHitsListRef = useRef<HTMLUListElement>(null);
  const linkHitsListRef = useRef<HTMLUListElement>(null);
  const supplierHitsListRef = useRef<HTMLUListElement>(null);
  const purchaseTableScrollRef = useRef<HTMLDivElement>(null);
  const purchaseMobileScrollRef = useRef<HTMLDivElement>(null);
  const supplierAnchorRef = useRef<HTMLDivElement>(null);
  const draftAnchorRef = useRef<HTMLDivElement>(null);
  const draftAnchorMobileRef = useRef<HTMLDivElement>(null);
  const linkAnchorRef = useRef<HTMLDivElement>(null);
  const linkAnchorMobileRef = useRef<HTMLDivElement>(null);
  /** Skips refetch while input still matches last pick (stops list reopening after select). */
  const supplierPickedLabelRef = useRef<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierHits, setSupplierHits] = useState<Supplier[]>([]);
  const [supplierHitHi, setSupplierHitHi] = useState(-1);
  const [supplierFocused, setSupplierFocused] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [draftHits, setDraftHits] = useState<PurchaseProductSearchHit[]>([]);
  const [draft, setDraft] = useState<Line>(() => emptyDraftLine());
  const [draftKey, setDraftKey] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [jsonPaste, setJsonPaste] = useState("");
  const [linkRowIndex, setLinkRowIndex] = useState<number | null>(null);
  const [linkSearchQ, setLinkSearchQ] = useState("");
  const [linkHits, setLinkHits] = useState<PurchaseProductSearchHit[]>([]);
  const [linkHitHi, setLinkHitHi] = useState(-1);
  const [linkPopRect, setLinkPopRect] = useState<{ top: number; left: number; width: number } | null>(null);
  /** Draft row: new product details captured (via + modal); creates catalog product on save. */
  const [draftNewProduct, setDraftNewProduct] = useState(false);
  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
  const [newProductModalInitial, setNewProductModalInitial] =
    useState<PurchaseNewProductModalInitial | null>(null);
  /** Committed line index when modal edits a saved row; null = draft row. */
  const [newProductModalLineIndex, setNewProductModalLineIndex] = useState<number | null>(null);
  const [billingPreview, setBillingPreview] = useState<InvoiceBillJson["billing_summary"] | null>(null);
  /** Saved with purchase when JSON import includes seller/buyer/bank etc. */
  const [importMetaNotes, setImportMetaNotes] = useState("");
  /** Checked = still editing after post (purchase stays open on detail). Uncheck before posting to finalize at once. */
  const [editingInProgress, setEditingInProgress] = useState(true);
  const [draftHitHi, setDraftHitHi] = useState(0);
  const [draftPopRect, setDraftPopRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [supplierPopRect, setSupplierPopRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const purchaseDraftSnapshot = useMemo(
    () =>
      buildPurchaseFormDraft({
        supplierId,
        supplierQ,
        invoiceNo,
        invoiceDate,
        lines,
        draftLine: draft,
        draftQ,
        draftNewProduct,
        editingInProgress,
        importMetaNotes,
        saleRateDrafts: {},
      }),
    [
      supplierId,
      supplierQ,
      invoiceNo,
      invoiceDate,
      lines,
      draft,
      draftQ,
      draftNewProduct,
      editingInProgress,
      importMetaNotes,
    ],
  );

  const {
    pendingRestore: pendingPurchaseDraft,
    hasPendingRestore: hasPendingPurchaseDraft,
    restoreDraft: restorePurchaseDraft,
    discardDraft: discardPurchaseDraft,
    clearSavedDraft: clearPurchaseSavedDraft,
  } = useFormDraft({
    storageKey: purchaseFormDraftKey(storeId),
    value: purchaseDraftSnapshot,
    isEmpty: isPurchaseFormDraftEmpty,
  });

  const applyPurchaseFormDraft = useCallback((d: PurchaseFormDraft) => {
    setSupplierId(d.supplierId);
    setSupplierQ(d.supplierQ);
    supplierPickedLabelRef.current = d.supplierId ? d.supplierQ : null;
    setInvoiceNo(d.invoiceNo);
    setInvoiceDate(d.invoiceDate);
    setLines(d.lines);
    setDraft(d.draftLine);
    setDraftQ(d.draftQ);
    setDraftNewProduct(d.draftNewProduct);
    setEditingInProgress(d.editingInProgress);
    setImportMetaNotes(d.importMetaNotes);
    setDraftKey((k) => k + 1);
    setLinkRowIndex(null);
    setLinkSearchQ("");
    setLinkHits([]);
    setMsg(null);
  }, []);

  const searchSuppliers = useCallback(async (query: string, signal?: AbortSignal) => {
    const q = query.trim();
    if (q.length < 1) return;
    try {
      const res = await fetch(`/api/suppliers?q=${encodeURIComponent(q)}`, { signal });
      const data = await res.json();
      if (res.ok) {
        setSupplierHits((data.suppliers ?? []) as Supplier[]);
      }
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
    if (
      supplierId &&
      supplierPickedLabelRef.current !== null &&
      supplierQ.trim() === supplierPickedLabelRef.current
    ) {
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void searchSuppliers(supplierQ, ac.signal);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [supplierQ, supplierId, searchSuppliers]);

  useEffect(() => {
    if (supplierHits.length > 0) setSupplierHitHi(0);
    else setSupplierHitHi(-1);
  }, [supplierHits]);

  useLayoutEffect(() => {
    if (supplierHitHi < 0 || !supplierHitsListRef.current) return;
    const el = supplierHitsListRef.current.querySelector(`[data-supplier-hits-idx="${supplierHitHi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [supplierHitHi, supplierHits]);

  function handlePickSupplier(s: Supplier) {
    setSupplierId(s.id);
    setSupplierQ(s.name);
    supplierPickedLabelRef.current = s.name.trim();
    setSupplierHits([]);
    setSupplierHitHi(-1);
  }

  function onSupplierSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const listOpen =
      supplierFocused && supplierQ.trim().length > 0 && supplierHits.length > 0;
    if (!listOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSupplierHitHi((h) => {
        if (supplierHits.length === 0) return -1;
        if (h < 0) return 0;
        return Math.min(supplierHits.length - 1, h + 1);
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSupplierHitHi((h) => {
        if (supplierHits.length === 0) return -1;
        if (h < 0) return supplierHits.length - 1;
        return Math.max(0, h - 1);
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const i = supplierHitHi >= 0 ? supplierHitHi : 0;
      const row = supplierHits[i];
      if (row) handlePickSupplier(row);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSupplierHits([]);
      setSupplierHitHi(-1);
    }
  }

  const searchProducts = useCallback(async (query: string, signal?: AbortSignal) => {
    try {
      const hits = await fetchPurchaseProductSearchHits(query, signal);
      setDraftHits(hits);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }, []);

  useEffect(() => {
    const t = draftQ.trim();
    if (t.length < 1) {
      setDraftHits([]);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void searchProducts(t, ac.signal);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [draftQ, searchProducts]);

  useEffect(() => {
    if (linkRowIndex === null) {
      setLinkHits([]);
      return;
    }
    const t = linkSearchQ.trim();
    if (t.length < 1) {
      setLinkHits([]);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchPurchaseProductSearchHits(t, ac.signal)
        .then((hits) => {
          if (!ac.signal.aborted) setLinkHits(hits);
        })
        .catch((e) => {
          if (e instanceof Error && e.name === "AbortError") return;
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [linkSearchQ, linkRowIndex]);

  useEffect(() => {
    if (linkHits.length > 0) setLinkHitHi(0);
    else setLinkHitHi(-1);
  }, [linkHits]);

  useEffect(() => {
    if (draftHits.length > 0) setDraftHitHi(0);
    else setDraftHitHi(-1);
  }, [draftHits]);

  useLayoutEffect(() => {
    if (draftHitHi < 0 || !draftHitsListRef.current) return;
    const el = draftHitsListRef.current.querySelector(`[data-draft-hits-idx="${draftHitHi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [draftHitHi, draftHits]);

  useLayoutEffect(() => {
    if (linkHitHi < 0 || !linkHitsListRef.current) return;
    const el = linkHitsListRef.current.querySelector(`[data-link-hits-idx="${linkHitHi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [linkHitHi, linkHits]);

  const updatePurchaseDropdownRects = useCallback(() => {
    if (typeof window === "undefined") return;
    const draftOpen =
      draftQ.trim().length > 0 &&
      draftHits.length > 0 &&
      !draftNewProduct &&
      !draft.productId;
    const draftAnchor = preferVisibleAnchor(draftAnchorMobileRef.current, draftAnchorRef.current);
    if (draftOpen && draftAnchor) {
      setDraftPopRect(anchorRectBelow(draftAnchor));
    } else {
      setDraftPopRect(null);
    }
    const linkOpen =
      linkRowIndex !== null &&
      linkSearchQ.trim().length > 0 &&
      linkHits.length > 0;
    const linkAnchor = preferVisibleAnchor(linkAnchorMobileRef.current, linkAnchorRef.current);
    if (linkOpen && linkAnchor) {
      setLinkPopRect(anchorRectBelow(linkAnchor));
    } else {
      setLinkPopRect(null);
    }
    const supplierOpen =
      supplierFocused && supplierHits.length > 0 && supplierQ.trim().length > 0;
    if (supplierOpen && supplierAnchorRef.current) {
      setSupplierPopRect(anchorRectBelow(supplierAnchorRef.current));
    } else {
      setSupplierPopRect(null);
    }
  }, [
    draft.productId,
    draftNewProduct,
    draftHits.length,
    draftQ,
    linkRowIndex,
    linkHits.length,
    linkSearchQ,
    supplierFocused,
    supplierHits.length,
    supplierQ,
  ]);

  useLayoutEffect(() => {
    updatePurchaseDropdownRects();
  }, [updatePurchaseDropdownRects, draftHitHi, linkHitHi, supplierHitHi, draftHits, linkHits, supplierHits]);

  useEffect(() => {
    const open = draftPopRect != null || linkPopRect != null || supplierPopRect != null;
    if (!open) return;
    const onScrollOrResize = () => updatePurchaseDropdownRects();
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("scroll", onScrollOrResize, opts);
    window.addEventListener("resize", onScrollOrResize);
    const scrollEl = purchaseTableScrollRef.current;
    const mobileEl = purchaseMobileScrollRef.current;
    scrollEl?.addEventListener("scroll", onScrollOrResize, opts);
    mobileEl?.addEventListener("scroll", onScrollOrResize, opts);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, opts);
      window.removeEventListener("resize", onScrollOrResize);
      scrollEl?.removeEventListener("scroll", onScrollOrResize, opts);
      mobileEl?.removeEventListener("scroll", onScrollOrResize, opts);
    };
  }, [draftPopRect, linkPopRect, supplierPopRect, updatePurchaseDropdownRects]);

  useEffect(() => {
    const draftOpen = draftProductPickerOpen();
    const linkOpen = linkProductPickerOpen();
    const supplierOpen =
      supplierFocused && supplierHits.length > 0 && supplierQ.trim().length > 0;
    if (!draftOpen && !linkOpen && !supplierOpen) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Node | null;
      if (
        draftHitsListRef.current?.contains(t) ||
        linkHitsListRef.current?.contains(t) ||
        supplierHitsListRef.current?.contains(t)
      ) {
        e.stopPropagation();
      }
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [draftHits.length, draft.productId, draftNewProduct, draftQ, linkHits.length, linkRowIndex, linkSearchQ, supplierFocused, supplierHits.length, supplierQ]);

  function applyDefaultsToLine(base: Line, d: LineDefaults): Line {
    const pack = typeof d.pack === "number" && d.pack >= 1 ? Math.floor(d.pack) : 1;
    const strips = purchaseLineStripQty(base);
    const freeStrips = purchaseLineFreeStripQty({ freeQty: d.freeQty ?? 0, pack });
    return {
      ...base,
      pack,
      quantity: purchaseLineQuantityFromStrips(strips, pack),
      batchNo: d.batchNo ?? "",
      expiryDate: d.expiryDate ?? "",
      costPrice: d.costPrice ?? 0,
      mrp: d.mrp ?? 0,
      purchaseDiscountPct: d.purchaseDiscountPct ?? 0,
      purchaseDiscountRs: d.purchaseDiscountRs ?? 0,
      schemeDiscountPct: d.schemeDiscountPct ?? 0,
      schemeDiscountRs: d.schemeDiscountRs ?? 0,
      salesDiscountPct: d.salesDiscountPct ?? 0,
      salesDiscountRs: d.salesDiscountRs ?? 0,
      gstPct: snapProductGstPct(typeof d.gstPct === "number" ? d.gstPct : 5),
      freeQty: purchaseLineFreeQtyFromStrips(freeStrips, pack),
    };
  }

  function clearSupplierSearch() {
    setSupplierId("");
    setSupplierQ("");
    supplierPickedLabelRef.current = null;
    setSupplierHits([]);
    setSupplierHitHi(-1);
  }

  function clearDraftSearch() {
    setDraftQ("");
    setDraft(emptyDraftLine());
    setDraftNewProduct(false);
    setDraftHits([]);
    setDraftHitHi(-1);
  }

  function cancelLinkRow() {
    setLinkRowIndex(null);
    setLinkSearchQ("");
    setLinkHits([]);
    setLinkHitHi(-1);
  }

  function startLinkRow(idx: number) {
    const row = lines[idx];
    if (!row) return;
    setLinkRowIndex(idx);
    setLinkSearchQ(row.labelName);
    setLinkHits([]);
    setLinkHitHi(-1);
    requestAnimationFrame(() => {
      document.getElementById(linkSearchId)?.focus();
    });
  }

  /** Product search dropdown + keyboard pick (draft add row). */
  function draftProductPickerOpen() {
    return (
      draftQ.trim().length > 0 &&
      draftHits.length > 0 &&
      !draftNewProduct &&
      !draft.productId
    );
  }

  function linkProductPickerOpen() {
    return (
      linkRowIndex !== null &&
      linkSearchQ.trim().length > 0 &&
      linkHits.length > 0
    );
  }

  async function handleLinkPickProduct(p: PurchaseProductSearchHit) {
    if (linkRowIndex === null || !lines[linkRowIndex]) return;
    const i = linkRowIndex;
    const defs = await fetchLineDefaults(p.id);
    setLines((prev) =>
      prev.map((row, j) => {
        if (j !== i) return row;
        const merged: Line = {
          ...row,
          productId: p.id,
          labelName: p.name,
        };
        return defs ? applySavedSalePricingFromDefaults(merged, defs) : merged;
      }),
    );
    cancelLinkRow();
  }

  async function handlePickProduct(p: PurchaseProductSearchHit) {
    setDraftNewProduct(false);
    const defs = await fetchLineDefaults(p.id);
    if (!defs) {
      setDraft({
        ...emptyDraftLine(),
        productId: p.id,
        labelName: p.name,
      });
    } else {
      setDraft(
        applyDefaultsToLine(
          {
            ...emptyDraftLine(),
            productId: p.id,
            labelName: p.name,
            quantity: 1,
          },
          defs,
        ),
      );
    }
    setDraftQ(p.name);
    setDraftHits([]);
    setDraftHitHi(-1);
  }

  function onLinkSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const listOpen = linkProductPickerOpen();

    if (e.key === "Enter") {
      if (listOpen) {
        e.preventDefault();
        const i = linkHitHi >= 0 ? linkHitHi : 0;
        const row = linkHits[i];
        if (row) void handleLinkPickProduct(row);
      }
      return;
    }

    if (!listOpen) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelLinkRow();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setLinkHitHi((h) => {
        if (linkHits.length === 0) return -1;
        if (h < 0) return 0;
        return Math.min(linkHits.length - 1, h + 1);
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setLinkHitHi((h) => {
        if (linkHits.length === 0) return -1;
        if (h < 0) return linkHits.length - 1;
        return Math.max(0, h - 1);
      });
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelLinkRow();
    }
  }

  function onDraftSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const listOpen = draftProductPickerOpen();

    if (e.key === "Enter") {
      if (listOpen) {
        e.preventDefault();
        const i = draftHitHi >= 0 ? draftHitHi : 0;
        const row = draftHits[i];
        if (row) void handlePickProduct(row);
        return;
      }
      if (draft.productId && !draftNewProduct) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[data-purchase-line="draft"][data-purchase-field="pack"]')
          ?.focus();
        return;
      }
      if (draftNewProduct) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[data-purchase-line="draft"][data-purchase-field="pack"]')
          ?.focus();
        return;
      }
      if (draftQ.trim().length > 0) {
        e.preventDefault();
        openNewProductModal();
        return;
      }
    }

    if (e.key === "ArrowRight" && draft.productId && !draftNewProduct) {
      e.preventDefault();
      document
        .querySelector<HTMLInputElement>('[data-purchase-line="draft"][data-purchase-field="pack"]')
        ?.focus();
      return;
    }

    if (!listOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDraftHitHi((h) => {
        if (draftHits.length === 0) return -1;
        if (h < 0) return 0;
        return Math.min(draftHits.length - 1, h + 1);
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setDraftHitHi((h) => {
        if (draftHits.length === 0) return -1;
        if (h < 0) return draftHits.length - 1;
        return Math.max(0, h - 1);
      });
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setDraftQ("");
      setDraftHits([]);
      setDraftHitHi(-1);
    }
  }

  function commitDraft() {
    if (!draft.batchNo.trim() || !draft.expiryDate) {
      setMsg("Fill batch and expiry before adding the line.");
      return;
    }
    const hasCatalog = !!draft.productId;
    const hasNew = draftNewProduct && draft.labelName.trim().length > 0;
    if (!hasCatalog && !hasNew) {
      setMsg("Pick a catalog product from search, or click + to add a new product.");
      return;
    }
    setMsg(null);
    setLines((prev) => [...prev, { ...draft, key: randomKey() }]);
    setDraft(emptyDraftLine());
    setDraftNewProduct(false);
    setDraftQ("");
    setDraftHits([]);
    setDraftHitHi(-1);
    setDraftKey((k) => k + 1);
    requestAnimationFrame(() => {
      document.getElementById(draftSearchId)?.focus({ preventScroll: true });
    });
  }

  function openNewProductModal(opts?: { edit?: boolean; lineIndex?: number }) {
    setDraftHits([]);
    setDraftHitHi(-1);
    setDraftPopRect(null);
    const lineIdx = opts?.lineIndex;
    if (lineIdx !== undefined) {
      const row = lines[lineIdx];
      if (!row || row.productId) return;
      setNewProductModalLineIndex(lineIdx);
      setNewProductModalInitial({
        name: row.labelName,
        genericName: row.genericName ?? "",
        packSize: row.pack,
        reorderMin: row.catalogReorderMin ?? 0,
        gstPct: row.catalogGstPct ?? row.gstPct ?? 5,
        productCategory: row.catalogProductCategory,
        productType: row.catalogProductType,
        brandId: row.catalogBrandId ?? null,
        brandName: row.manufacturer ?? "",
        drugCode: row.catalogDrugCode ?? "",
      });
    } else if (opts?.edit && draftNewProduct) {
      setNewProductModalLineIndex(null);
      setNewProductModalInitial({
        name: draft.labelName,
        genericName: draft.genericName ?? "",
        packSize: draft.pack,
        reorderMin: draft.catalogReorderMin ?? 0,
        gstPct: draft.catalogGstPct ?? 5,
        productCategory: draft.catalogProductCategory,
        productType: draft.catalogProductType,
        brandId: draft.catalogBrandId ?? null,
        brandName: draft.manufacturer ?? "",
        drugCode: draft.catalogDrugCode ?? "",
      });
    } else {
      setNewProductModalLineIndex(null);
      setNewProductModalInitial({
        name: draftQ.trim(),
        packSize: Math.max(1, draft.pack || 1),
      });
    }
    setMsg(null);
    setNewProductModalOpen(true);
  }

  function applyNewProductModal(v: PurchaseNewProductModalResult) {
    setMsg(null);
    if (newProductModalLineIndex !== null) {
      const i = newProductModalLineIndex;
      setLines((prev) =>
        prev.map((row, j) => {
          if (j !== i) return row;
          return {
            ...row,
            productId: null,
            labelName: v.name,
            genericName: v.genericName.trim() || undefined,
            manufacturer: v.brandName.trim() || undefined,
            catalogBrandId: v.brandId,
            catalogReorderMin: v.reorderMin,
            catalogGstPct: v.gstPct,
            catalogProductCategory: v.productCategory,
            catalogProductType: v.productType,
            catalogDrugCode:
              v.productCategory === "JANAUSHADHI" && v.drugCode.trim()
                ? v.drugCode.trim()
                : undefined,
            pack: v.packSize,
            gstPct: v.gstPct,
            quantity: purchaseLineQuantityFromStrips(purchaseLineStripQty(row), v.packSize),
          };
        }),
      );
      setNewProductModalLineIndex(null);
    } else {
      setDraft((d) => ({
        ...d,
        productId: null,
        labelName: v.name,
        genericName: v.genericName.trim() || undefined,
        manufacturer: v.brandName.trim() || undefined,
        catalogBrandId: v.brandId,
        catalogReorderMin: v.reorderMin,
        catalogGstPct: v.gstPct,
        catalogProductCategory: v.productCategory,
        catalogProductType: v.productType,
        catalogDrugCode:
          v.productCategory === "JANAUSHADHI" && v.drugCode.trim() ? v.drugCode.trim() : undefined,
        pack: v.packSize,
        gstPct: v.gstPct,
        quantity: purchaseLineQuantityFromStrips(purchaseLineStripQty(d), v.packSize),
      }));
      setDraftNewProduct(true);
      setDraftQ("");
      setDraftHits([]);
      setDraftHitHi(-1);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLInputElement>('[data-purchase-line="draft"][data-purchase-field="pack"]')
          ?.focus();
      });
    }
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  function updateDraft(patch: Partial<Line>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  const purchaseBillTotals = useMemo(() => purchaseBillTotalsFromLines(lines), [lines]);

  async function applyInvoiceJson(raw: string) {
    setImportErr(null);
    let data: InvoiceBillJson;
    try {
      data = JSON.parse(raw) as InvoiceBillJson;
    } catch {
      setImportErr("Invalid JSON.");
      return;
    }

    const inv = data.invoice_details;
    if (inv?.invoice_number) setInvoiceNo(inv.invoice_number);
    if (inv?.invoice_date) {
      const iso = parseDdMmYyyyToIso(inv.invoice_date);
      if (iso) setInvoiceDate(iso);
    }

    setBillingPreview(data.billing_summary ?? null);
    setImportMetaNotes(buildImportMetaNotes(data));

    const items = data.items ?? [];
    const nextLines: Line[] = [];

    for (const it of items) {
      const rawName = it.product_name?.trim() ?? "";
      if (!rawName) continue;
      const label = normalizeInvoiceProductName(rawName);
      const expiryIso = it.expiry ? expiryMmYyToIso(it.expiry) : null;
      const pk = coercePackFromImport(it.pack);
      const invQty = Number(it.quantity);
      const invFree = Number(it.scheme_quantity);
      /** Distributor qty is strip count → smallest units for inventory */
      const qtySmallest =
        Number.isFinite(invQty) && invQty > 0 ? Math.floor(invQty) * pk : pk;
      const freeSmallest =
        Number.isFinite(invFree) && invFree > 0 ? Math.floor(invFree) * pk : 0;
      const match = await fetchProductMatch(label);

      let line: Line = {
        key: randomKey(),
        productId: match?.id ?? null,
        labelName: match?.name ?? label,
        manufacturer: it.manufacturer,
        pack: pk,
        batchNo: it.batch?.trim() ?? "",
        expiryDate: expiryIso ?? "",
        quantity: qtySmallest,
        costPrice: typeof it.trade_price === "number" ? it.trade_price : Number(it.trade_price) || 0,
        mrp: typeof it.mrp === "number" ? it.mrp : Number(it.mrp) || 0,
        hsn: it.hsn_code,
        purchaseDiscountPct:
          typeof it.purchase_discount_pct === "number"
            ? it.purchase_discount_pct
            : Number(it.purchase_discount_pct) || 0,
        purchaseDiscountRs:
          typeof it.purchase_discount_rs === "number"
            ? it.purchase_discount_rs
            : Number(it.purchase_discount_rs) || 0,
        schemeDiscountPct:
          typeof it.scheme_discount_pct === "number"
            ? it.scheme_discount_pct
            : Number(it.scheme_discount_pct) || 0,
        schemeDiscountRs:
          typeof it.scheme_discount_rs === "number"
            ? it.scheme_discount_rs
            : Number(it.scheme_discount_rs) || 0,
        salesDiscountPct: 0,
        salesDiscountRs: 0,
        freeQty: freeSmallest,
        gstPct: snapProductGstPct(
          typeof it.gst_percent === "number" ? it.gst_percent : Number(it.gst_percent) || 0,
        ),
      };

      if (match?.id) {
        const defs = await fetchLineDefaults(match.id);
        if (defs) line = applySavedSalePricingFromDefaults(line, defs);
      }

      nextLines.push(line);
    }

    setLines(nextLines);
    setJsonPaste("");
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      if (!supplierId) {
        setMsg("Supplier is required.");
        return;
      }
      if (!invoiceNo.trim()) {
        setMsg("Invoice number is required.");
        return;
      }
      if (!invoiceDate.trim()) {
        setMsg("Invoice date is required.");
        return;
      }

      for (const l of lines) {
        if (!l.productId && !l.labelName.trim()) {
          setMsg("Each line needs a product name (use + next to the product search if it is not in the catalog yet).");
          return;
        }
      }

      const payloadLines = lines.map((l) => {
        const base = {
          batchNo: l.batchNo,
          expiryDate: l.expiryDate,
          quantity: l.quantity,
          costPrice: l.costPrice,
          mrp: l.mrp,
          pack: Math.max(1, Math.trunc(l.pack) || 1),
          purchaseDiscountPct: l.purchaseDiscountPct,
          purchaseDiscountRs: l.purchaseDiscountRs,
          schemeDiscountPct: l.schemeDiscountPct,
          schemeDiscountRs: l.schemeDiscountRs,
          salesDiscountPct: l.salesDiscountPct,
          salesDiscountRs: l.salesDiscountRs,
          freeQty: l.freeQty,
          gstPct: snapProductGstPct(l.gstPct),
        };
        if (l.productId) {
          return { ...base, productId: l.productId };
        }
        const np: {
          name: string;
          brand?: string;
          brandId?: string;
          genericName?: string;
          drugCode?: string;
          packSize: number;
          unit?: string;
          hsn?: string;
          reorderMin: number;
          gstPct: number;
          productCategory?: ProductCategory;
          productType?: ProductType;
        } = {
          name: l.labelName,
          packSize: Math.max(1, Math.trunc(l.pack) || 1),
          reorderMin: l.catalogReorderMin ?? 0,
          gstPct: l.catalogGstPct ?? 5,
          productCategory: l.catalogProductCategory,
          productType: l.catalogProductType,
        };
        const bid = l.catalogBrandId?.trim();
        if (bid) {
          np.brandId = bid;
        } else if (l.manufacturer?.trim()) {
          np.brand = l.manufacturer.trim();
        }
        if (l.genericName?.trim()) np.genericName = l.genericName.trim();
        if (l.catalogProductCategory === "JANAUSHADHI" && l.catalogDrugCode?.trim()) {
          np.drugCode = l.catalogDrugCode.trim();
        }
        if (l.unit?.trim()) np.unit = l.unit.trim();
        if (l.hsn?.trim()) np.hsn = l.hsn.trim();
        return {
          ...base,
          newProduct: np,
        };
      });

      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          invoiceRef: invoiceNo.trim() || undefined,
          invoiceDate: invoiceDate.trim(),
          notes: importMetaNotes.trim() || undefined,
          complete: !editingInProgress,
          lines: payloadLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Failed");
        return;
      }
      setMsg("Purchase saved.");
      clearPurchaseSavedDraft();
      setLines([]);
      setDraft(emptyDraftLine());
      setDraftQ("");
      setDraftHits([]);
      setDraftHitHi(-1);
      setDraftKey((k) => k + 1);
      setBillingPreview(null);
      setImportMetaNotes("");
      setEditingInProgress(true);
      setInvoiceNo("");
      setInvoiceDate("");
      setSupplierId("");
      setSupplierQ("");
      supplierPickedLabelRef.current = null;
      setSupplierHits([]);
      setSupplierHitHi(-1);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const submitRef = useRef(submit);
  submitRef.current = submit;
  const modalOpenRef = useRef(false);
  modalOpenRef.current = newProductModalOpen;

  useEffect(() => {
    const onDoc = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      if (modalOpenRef.current) return;
      e.preventDefault();
      void submitRef.current();
    };
    window.addEventListener("keydown", onDoc, true);
    return () => window.removeEventListener("keydown", onDoc, true);
  }, []);

  const purchaseNavRowKeys = useMemo(() => [...lines.map((_, i) => String(i)), "draft"], [lines]);

  const onPurchaseLineFieldKeyDown = useCallback(
    (
      e: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>,
      navRowKey: string,
      field: (typeof PURCHASE_FORM_LINE_FIELDS)[number],
    ) => {
      if (busy) return;
      const k = e.key;
      if (k === "Enter" && navRowKey === "draft" && field === "saleRate") {
        e.preventDefault();
        const btn = document.querySelector<HTMLButtonElement>(
          '[data-purchase-line="draft"][data-purchase-field="add"]',
        );
        if (btn && !btn.disabled) btn.focus();
        return;
      }
      if (k === "ArrowDown" && navRowKey === "draft" && field === "saleRate") {
        e.preventDefault();
        const btn = document.querySelector<HTMLButtonElement>(
          '[data-purchase-line="draft"][data-purchase-field="add"]',
        );
        if (btn && !btn.disabled) {
          btn.focus();
          return;
        }
      }
      if (k === "ArrowDown" || k === "ArrowUp" || k === "ArrowLeft" || k === "ArrowRight" || k === "Enter") {
        let dRow = 0;
        let dField = 0;
        if (k === "ArrowDown") dRow = 1;
        else if (k === "ArrowUp") dRow = -1;
        else if (k === "ArrowRight" || k === "Enter") dField = 1;
        else if (k === "ArrowLeft") dField = -1;
        e.preventDefault();
        navigatePurchaseTable(purchaseNavRowKeys, PURCHASE_FORM_LINE_FIELDS, navRowKey, field, dRow, dField);
      }
    },
    [busy, purchaseNavRowKeys],
  );

  function renderCommittedProductHeader(line: Line, idx: number) {
    return (
      <>
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50" title={line.labelName}>
              {line.labelName}
            </p>
            {(line.manufacturer || line.genericName || line.hsn) && (
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {[line.manufacturer, line.genericName, line.hsn ? `HSN ${line.hsn}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          {line.productId ? (
            linkRowIndex !== idx && (
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 touch-manipulation hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                title="Change catalog product"
                aria-label={`Change catalog product for line ${idx + 1}`}
                onClick={() => startLinkRow(idx)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 touch-manipulation hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900"
                title="Edit product details"
                aria-label={`Edit product details for line ${idx + 1}`}
                onClick={() => openNewProductModal({ edit: true, lineIndex: idx })}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <span className="shrink-0 self-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                New
              </span>
            </>
          )}
        </div>
        {!line.productId && linkRowIndex !== idx && (
          <button
            type="button"
            className="mt-1 text-sm text-brand-blue-light touch-manipulation hover:underline"
            onClick={() => startLinkRow(idx)}
          >
            Link existing product…
          </button>
        )}
        {linkRowIndex === idx && (
          <div ref={linkAnchorMobileRef} className="relative mt-2 min-w-0 w-full rounded-lg border border-sky-200 bg-sky-50/80 p-2 dark:border-sky-900 dark:bg-sky-950/30">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-blue-light">
              {line.productId ? "Change catalog product" : "Link to catalog product"}
            </p>
            <label className="sr-only" htmlFor={linkSearchIdMobile}>
              Search catalog to link row {idx + 1}
            </label>
            <PurchaseProductSearchField
              id={linkSearchIdMobile}
              value={linkSearchQ}
              onChange={setLinkSearchQ}
              onKeyDown={onLinkSearchKeyDown}
              showClear={linkSearchQ.length > 0}
              onClear={cancelLinkRow}
              showNewProduct={false}
              ariaLabel={`Search catalog to link ${line.labelName}`}
            />
          </div>
        )}
      </>
    );
  }

  function renderDraftProductHeader(line: Line) {
    return (
      <div ref={draftAnchorMobileRef} className="relative min-w-0">
        {draftNewProduct ? (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-amber-950 dark:text-amber-100" title={line.labelName}>
                {line.labelName}
              </span>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 touch-manipulation hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900"
                title="Edit product details"
                aria-label="Edit new product details"
                onClick={() => openNewProductModal({ edit: true })}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              className="self-start text-sm font-medium text-brand-blue-light touch-manipulation hover:underline"
              onClick={() => {
                setDraftNewProduct(false);
                setDraft(emptyDraftLine());
                setDraftQ("");
              }}
            >
              Search catalog instead
            </button>
          </div>
        ) : (
          <div className="relative min-w-0 w-full">
            <label className="sr-only" htmlFor={draftSearchIdMobile}>
              Search product to add line
            </label>
            <PurchaseProductSearchField
              id={draftSearchIdMobile}
              value={draftQ}
              onChange={(v) => {
                setDraftQ(v);
                if (draft.productId && v !== draft.labelName) {
                  setDraft(emptyDraftLine());
                  setDraftQ(v);
                }
              }}
              onKeyDown={onDraftSearchKeyDown}
              showClear={draftQ.length > 0 || !!draft.productId}
              onClear={clearDraftSearch}
              showNewProduct={!draft.productId && !draftNewProduct}
              onNewProduct={() => openNewProductModal()}
              ariaLabel="Search catalog product to add"
            />
          </div>
        )}
      </div>
    );
  }

  function renderMobileLineCard(line: Line, i: number | "draft") {
    const isDraft = i === "draft";
    const idx = typeof i === "number" ? i : -1;
    const upd = isDraft ? updateDraft : (patch: Partial<Line>) => updateLine(idx, patch);
    const draftLocked = isDraft && !line.productId && !draftNewProduct;
    const rowKey = isDraft ? `mobile-draft-${draftKey}` : `mobile-${line.key}`;

    return (
      <PurchaseLineMobileCard
        key={rowKey}
        line={line}
        expiryYmd={line.expiryDate}
        onExpiryChange={(ymd) => upd({ expiryDate: ymd })}
        onPatch={(patch) => upd(patch)}
        disabled={draftLocked}
        isDraft={isDraft}
        index={isDraft ? undefined : idx + 1}
        product={isDraft ? renderDraftProductHeader(line) : renderCommittedProductHeader(line, idx)}
        action={
          isDraft ? (
            <button
              type="button"
              disabled={!line.productId && !draftNewProduct}
              className="w-full rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-3 py-2 text-sm font-medium text-white shadow touch-manipulation disabled:opacity-40"
              onClick={() => commitDraft()}
            >
              Add
            </button>
          ) : (
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-sm text-red-600 touch-manipulation hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => removeLine(idx)}
              aria-label="Remove line"
            >
              Remove
            </button>
          )
        }
      />
    );
  }

  function renderLineInputs(line: Line, i: number | "draft") {
    const isDraft = i === "draft";
    const idx = typeof i === "number" ? i : -1;
    const upd = isDraft ? updateDraft : (patch: Partial<Line>) => updateLine(idx, patch);
    const rowKey = isDraft ? `draft-${draftKey}` : line.key;
    /** Draft row locked until a catalog item is picked or “New product” mode is on. */
    const draftLocked = isDraft && !line.productId && !draftNewProduct;
    const navRowKey = isDraft ? "draft" : String(idx);
    const plKd = (field: (typeof PURCHASE_FORM_LINE_FIELDS)[number]) => ({
      "data-purchase-line": navRowKey,
      "data-purchase-field": field,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>) =>
        onPurchaseLineFieldKeyDown(e, navRowKey, field),
    });
    const marginPct = purchaseLineMarginPercent(line);

    return (
      <Fragment key={rowKey}>
      <tr
        className={
          isDraft ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "dark:bg-zinc-900/40"
        }
      >
        <td
          data-label={isDraft ? "" : "No."}
          className={`${purchaseFormSlNoCol} align-middle px-0 py-1.5 text-center tabular-nums text-xs text-zinc-500 dark:text-zinc-400`}
        >
          {!isDraft ? idx + 1 : null}
        </td>
        <td
          data-label="Product"
          className={`sticky left-0 align-middle bg-inherit px-1 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] dark:bg-zinc-900 ${purchaseFormProductCol} ${
            isDraft ? "z-30 overflow-visible" : "z-[1]"
          }`}
        >
          {isDraft ? (
            <div ref={draftAnchorRef} className="relative min-h-[2.5rem]">
              {draftNewProduct ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span
                      className="min-w-0 flex-1 truncate text-sm font-medium text-amber-950 dark:text-amber-100"
                      title={line.labelName}
                    >
                      {line.labelName}
                    </span>
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900"
                      title="Edit product details"
                      aria-label="Edit new product details"
                      onClick={() => openNewProductModal({ edit: true })}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="self-start text-xs font-medium text-brand-blue-light hover:underline"
                    onClick={() => {
                      setDraftNewProduct(false);
                      setDraft(emptyDraftLine());
                      setDraftQ("");
                    }}
                  >
                    Search catalog instead
                  </button>
                </div>
              ) : (
                <div className="relative min-w-0 w-full">
                    <label className="sr-only" htmlFor={draftSearchId}>
                      Search product to add line
                    </label>
                    <PurchaseProductSearchField
                      id={draftSearchId}
                      value={draftQ}
                      onChange={(v) => {
                        setDraftQ(v);
                        if (draft.productId && v !== draft.labelName) {
                          setDraft(emptyDraftLine());
                          setDraftQ(v);
                        }
                      }}
                      onKeyDown={onDraftSearchKeyDown}
                      showClear={draftQ.length > 0 || !!draft.productId}
                      onClear={clearDraftSearch}
                      showNewProduct={!draft.productId && !draftNewProduct}
                      onNewProduct={() => openNewProductModal()}
                      ariaLabel="Search catalog product to add"
                    />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex min-w-0 items-start gap-1">
                <div className="min-w-0 flex-1 leading-tight">
                  <span
                    className="block truncate text-xs font-medium text-zinc-900 dark:text-zinc-50"
                    title={line.labelName}
                  >
                    {line.labelName}
                  </span>
                  {(line.manufacturer || line.genericName || line.hsn) && (
                    <div className="truncate text-[11px] text-zinc-500">
                      {[line.manufacturer, line.genericName, line.hsn ? `HSN ${line.hsn}` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                {line.productId ? (
                  linkRowIndex !== idx && (
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      title="Change catalog product"
                      aria-label={`Change catalog product for line ${idx + 1}`}
                      onClick={() => startLinkRow(idx)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900"
                      title="Edit product details"
                      aria-label={`Edit product details for line ${idx + 1}`}
                      onClick={() => openNewProductModal({ edit: true, lineIndex: idx })}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/80 dark:text-amber-200">
                      New
                    </span>
                  </>
                )}
              </div>
              {!line.productId && linkRowIndex !== idx && (
                <button
                  type="button"
                  className="mt-0.5 text-xs text-brand-blue-light hover:underline"
                  onClick={() => startLinkRow(idx)}
                >
                  Link existing product…
                </button>
              )}
            </>
          )}
        </td>
        <td data-label="Pack" className={`${purchaseFormIntCol} align-middle px-0.5 py-1.5`}>
          <NumericTableInput
            className="w-full rounded border border-zinc-300 px-1 py-1 text-right text-xs dark:border-zinc-600 dark:bg-zinc-950"
            min={1}
            step={1}
            integer
            fallback={1}
            emptyWhenZero={false}
            title="Units per pack (e.g. 10 for 10'S strip; 1 for ML/GM)"
            placeholder="10"
            disabled={draftLocked}
            value={line.pack}
            {...plKd("pack")}
            onChange={(n) => upd(patchPurchaseLinePack(line, Math.max(1, Math.floor(n))))}
          />
        </td>
        <td data-label="Batch" className={`${purchaseFormBatchCol} align-middle px-0.5 py-1.5`}>
          <input
            className="w-full rounded border border-zinc-300 px-0.5 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
            placeholder="Batch"
            disabled={draftLocked}
            value={line.batchNo}
            {...plKd("batchNo")}
            onChange={(e) => upd({ batchNo: e.target.value })}
          />
        </td>
        <td data-label="Expiry" className={`${purchaseFormExpiryCol} align-middle px-0.5 py-1.5`}>
          <ExpiryDateInput
            className="w-full rounded border border-zinc-300 px-0.5 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
            wrapperClassName="min-w-0 w-full"
            disabled={draftLocked}
            value={line.expiryDate}
            {...plKd("expiryDate")}
            onChange={(e) => upd({ expiryDate: e.target.value })}
          />
        </td>
        <td data-label="Qty" className={`${purchaseFormIntCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className="ml-auto w-full rounded border border-zinc-300 px-1 py-1 text-right text-sm dark:border-zinc-600 dark:bg-zinc-950"
            min={1}
            step={1}
            integer
            fallback={1}
            emptyWhenZero={false}
            title="Number of strips (packs) received. Bill rate and MRP are per strip."
            disabled={draftLocked}
            value={purchaseLineStripQty(line)}
            {...plKd("quantity")}
            onChange={(n) =>
              upd(
                resyncPurchaseLineDiscountPatches(line, {
                  quantity: purchaseLineQuantityFromStrips(n, line.pack),
                }),
              )
            }
          />
        </td>
        <td data-label="Free" className={`${purchaseFormIntCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className="ml-auto w-full rounded border border-zinc-300 px-1 py-1 text-right text-sm dark:border-zinc-600 dark:bg-zinc-950"
            min={0}
            step={1}
            integer
            title="Free strips (scheme), same unit as Qty"
            disabled={draftLocked}
            value={purchaseLineFreeStripQty(line)}
            {...plKd("freeQty")}
            onChange={(n) => upd({ freeQty: purchaseLineFreeQtyFromStrips(n, line.pack) })}
          />
        </td>
        <td data-label="Bill rate" className={`${purchaseFormRateCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={purchaseFormNumIn}
            min={0}
            step={0.01}
            disabled={draftLocked}
            title="Bill rate per pack (excluding GST). Sum adds GST from the GST % column."
            value={line.costPrice}
            {...plKd("costPrice")}
            onChange={(n) => upd(resyncPurchaseLineDiscountPatches(line, { costPrice: n }))}
          />
        </td>
        <td data-label="Sch%" className={`${purchaseFormPctCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={`ml-auto w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950`}
            min={0}
            max={100}
            step={0.01}
            disabled={draftLocked}
            value={line.schemeDiscountPct}
            title="Scheme discount % on trade line gross."
            {...plKd("schemeDiscountPct")}
            onChange={(n) => upd(syncSchemeDiscountFromPct(line, n))}
          />
        </td>
        <td data-label="Sch₹" className={`${purchaseFormMoneyCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={`ml-auto w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950`}
            min={0}
            step={0.01}
            disabled={draftLocked}
            value={line.schemeDiscountRs}
            title="Scheme discount ₹ on trade line gross."
            {...plKd("schemeDiscountRs")}
            onChange={(n) => upd(syncSchemeDiscountFromRs(line, n))}
          />
        </td>
        <td data-label="P.Disc %" className={`${purchaseFormPctCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={`ml-auto w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950`}
            min={0}
            max={100}
            step={0.01}
            disabled={draftLocked}
            value={line.purchaseDiscountPct}
            title="Purchase discount % after scheme discount."
            {...plKd("purchaseDiscountPct")}
            onChange={(n) => upd(syncPurchaseDiscountFromPct(line, n))}
          />
        </td>
        <td data-label="P.Disc ₹" className={`${purchaseFormMoneyCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={`ml-auto w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950`}
            min={0}
            step={0.01}
            disabled={draftLocked}
            value={line.purchaseDiscountRs}
            title="Purchase discount ₹ after scheme discount."
            {...plKd("purchaseDiscountRs")}
            onChange={(n) => upd(syncPurchaseDiscountFromRs(line, n))}
          />
        </td>
        <td data-label="S.Disc %" className={`${purchaseFormPctCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={`ml-auto w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950`}
            min={0}
            max={100}
            step={0.01}
            disabled={draftLocked}
            value={line.salesDiscountPct}
            title="Retail sale discount % per pack (POS pricing — not purchase qty)."
            {...plKd("salesDiscountPct")}
            onChange={(n) => upd(syncSalesDiscountFromPct(line, n))}
          />
        </td>
        <td data-label="S.Disc ₹" className={`${purchaseFormMoneyCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={`ml-auto w-full rounded border border-zinc-300 px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950`}
            min={0}
            step={0.01}
            disabled={draftLocked}
            value={line.salesDiscountRs}
            title="Retail sale discount ₹ per pack (POS pricing — not purchase qty)."
            {...plKd("salesDiscountRs")}
            onChange={(n) => upd(syncSalesDiscountFromRs(line, n))}
          />
        </td>
        <td data-label="GST %" className={`${purchaseFormPctCol} align-middle px-0.5 py-1.5 text-right`}>
          <PurchaseGstSelect
            className={purchaseFormNumIn}
            disabled={draftLocked}
            value={line.gstPct}
            {...plKd("gstPct")}
            onChange={(n) => upd({ gstPct: n })}
          />
        </td>
        <td data-label="MRP" className={`${purchaseFormRateCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={purchaseFormNumIn}
            min={0}
            step={0.01}
            title="Printed MRP per pack (same pack as billing rate)"
            disabled={draftLocked}
            value={line.mrp}
            {...plKd("mrp")}
            onChange={(n) => upd(resyncPurchaseLineDiscountPatches(line, { mrp: n }))}
          />
        </td>
        <td data-label="Rate" className={`${purchaseFormRateCol} align-middle px-0.5 py-1.5 text-right`}>
          <NumericTableInput
            className={purchaseFormNumIn}
            min={0}
            step={0.01}
            title="Selling rate per pack; updates S.Disc vs MRP."
            disabled={draftLocked}
            value={purchaseLineSaleRatePerPack(line)}
            {...plKd("saleRate")}
            onChange={(n) => upd(syncSalesDiscountFromRate(line, n))}
          />
        </td>
        <td
          data-label="Mrg"
          className={`${purchaseFormMarginCol} align-middle px-0.5 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400`}
          title="Margin % vs net revenue at sale rate (1 pack)"
        >
          {marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}
        </td>
        <td data-label="Sum" className={`${purchaseFormSumCol} align-middle px-0.5 py-1.5 text-right text-xs tabular-nums text-zinc-800 dark:text-zinc-200`}>
          ₹{purchaseLineCostGross(line).toFixed(2)}
        </td>
        <td data-label="" className={`${purchaseFormActionCol} align-middle px-0.5 py-1.5 text-center`}>
          {isDraft ? (
            <button
              type="button"
              data-purchase-line="draft"
              data-purchase-field="add"
              disabled={!line.productId && !draftNewProduct}
              className="rounded bg-gradient-to-r from-brand-blue to-brand-green px-1.5 py-1 text-[10px] font-medium text-white shadow disabled:opacity-40"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  document.querySelector<HTMLInputElement>('[data-purchase-line="draft"][data-purchase-field="saleRate"]')?.focus();
                }
              }}
              onClick={() => commitDraft()}
            >
              Add
            </button>
          ) : (
            <button
              type="button"
              className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => removeLine(idx)}
              aria-label="Remove line"
            >
              ✕
            </button>
          )}
        </td>
      </tr>
      {!isDraft && linkRowIndex === idx && (
        <tr key={`${rowKey}-link`} className="bg-sky-50/80 dark:bg-sky-950/20">
          <td data-label="" className={`${purchaseFormSlNoCol} bg-inherit px-0 py-2`} aria-hidden="true" />
          <td
            data-label="Link product"
            className={`sticky left-0 z-[2] bg-inherit px-2 py-2 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] dark:bg-zinc-900 ${purchaseFormProductCol}`}
          >
            <div ref={linkAnchorRef} className="relative min-w-0 w-full">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-brand-blue-light">
                {line.productId ? "Change catalog product" : "Link to catalog product"}
              </p>
              <label className="sr-only" htmlFor={linkSearchId}>
                Search catalog to link row {idx + 1}
              </label>
              <PurchaseProductSearchField
                id={linkSearchId}
                value={linkSearchQ}
                onChange={setLinkSearchQ}
                onKeyDown={onLinkSearchKeyDown}
                showClear={linkSearchQ.length > 0}
                onClear={cancelLinkRow}
                showNewProduct={false}
                ariaLabel={`Search catalog to link ${line.labelName}`}
              />
            </div>
          </td>
          <td colSpan={18} className="bg-inherit px-0 py-0" aria-hidden="true" />
        </tr>
      )}
      </Fragment>
    );
  }

  const dropdownMaxH = floatingDropdownMaxHeight();

  const draftListPortal =
    draftPopRect &&
    !draftNewProduct &&
    draftHits.length > 0 &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={draftHitsListRef}
        role="listbox"
        aria-label="Matching products"
        style={{
          position: "fixed",
          top: draftPopRect.top,
          left: draftPopRect.left,
          width: draftPopRect.width,
          zIndex: 100,
          maxHeight: dropdownMaxH,
        }}
        className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
        onWheel={(e) => e.stopPropagation()}
      >
        {draftHits.map((p, idx) => (
          <li
            key={p.id}
            role="option"
            aria-selected={idx === draftHitHi}
            className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
          >
            <PurchaseProductSearchListItem
              hit={p}
              selected={idx === draftHitHi}
              onSelect={() => void handlePickProduct(p)}
              onHover={() => setDraftHitHi(idx)}
              dataIdxAttr="data-draft-hits-idx"
              dataIdxValue={idx}
            />
          </li>
        ))}
      </ul>,
      document.body,
    );

  const linkListPortal =
    linkPopRect &&
    linkHits.length > 0 &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={linkHitsListRef}
        role="listbox"
        aria-label="Matching products to link"
        style={{
          position: "fixed",
          top: linkPopRect.top,
          left: linkPopRect.left,
          width: linkPopRect.width,
          zIndex: 100,
          maxHeight: dropdownMaxH,
        }}
        className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
        onWheel={(e) => e.stopPropagation()}
      >
        {linkHits.map((p, hitIdx) => (
          <li
            key={p.id}
            role="option"
            aria-selected={hitIdx === linkHitHi}
            className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
          >
            <PurchaseProductSearchListItem
              hit={p}
              selected={hitIdx === linkHitHi}
              onSelect={() => void handleLinkPickProduct(p)}
              onHover={() => setLinkHitHi(hitIdx)}
              dataIdxAttr="data-link-hits-idx"
              dataIdxValue={hitIdx}
            />
          </li>
        ))}
      </ul>,
      document.body,
    );

  const supplierListPortal =
    supplierPopRect &&
    supplierHits.length > 0 &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={supplierHitsListRef}
        role="listbox"
        aria-label="Matching suppliers"
        style={{
          position: "fixed",
          top: supplierPopRect.top,
          left: supplierPopRect.left,
          width: supplierPopRect.width,
          zIndex: 100,
          maxHeight: dropdownMaxH,
        }}
        className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
        onWheel={(e) => e.stopPropagation()}
      >
        {supplierHits.map((s, idx) => (
          <li
            key={s.id}
            role="option"
            aria-selected={idx === supplierHitHi}
            className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
          >
            <button
              type="button"
              data-supplier-hits-idx={idx}
              className={`flex w-full justify-between gap-2 px-2 py-2 text-left ${
                idx === supplierHitHi
                  ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
              onMouseEnter={() => setSupplierHitHi(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePickSupplier(s)}
            >
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{s.name}</span>
            </button>
          </li>
        ))}
      </ul>,
      document.body,
    );

  return (
    <>
      {hasPendingPurchaseDraft && pendingPurchaseDraft ? (
        <FormDraftResumeBanner
          title="Unsaved purchase bill found on this device"
          savedAt={pendingPurchaseDraft.savedAt}
          onRestore={() => {
            const data = restorePurchaseDraft();
            if (data) applyPurchaseFormDraft(data);
          }}
          onDiscard={discardPurchaseDraft}
        />
      ) : null}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">New purchase</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="text-zinc-500">
            Supplier <span className="text-red-600 dark:text-red-400" aria-hidden>*</span>
          </span>
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
              ariaRequired
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="text-zinc-500">
            Invoice No <span className="text-red-600 dark:text-red-400" aria-hidden>*</span>
          </span>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            placeholder="e.g. IL-26-1393"
            aria-required={true}
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-500">
            Invoice date <span className="text-red-600 dark:text-red-400" aria-hidden>*</span>
          </span>
          <DatePickerInput
            required
            aria-required={true}
            className="rounded-lg border border-zinc-300 px-2 py-2 dark:border-zinc-600 dark:bg-zinc-950"
            wrapperClassName="mt-1 w-full"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </label>
      </div>

      <div ref={purchaseMobileScrollRef} className="mt-3 space-y-2 md:hidden" aria-label="Purchase items">
        {lines.map((line, i) => renderMobileLineCard(line, i))}
        {renderMobileLineCard(draft, "draft")}
      </div>

      <div
        ref={purchaseTableScrollRef}
        className="mt-5 hidden overflow-y-visible rounded-xl border border-zinc-200 dark:border-zinc-700 md:block"
      >
        <table className="w-full min-w-0 table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-medium leading-tight text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
              <th className={`${purchaseFormSlNoCol} px-0 py-2 text-center font-normal`}>No.</th>
              <th className={`sticky left-0 z-10 bg-zinc-50 px-1 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:bg-zinc-800/80 ${purchaseFormProductCol}`}>
                Product
              </th>
              <th className={`${purchaseFormIntCol} px-0.5 py-1.5`} title="Units per pack (e.g. 10 tablets/strip). Billing rate and MRP are per pack.">
                Pack
              </th>
              <th className={`${purchaseFormBatchCol} px-0.5 py-1.5`}>Batch</th>
              <th className={`${purchaseFormExpiryCol} px-0.5 py-1.5`}>Expiry</th>
              <th className={`${purchaseFormIntCol} px-0.5 py-1.5 text-right`} title="Number of strips (packs) received. Line ₹ = qty × bill rate.">
                Qty
              </th>
              <th className={`${purchaseFormIntCol} px-0.5 py-1.5 text-right`} title="Free strips (scheme), same unit as Qty.">
                Free
              </th>
              <th className={`${purchaseFormRateCol} px-0.5 py-1.5 text-right`} title="PTR per pack (excluding GST); GST % applies on the discounted line value.">
                PTR
              </th>
              <th className={`${purchaseFormPctCol} px-0.5 py-1.5 text-right`} title="Scheme discount % on trade line gross.">
                Sch%
              </th>
              <th className={`${purchaseFormMoneyCol} px-0.5 py-1.5 text-right`} title="Scheme discount ₹ on trade line gross.">
                Sch₹
              </th>
              <th className={`${purchaseFormPctCol} px-0.5 py-1.5 text-right`}>P.Disc%</th>
              <th className={`${purchaseFormMoneyCol} px-0.5 py-1.5 text-right`}>P.Disc₹</th>
              <th className={`${purchaseFormPctCol} px-0.5 py-1.5 text-right`}>S.Disc%</th>
              <th className={`${purchaseFormMoneyCol} px-0.5 py-1.5 text-right`}>S.Disc₹</th>
              <th className={`${purchaseFormPctCol} px-0.5 py-1.5 text-right`}>GST</th>
              <th className={`${purchaseFormRateCol} px-0.5 py-1.5 text-right`} title="Printed MRP per pack">
                MRP
              </th>
              <th
                className={`${purchaseFormRateCol} px-0.5 py-1.5 text-right`}
                title="Selling rate per pack (vs MRP); edits here update S.Disc% and S.Disc₹."
              >
                Rate
              </th>
              <th
                className={`${purchaseFormMarginCol} px-0.5 py-1.5 text-right normal-case`}
                title="Margin % vs net revenue at sale rate (1 pack)"
              >
                Mrg
              </th>
              <th
                className={`${purchaseFormSumCol} px-0.5 py-1.5 text-right`}
                title="Trade line gross: strips × bill rate, before purchase discount and before GST."
              >
                Sum
              </th>
              <th className={`${purchaseFormActionCol} px-0.5 py-1.5 text-center`} aria-label="Add or remove" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lines.map((line, i) => renderLineInputs(line, i))}
            {renderLineInputs(draft, "draft")}
          </tbody>
        </table>
      </div>
      <PurchaseBillTotalsPanel
        netTotal={purchaseBillTotals.netTotal}
        schemeDiscountTotal={purchaseBillTotals.schemeDiscountTotal}
        purchaseDiscountTotal={purchaseBillTotals.purchaseDiscountTotal}
        gstTotal={purchaseBillTotals.gstTotal}
        roundOff={purchaseBillTotals.roundOff}
        grandTotal={purchaseBillTotals.grandTotal}
      />

      <PurchaseNewProductModal
        open={newProductModalOpen}
        onClose={() => {
          setNewProductModalOpen(false);
          setNewProductModalLineIndex(null);
        }}
        initial={newProductModalInitial}
        onValidationError={(message) => setMsg(message)}
        onApply={applyNewProductModal}
      />

      {msg && (
        <p className={`mt-3 text-sm ${msg.includes("saved") ? "text-brand-green" : "text-red-600 dark:text-red-400"}`}>
          {msg}
        </p>
      )}
      <div className="mt-4 space-y-3">
        <PurchaseEditingInProgressSwitch
          checked={editingInProgress}
          disabled={busy}
          onCheckedChange={setEditingInProgress}
        />
        <button
          type="button"
          disabled={busy || lines.length === 0 || !supplierId || !invoiceNo.trim() || !invoiceDate.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-brand-blue to-brand-green py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:opacity-50"
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : "Save Purchase"}
        </button>
      </div>

      <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-700">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Import invoice (JSON / file)</p>
        <p className="mt-1 text-xs text-zinc-500">
          Optional — paste or open a JSON invoice export. Lines are matched to your catalog; unmatched rows show a New tag.
          Sales discount and sale rate come from last saved inventory/purchase data for matched products, not from the bill.
        </p>
        <details className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">Gemini extraction prompt</summary>
          <textarea
            readOnly
            className="mt-2 max-h-48 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 font-mono text-[10px] leading-snug dark:border-zinc-700 dark:bg-zinc-950"
            value={INVOICE_GEMINI_EXTRACTION_PROMPT}
            onFocus={(e) => e.target.select()}
          />
        </details>
        {billingPreview && (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Bill summary (reference)</span>
            {billingPreview.round_off != null && billingPreview.round_off !== 0 ? (
              <span className="ml-2 tabular-nums">
                Round off {billingPreview.round_off > 0 ? "+" : ""}₹{billingPreview.round_off.toFixed(2)}
              </span>
            ) : null}
            {billingPreview.grand_total != null && (
              <span className="ml-2 tabular-nums">Grand total ₹{billingPreview.grand_total.toFixed(2)}</span>
            )}
            {billingPreview.taxable_amount != null && (
              <span className="ml-2 tabular-nums">Taxable ₹{billingPreview.taxable_amount.toFixed(2)}</span>
            )}
          </div>
        )}
        <textarea
          id={jsonInputId}
          className="mt-3 max-h-40 w-full rounded-lg border border-zinc-300 px-2 py-2 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-950"
          placeholder="{ … }"
          value={jsonPaste}
          onChange={(e) => setJsonPaste(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white"
            onClick={() => void applyInvoiceJson(jsonPaste)}
          >
            Apply JSON
          </button>
          <label className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800">
            Pick file
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const t = typeof reader.result === "string" ? reader.result : "";
                  void applyInvoiceJson(t);
                };
                reader.readAsText(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {importErr && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{importErr}</p>}
      </div>
    </div>
      {draftListPortal}
      {linkListPortal}
      {supplierListPortal}
    </>
  );
}
