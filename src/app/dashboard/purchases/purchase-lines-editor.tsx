"use client";

import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ExpiryDateInput } from "@/components/expiry-date-input";
import { NumericTableInput } from "@/components/numeric-table-input";
import { anchorRectBelow, floatingDropdownMaxHeight } from "@/lib/floating-dropdown";
import { DEFAULT_PRODUCT_CATEGORY, type ProductCategory } from "@/lib/product-categories";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import { navigatePurchaseTable } from "@/lib/purchase-table-nav";
import {
  PurchaseNewProductModal,
  type PurchaseNewProductModalInitial,
  type PurchaseNewProductModalResult,
} from "./purchase-new-product-modal";
import { PurchaseBillTotalsPanel } from "./purchase-bill-totals-panel";
import { PurchaseGstSelect } from "./purchase-gst-select";
import { PurchaseLineMobileCard, preferVisibleAnchor } from "./purchase-line-mobile-card";
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
import {
  fetchPurchaseProductSearchHits,
  PurchaseProductSearchField,
  PurchaseProductSearchListItem,
  type PurchaseProductSearchHit,
} from "./purchase-product-search-ui";

function normalizePurchaseLineDraft(l: PurchaseLineDraft): PurchaseLineDraft {
  return { ...l, gstPct: snapProductGstPct(l.gstPct) };
}

export type PurchaseLineDraft = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  batchNo: string;
  expiryYmd: string;
  quantity: number;
  freeQty: number;
  pack: number;
  costPrice: number;
  mrp: number;
  purchaseDiscountPct: number;
  purchaseDiscountRs: number;
  schemeDiscountPct: number;
  schemeDiscountRs: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  gstPct: number;
  /** Set when line was added as a new catalog product (local row before save). */
  catalogBrandId?: string | null;
  catalogReorderMin?: number;
  catalogGstPct?: number;
  catalogProductCategory?: ProductCategory;
  catalogDrugCode?: string;
  manufacturer?: string;
};

/** Match `purchase-form.tsx` line cell inputs */
const cellIn =
  "ml-auto min-w-0 w-full rounded border border-zinc-300 bg-white px-0.5 py-0.5 text-right text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-950";
const slNoCol = "w-[1.25rem] min-w-[1.25rem] max-w-[1.25rem]";
const productCol = "min-w-0 w-[13rem] max-w-[13rem]";
const compactIntCol = "w-[2rem] min-w-[2rem] max-w-[2rem]";
const batchCol = "w-[4.75rem] min-w-[4.75rem] max-w-[4.75rem]";
const expiryCol = "w-[6.25rem] min-w-[6.25rem] max-w-[6.25rem]";
const compactRateCol = "w-[2.625rem] min-w-[2.625rem] max-w-[2.625rem]";
const compactPctCol = "w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem]";
const compactMoneyCol = "w-[2.375rem] min-w-[2.375rem] max-w-[2.375rem]";
const compactMarginCol = "w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem]";
const sumCol = "w-[3.25rem] min-w-[3.25rem] max-w-[3.25rem]";
const actionCol = "w-[2.75rem] min-w-[2.75rem] max-w-[2.75rem]";

const PURCHASE_EDITOR_LINE_FIELDS = [
  "pack",
  "batchNo",
  "expiryYmd",
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

const NEW_LINE_PREFIX = "__new__";
const SEARCH_DEBOUNCE_MS = 350;

function isNewLineId(id: string): boolean {
  return id.startsWith(NEW_LINE_PREFIX);
}

function newLineId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `${NEW_LINE_PREFIX}${crypto.randomUUID()}`
    : `${NEW_LINE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type PurchaseLinesEditorHandle = {
  /** Persists line deletes, updates, and new rows. Returns an error message or null on success. */
  persistLines: () => Promise<string | null>;
};

function emptyAddDraft(): PurchaseLineDraft {
  return {
    id: "__add__",
    productId: "",
    productName: "",
    productSku: "",
    batchNo: "",
    expiryYmd: "",
    quantity: 1,
    freeQty: 0,
    pack: 1,
    costPrice: 0,
    mrp: 0,
    purchaseDiscountPct: 0,
    purchaseDiscountRs: 0,
    schemeDiscountPct: 0,
    schemeDiscountRs: 0,
    salesDiscountPct: 0,
    salesDiscountRs: 0,
    gstPct: 5,
  };
}

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
  gstPct: number;
  freeQty: number;
};

async function fetchLineDefaults(productId: string): Promise<LineDefaults | null> {
  const res = await fetch(`/api/purchases/line-defaults?productId=${encodeURIComponent(productId)}`);
  const data = await res.json();
  if (!res.ok || !data.defaults) return null;
  return data.defaults as LineDefaults;
}

export const PurchaseLinesEditor = forwardRef<
  PurchaseLinesEditorHandle,
  {
    purchaseId: string;
    lines: PurchaseLineDraft[];
    /** When true (purchase marked complete), line edits are disabled */
    disabled?: boolean;
  }
>(function PurchaseLinesEditor({ purchaseId, lines, disabled = false }, ref) {
  const [lineIds, setLineIds] = useState<string[]>(() => lines.map((l) => l.id));
  const [draft, setDraft] = useState<Record<string, PurchaseLineDraft>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, normalizePurchaseLineDraft(l)])),
  );
  const [removedPersistedIds, setRemovedPersistedIds] = useState<Set<string>>(() => new Set());
  const [persisting, setPersisting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addSearchId = useId();
  const addSearchIdMobile = useId();
  const [addDraft, setAddDraft] = useState<PurchaseLineDraft>(() => emptyAddDraft());
  const [addSearchQ, setAddSearchQ] = useState("");
  const [addHits, setAddHits] = useState<PurchaseProductSearchHit[]>([]);
  const [addHitHi, setAddHitHi] = useState(-1);
  const [addPopRect, setAddPopRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const addAnchorRef = useRef<HTMLDivElement>(null);
  const addAnchorMobileRef = useRef<HTMLDivElement>(null);
  const addHitsListRef = useRef<HTMLUListElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const [addNewProduct, setAddNewProduct] = useState(false);
  const [addCatalogBrandId, setAddCatalogBrandId] = useState<string | null>(null);
  const [addManufacturer, setAddManufacturer] = useState("");
  const [addCatalogReorderMin, setAddCatalogReorderMin] = useState(0);
  const [addCatalogGstPct, setAddCatalogGstPct] = useState(5);
  const [addCatalogProductCategory, setAddCatalogProductCategory] =
    useState<ProductCategory>(DEFAULT_PRODUCT_CATEGORY);
  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
  const [newProductModalInitial, setNewProductModalInitial] =
    useState<PurchaseNewProductModalInitial | null>(null);

  const searchProductsForAdd = useCallback(async (query: string, signal?: AbortSignal) => {
    try {
      const hits = await fetchPurchaseProductSearchHits(query, signal);
      setAddHits(hits);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
  }, []);

  function clearAddSearch() {
    setAddSearchQ("");
    setAddDraft(emptyAddDraft());
    setAddNewProduct(false);
    setAddHits([]);
    setAddHitHi(-1);
    setErr(null);
  }

  function resetAddRow() {
    setAddDraft(emptyAddDraft());
    setAddSearchQ("");
    setAddHits([]);
    setAddPopRect(null);
    setAddNewProduct(false);
    setAddCatalogBrandId(null);
    setAddManufacturer("");
    setAddCatalogReorderMin(0);
    setAddCatalogGstPct(5);
    setAddCatalogProductCategory(DEFAULT_PRODUCT_CATEGORY);
  }

  function focusAddRowNameSearch() {
    requestAnimationFrame(() => {
      document.getElementById(addSearchId)?.focus({ preventScroll: true });
    });
  }

  function openAddNewProductModal(opts?: { edit?: boolean }) {
    setAddHits([]);
    setAddHitHi(-1);
    setAddPopRect(null);
    if (opts?.edit && addNewProduct) {
      setNewProductModalInitial({
        name: addDraft.productName,
        packSize: addDraft.pack,
        reorderMin: addCatalogReorderMin,
        gstPct: addCatalogGstPct,
        productCategory: addCatalogProductCategory,
        brandId: addCatalogBrandId,
        brandName: addManufacturer,
        drugCode: addDraft.catalogDrugCode ?? "",
      });
    } else {
      setNewProductModalInitial({
        name: addSearchQ.trim(),
        packSize: Math.max(1, addDraft.pack || 1),
      });
    }
    setNewProductModalOpen(true);
  }

  function applyAddNewProductModal(v: PurchaseNewProductModalResult) {
    setAddNewProduct(true);
    setAddDraft({
      ...emptyAddDraft(),
      productId: "",
      productName: v.name,
      pack: v.packSize,
      quantity: purchaseLineQuantityFromStrips(1, v.packSize),
      gstPct: v.gstPct,
      catalogBrandId: v.brandId,
      manufacturer: v.brandName.trim() || undefined,
      catalogReorderMin: v.reorderMin,
      catalogGstPct: v.gstPct,
      catalogProductCategory: v.productCategory,
      catalogDrugCode:
        v.productCategory === "JANAUSHADHI" && v.drugCode.trim() ? v.drugCode.trim() : undefined,
    });
    setAddCatalogBrandId(v.brandId);
    setAddManufacturer(v.brandName);
    setAddCatalogReorderMin(v.reorderMin);
    setAddCatalogGstPct(v.gstPct);
    setAddCatalogProductCategory(v.productCategory);
    setAddSearchQ("");
    setAddHits([]);
    setAddHitHi(-1);
    setErr(null);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLInputElement>('[data-purchase-line="__add__"][data-purchase-field="pack"]')
        ?.focus();
    });
  }

  useEffect(() => {
    const q = addSearchQ.trim();
    if (addDraft.productId || addNewProduct) {
      setAddHits([]);
      return;
    }
    if (q.length < 1) {
      setAddHits([]);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => void searchProductsForAdd(q, ac.signal), SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [addSearchQ, addDraft.productId, addNewProduct, searchProductsForAdd]);

  useEffect(() => {
    if (addHits.length > 0) setAddHitHi(0);
    else setAddHitHi(-1);
  }, [addHits]);

  useLayoutEffect(() => {
    if (addHitHi < 0 || !addHitsListRef.current) return;
    const el = addHitsListRef.current.querySelector(`[data-add-hits-idx="${addHitHi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [addHitHi, addHits]);

  useLayoutEffect(() => {
    const open =
      !disabled && addHits.length > 0 && !addDraft.productId && addSearchQ.trim().length > 0;
    const anchor = preferVisibleAnchor(addAnchorMobileRef.current, addAnchorRef.current);
    if (open && anchor) {
      setAddPopRect(anchorRectBelow(anchor));
    } else {
      setAddPopRect(null);
    }
  }, [disabled, addHits.length, addDraft.productId, addSearchQ, addHitHi]);

  useEffect(() => {
    if (!addPopRect) return;
    const upd = () => {
      const anchor = preferVisibleAnchor(addAnchorMobileRef.current, addAnchorRef.current);
      if (anchor) setAddPopRect(anchorRectBelow(anchor));
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("scroll", upd, opts);
    window.addEventListener("resize", upd);
    const scrollEl = tableScrollRef.current;
    const mobileEl = mobileScrollRef.current;
    scrollEl?.addEventListener("scroll", upd, opts);
    mobileEl?.addEventListener("scroll", upd, opts);
    return () => {
      window.removeEventListener("scroll", upd, opts);
      window.removeEventListener("resize", upd);
      scrollEl?.removeEventListener("scroll", upd, opts);
      mobileEl?.removeEventListener("scroll", upd, opts);
    };
  }, [addPopRect]);

  const handlePickProductForAdd = useCallback(async (p: PurchaseProductSearchHit) => {
    const defs = await fetchLineDefaults(p.id);
    const base = emptyAddDraft();
    if (!defs) {
      setAddDraft({
        ...base,
        productId: p.id,
        productName: p.name,
        productSku: "",
        gstPct: 5,
      });
    } else {
      setAddDraft({
        ...base,
        productId: p.id,
        productName: p.name,
        productSku: "",
        batchNo: defs.batchNo,
        expiryYmd: defs.expiryDate,
        pack: defs.pack,
        quantity: purchaseLineQuantityFromStrips(1, defs.pack),
        costPrice: defs.costPrice,
        mrp: defs.mrp,
        purchaseDiscountPct: defs.purchaseDiscountPct,
        purchaseDiscountRs: defs.purchaseDiscountRs,
        schemeDiscountPct: defs.schemeDiscountPct,
        schemeDiscountRs: defs.schemeDiscountRs,
        salesDiscountPct: defs.salesDiscountPct,
        salesDiscountRs: defs.salesDiscountRs,
        gstPct: defs.gstPct,
        freeQty: defs.freeQty,
      });
    }
    setAddSearchQ(p.name);
    setAddHits([]);
    setAddHitHi(-1);
    setErr(null);
  }, []);

  function patchAddDraft(patch: Partial<PurchaseLineDraft>) {
    setAddDraft((d) => ({ ...d, ...patch }));
    setErr(null);
  }

  function commitAddRow() {
    if (disabled || persisting) return;
    const hasCatalog = !!addDraft.productId;
    const hasNew = addNewProduct && addDraft.productName.trim().length > 0;
    if (!hasCatalog && !hasNew) return;
    if (!addDraft.batchNo.trim() || !addDraft.expiryYmd.trim()) {
      setErr("Fill batch and expiry before adding the line.");
      return;
    }
    const id = newLineId();
    setDraft((d) => ({
      ...d,
      [id]: {
        ...addDraft,
        id,
        batchNo: addDraft.batchNo.trim(),
        expiryYmd: addDraft.expiryYmd.trim(),
      },
    }));
    setLineIds((ids) => [...ids, id]);
    setErr(null);
    resetAddRow();
    focusAddRowNameSearch();
  }

  function removeLine(id: string) {
    if (disabled || persisting) return;
    if (!isNewLineId(id)) {
      setRemovedPersistedIds((prev) => new Set(prev).add(id));
    }
    setLineIds((ids) => ids.filter((x) => x !== id));
    setDraft((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    setErr(null);
  }

  function onAddSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const listOpen =
      !disabled &&
      addSearchQ.trim().length > 0 &&
      addHits.length > 0 &&
      !addDraft.productId &&
      !addNewProduct;
    if (e.key === "Enter") {
      if (listOpen) {
        e.preventDefault();
        const i = addHitHi >= 0 ? addHitHi : 0;
        const row = addHits[i];
        if (row) void handlePickProductForAdd(row);
        return;
      }
      if (addDraft.productId || addNewProduct) {
        e.preventDefault();
        document
          .querySelector<HTMLInputElement>('[data-purchase-line="__add__"][data-purchase-field="pack"]')
          ?.focus();
        return;
      }
      if (addSearchQ.trim().length > 0) {
        e.preventDefault();
        openAddNewProductModal();
        return;
      }
      return;
    }
    if (e.key === "ArrowRight" && (addDraft.productId || addNewProduct)) {
      e.preventDefault();
      document
        .querySelector<HTMLInputElement>('[data-purchase-line="__add__"][data-purchase-field="pack"]')
        ?.focus();
      return;
    }
    if (!listOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAddHitHi((h) => {
        if (addHits.length === 0) return -1;
        if (h < 0) return 0;
        return Math.min(addHits.length - 1, h + 1);
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAddHitHi((h) => {
        if (addHits.length === 0) return -1;
        if (h < 0) return addHits.length - 1;
        return Math.max(0, h - 1);
      });
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAddHits([]);
      setAddHitHi(-1);
    }
  }

  useEffect(() => {
    setLineIds(lines.map((l) => l.id));
    setDraft(Object.fromEntries(lines.map((l) => [l.id, normalizePurchaseLineDraft(l)])));
    setRemovedPersistedIds(new Set());
  }, [lines]);

  function patchRow(id: string, patch: Partial<PurchaseLineDraft>) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
    setErr(null);
  }

  const persistLines = useCallback(async (): Promise<string | null> => {
    if (disabled) return null;
    setPersisting(true);
    setErr(null);
    try {
      for (const id of removedPersistedIds) {
        const res = await fetch(`/api/purchases/${purchaseId}/lines/${id}`, {
          method: "DELETE",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return data.error ?? "Could not remove line";
      }

      for (const id of lineIds) {
        const row = draft[id];
        if (!row) continue;

        const base = {
          batchNo: row.batchNo.trim(),
          expiryDate: row.expiryYmd.trim(),
          quantity: row.quantity,
          costPrice: row.costPrice,
          mrp: row.mrp,
          pack: row.pack,
          purchaseDiscountPct: row.purchaseDiscountPct,
          purchaseDiscountRs: row.purchaseDiscountRs,
          schemeDiscountPct: row.schemeDiscountPct,
          schemeDiscountRs: row.schemeDiscountRs,
          salesDiscountPct: row.salesDiscountPct,
          salesDiscountRs: row.salesDiscountRs,
          freeQty: row.freeQty,
          gstPct: snapProductGstPct(row.gstPct),
        };

        if (isNewLineId(id)) {
          const body = row.productId
            ? { ...base, productId: row.productId }
            : {
                ...base,
                newProduct: {
                  name: row.productName.trim(),
                  packSize: Math.max(1, Math.trunc(row.pack) || 1),
                  reorderMin: row.catalogReorderMin ?? 0,
                  gstPct: row.catalogGstPct ?? row.gstPct ?? 5,
                  productCategory: row.catalogProductCategory,
                  ...(row.catalogProductCategory === "JANAUSHADHI" && row.catalogDrugCode?.trim()
                    ? { drugCode: row.catalogDrugCode.trim() }
                    : {}),
                  ...(row.catalogBrandId
                    ? { brandId: row.catalogBrandId }
                    : row.manufacturer?.trim()
                      ? { brand: row.manufacturer.trim() }
                      : {}),
                },
              };
          const res = await fetch(`/api/purchases/${purchaseId}/lines`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify(body),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) return data.error ?? "Could not add line";
        } else {
          const res = await fetch(`/api/purchases/${purchaseId}/lines/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              ...base,
              productId: row.productId,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) return data.error ?? "Could not update line";
        }
      }

      setRemovedPersistedIds(new Set());
      return null;
    } finally {
      setPersisting(false);
    }
  }, [
    disabled,
    purchaseId,
    removedPersistedIds,
    lineIds,
    draft,
  ]);

  useImperativeHandle(ref, () => ({ persistLines }), [persistLines]);

  const editorNavRowKeys = useMemo(
    () => (disabled ? lineIds : [...lineIds, "__add__"]),
    [lineIds, disabled],
  );

  const billTotals = useMemo(() => {
    const rows = lineIds.map((id) => draft[id]).filter((r): r is PurchaseLineDraft => !!r);
    return purchaseBillTotalsFromLines(rows);
  }, [lineIds, draft]);

  const onEditorFieldKeyDown = useCallback(
    (
      e: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>,
      lineId: string,
      field: (typeof PURCHASE_EDITOR_LINE_FIELDS)[number],
    ) => {
      if (disabled || persisting) return;
      const k = e.key;
      if (
        lineId === "__add__" &&
        field === "saleRate" &&
        (k === "Enter" || k === "ArrowDown" || k === "ArrowRight")
      ) {
        e.preventDefault();
        const btn = document.querySelector<HTMLButtonElement>(
          '[data-purchase-line="__add__"][data-purchase-field="add"]',
        );
        if (btn && !btn.disabled) btn.focus();
        return;
      }
      if (k === "ArrowDown" || k === "ArrowUp" || k === "ArrowLeft" || k === "ArrowRight" || k === "Enter") {
        let dRow = 0;
        let dField = 0;
        if (k === "ArrowDown") dRow = 1;
        else if (k === "ArrowUp") dRow = -1;
        else if (k === "ArrowRight" || k === "Enter") dField = 1;
        else if (k === "ArrowLeft") dField = -1;
        e.preventDefault();
        navigatePurchaseTable(editorNavRowKeys, PURCHASE_EDITOR_LINE_FIELDS, lineId, field, dRow, dField);
      }
    },
    [persisting, disabled, editorNavRowKeys],
  );

  const addDraftLocked = disabled || persisting || (!addDraft.productId && !addNewProduct);
  const addRowBusy = persisting || disabled;
  const addHasProduct = !!addDraft.productId || addNewProduct;
  const addMarginPct = addHasProduct ? purchaseLineMarginPercent(addDraft) : null;
  const tableBusy = persisting || disabled;

  const addEk = (field: (typeof PURCHASE_EDITOR_LINE_FIELDS)[number]) => ({
    "data-purchase-line": "__add__",
    "data-purchase-field": field,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>) =>
      onEditorFieldKeyDown(e, "__add__", field),
  });

  const addDropdownMaxH = floatingDropdownMaxHeight();

  const addListPortal =
    addPopRect &&
    addHits.length > 0 &&
    !addDraft.productId &&
    !addNewProduct &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={addHitsListRef}
        role="listbox"
        aria-label="Matching products"
        style={{
          position: "fixed",
          top: addPopRect.top,
          left: addPopRect.left,
          width: addPopRect.width,
          zIndex: 100,
          maxHeight: addDropdownMaxH,
        }}
        className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
        onWheel={(e) => e.stopPropagation()}
      >
        {addHits.map((p, idx) => (
          <li
            key={p.id}
            role="option"
            aria-selected={idx === addHitHi}
            className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
          >
            <PurchaseProductSearchListItem
              hit={p}
              selected={idx === addHitHi}
              onSelect={() => void handlePickProductForAdd(p)}
              onHover={() => setAddHitHi(idx)}
              dataIdxAttr="data-add-hits-idx"
              dataIdxValue={idx}
            />
          </li>
        ))}
      </ul>,
      document.body,
    );

  return (
    <section className="space-y-2">
      <p className="text-xs text-zinc-500">
        {disabled
          ? "This purchase is finalized — line edits are view only."
          : "Edit lines or add rows in the green row below (same as new purchase). Remove a row with ✕. Use Save Purchase below to persist all line changes and stock."}
      </p>
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}

      <div ref={mobileScrollRef} className="space-y-2 md:hidden" aria-label="Purchase items">
        {lineIds.map((id, slNo) => {
          const row = draft[id];
          if (!row) return null;
          return (
            <PurchaseLineMobileCard
              key={`mobile-${id}`}
              line={row}
              expiryYmd={row.expiryYmd}
              onExpiryChange={(ymd) => patchRow(id, { expiryYmd: ymd })}
              onPatch={(patch) => patchRow(id, patch)}
              disabled={tableBusy}
              index={slNo + 1}
              product={
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50" title={row.productName}>
                  {row.productName}
                </p>
              }
              action={
                !disabled ? (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1.5 text-sm text-red-600 touch-manipulation hover:bg-red-50 dark:hover:bg-red-950/40"
                    disabled={tableBusy}
                    onClick={() => removeLine(id)}
                    aria-label="Remove line"
                  >
                    Remove
                  </button>
                ) : null
              }
            />
          );
        })}
        {!disabled ? (
          <PurchaseLineMobileCard
            line={addDraft}
            expiryYmd={addDraft.expiryYmd}
            onExpiryChange={(ymd) => patchAddDraft({ expiryYmd: ymd })}
            onPatch={(patch) => patchAddDraft(patch)}
            disabled={addRowBusy || addDraftLocked}
            isDraft
            product={
              <div ref={addAnchorMobileRef} className="relative min-w-0">
                {addNewProduct ? (
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="min-w-0 flex-1 truncate text-sm font-medium text-amber-950 dark:text-amber-100"
                        title={addDraft.productName}
                      >
                        {addDraft.productName}
                      </span>
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 touch-manipulation hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900"
                        title="Edit product details"
                        aria-label="Edit new product details"
                        onClick={() => openAddNewProductModal({ edit: true })}
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
                    </div>
                    <button
                      type="button"
                      className="self-start text-sm font-medium text-brand-blue-light touch-manipulation hover:underline"
                      onClick={() => {
                        setAddNewProduct(false);
                        resetAddRow();
                        setErr(null);
                      }}
                    >
                      Search catalog instead
                    </button>
                  </div>
                ) : (
                  <div className="relative min-w-0 w-full">
                    <label className="sr-only" htmlFor={addSearchIdMobile}>
                      Search product to add line
                    </label>
                    <PurchaseProductSearchField
                      id={addSearchIdMobile}
                      value={addSearchQ}
                      onChange={(v) => {
                        setAddSearchQ(v);
                        if (addDraft.productId && v !== addDraft.productName) {
                          setAddDraft(emptyAddDraft());
                        }
                        setErr(null);
                      }}
                      onKeyDown={onAddSearchKeyDown}
                      ariaLabel="Search catalog product to add"
                      showClear={addSearchQ.length > 0 || !!addDraft.productId}
                      onClear={clearAddSearch}
                      showNewProduct={!addDraft.productId && !addNewProduct}
                      onNewProduct={() => openAddNewProductModal()}
                    />
                  </div>
                )}
              </div>
            }
            action={
              <button
                type="button"
                disabled={addRowBusy || !addHasProduct}
                className="w-full rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-3 py-2 text-sm font-medium text-white shadow touch-manipulation disabled:opacity-40"
                onClick={() => void commitAddRow()}
              >
                Add
              </button>
            }
          />
        ) : null}
      </div>

      <div
        ref={tableScrollRef}
        className="hidden overflow-y-visible rounded-xl border border-zinc-200 dark:border-zinc-700 md:block"
      >
        <table className="w-full min-w-0 table-fixed border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-medium leading-tight text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
              <th className={`${slNoCol} px-0 py-1.5 text-center font-normal`}>No.</th>
              <th className={`sticky left-0 z-10 bg-zinc-50 px-1 py-1.5 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] dark:bg-zinc-800/80 ${productCol}`}>
                Product
              </th>
              <th className={`${compactIntCol} px-0.5 py-1.5`} title="Units per pack (e.g. 10 tablets/strip). Billing rate and MRP are per pack.">
                Pack
              </th>
              <th className={`${batchCol} px-0.5 py-1.5`}>Batch</th>
              <th className={`${expiryCol} px-0.5 py-1.5`}>Expiry</th>
              <th className={`${compactIntCol} px-0.5 py-1.5 text-right`} title="Number of strips (packs) received. Line ₹ = qty × bill rate.">
                Qty
              </th>
              <th className={`${compactIntCol} px-0.5 py-1.5 text-right`} title="Free strips (scheme), same unit as Qty.">
                Free
              </th>
              <th className={`${compactRateCol} px-0.5 py-1.5 text-right`} title="PTR per pack (excluding GST); GST % applies on the discounted line value.">
                PTR
              </th>
              <th className={`${compactPctCol} px-0.5 py-1.5 text-right`} title="Scheme discount % on trade line gross.">
                Sch%
              </th>
              <th className={`${compactMoneyCol} px-0.5 py-1.5 text-right`} title="Scheme discount ₹ on trade line gross.">
                Sch₹
              </th>
              <th className={`${compactPctCol} px-0.5 py-1.5 text-right`}>P.Disc%</th>
              <th className={`${compactMoneyCol} px-0.5 py-1.5 text-right`}>P.Disc₹</th>
              <th className={`${compactPctCol} px-0.5 py-1.5 text-right`}>S.Disc%</th>
              <th className={`${compactMoneyCol} px-0.5 py-1.5 text-right`}>S.Disc₹</th>
              <th className={`${compactPctCol} px-0.5 py-1.5 text-right`}>GST</th>
              <th className={`${compactRateCol} px-0.5 py-1.5 text-right`} title="Printed MRP per pack">
                MRP
              </th>
              <th
                className={`${compactRateCol} px-0.5 py-1.5 text-right`}
                title="Selling rate per pack (vs MRP); edits here update S.Disc% and S.Disc₹."
              >
                Rate
              </th>
              <th
                className={`${compactMarginCol} px-0.5 py-1.5 text-right normal-case`}
                title="Margin % vs net revenue at sale rate (1 pack)"
              >
                Mrg
              </th>
              <th
                className={`${sumCol} px-0.5 py-1.5 text-right`}
                title="Trade line gross: qty × bill rate ÷ pack, before purchase discount and before GST."
              >
                Sum
              </th>
              {!disabled ? <th className={`${actionCol} px-0.5 py-1.5 text-center`} aria-label="Add or remove" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lineIds.map((id, slNo) => {
              const row = draft[id];
              if (!row) return null;
              const lineSum = purchaseLineCostGross(row);
              const marginPct = purchaseLineMarginPercent(row);
              const busy = tableBusy;
              const ek = (field: (typeof PURCHASE_EDITOR_LINE_FIELDS)[number]) => ({
                "data-purchase-line": id,
                "data-purchase-field": field,
                onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>) =>
                  onEditorFieldKeyDown(e, id, field),
              });
              return (
                <tr key={id} className="dark:bg-zinc-900/40">
                  <td
                    data-label="No."
                    className={`${slNoCol} align-middle px-0 py-2 text-center tabular-nums text-xs text-zinc-500 dark:text-zinc-400`}
                  >
                    {slNo + 1}
                  </td>
                  <td className={`sticky left-0 z-[1] bg-white px-1 py-1.5 align-middle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] dark:bg-zinc-900 ${productCol}`}>
                    <span className="block truncate text-xs font-medium">{row.productName}</span>
                  </td>
                  <td className={`${compactIntCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={1}
                      step={1}
                      integer
                      fallback={1}
                      emptyWhenZero={false}
                      className={`${cellIn} text-right`}
                      value={row.pack}
                      onChange={(n) => patchRow(id, patchPurchaseLinePack(row, Math.max(1, Math.floor(n))))}
                      disabled={busy}
                      aria-label="Pack"
                      {...ek("pack")}
                    />
                  </td>
                  <td className={`${batchCol} align-middle px-0.5 py-1.5`}>
                    <input
                      className={cellIn}
                      value={row.batchNo}
                      onChange={(e) => patchRow(id, { batchNo: e.target.value })}
                      disabled={busy}
                      aria-label="Batch"
                      {...ek("batchNo")}
                    />
                  </td>
                  <td className={`${expiryCol} align-middle px-0.5 py-1.5`}>
                    <ExpiryDateInput
                      className={cellIn}
                      wrapperClassName="min-w-0 w-full"
                      value={row.expiryYmd}
                      onChange={(e) => patchRow(id, { expiryYmd: e.target.value })}
                      disabled={busy}
                      aria-label="Expiry"
                      {...ek("expiryYmd")}
                    />
                  </td>
                  <td className={`${compactIntCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={1}
                      step={1}
                      integer
                      fallback={1}
                      emptyWhenZero={false}
                      className={`${cellIn} text-right`}
                      value={purchaseLineStripQty(row)}
                      title="Number of strips (packs) received"
                      onChange={(n) =>
                        patchRow(
                          id,
                          resyncPurchaseLineDiscountPatches(row, {
                            quantity: purchaseLineQuantityFromStrips(n, row.pack),
                          }),
                        )
                      }
                      disabled={busy}
                      aria-label="Qty"
                      {...ek("quantity")}
                    />
                  </td>
                  <td className={`${compactIntCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      step={1}
                      integer
                      className={`${cellIn} text-right`}
                      value={purchaseLineFreeStripQty(row)}
                      title="Free strips (scheme)"
                      onChange={(n) =>
                        patchRow(id, {
                          freeQty: purchaseLineFreeQtyFromStrips(n, row.pack),
                        })
                      }
                      disabled={busy}
                      aria-label="Free strips"
                      {...ek("freeQty")}
                    />
                  </td>
                  <td className={`${compactRateCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.costPrice}
                      onChange={(n) =>
                        patchRow(id, resyncPurchaseLineDiscountPatches(row, { costPrice: n }))
                      }
                      disabled={busy}
                      aria-label="Bill rate"
                      {...ek("costPrice")}
                    />
                  </td>
                  <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      max={100}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.schemeDiscountPct}
                      title="Scheme discount %"
                      onChange={(n) => patchRow(id, syncSchemeDiscountFromPct(row, n))}
                      disabled={busy}
                      aria-label="Scheme discount %"
                      {...ek("schemeDiscountPct")}
                    />
                  </td>
                  <td className={`${compactMoneyCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.schemeDiscountRs}
                      title="Linked with Sch%"
                      onChange={(n) => patchRow(id, syncSchemeDiscountFromRs(row, n))}
                      disabled={busy}
                      aria-label="Scheme discount rupees"
                      {...ek("schemeDiscountRs")}
                    />
                  </td>
                  <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      max={100}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.purchaseDiscountPct}
                      title="Linked with P.Disc₹"
                      onChange={(n) => patchRow(id, syncPurchaseDiscountFromPct(row, n))}
                      disabled={busy}
                      aria-label="Purchase discount %"
                      {...ek("purchaseDiscountPct")}
                    />
                  </td>
                  <td className={`${compactMoneyCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.purchaseDiscountRs}
                      title="Linked with P.Disc%"
                      onChange={(n) => patchRow(id, syncPurchaseDiscountFromRs(row, n))}
                      disabled={busy}
                      aria-label="Purchase discount rupees"
                      {...ek("purchaseDiscountRs")}
                    />
                  </td>
                  <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      max={100}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.salesDiscountPct}
                      title="Retail sale discount % per pack (POS)"
                      onChange={(n) => patchRow(id, syncSalesDiscountFromPct(row, n))}
                      disabled={busy}
                      aria-label="Sales discount %"
                      {...ek("salesDiscountPct")}
                    />
                  </td>
                  <td className={`${compactMoneyCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.salesDiscountRs}
                      title="Retail sale discount ₹ per pack (POS)"
                      onChange={(n) => patchRow(id, syncSalesDiscountFromRs(row, n))}
                      disabled={busy}
                      aria-label="Sales discount rupees"
                      {...ek("salesDiscountRs")}
                    />
                  </td>
                  <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                    <PurchaseGstSelect
                      className={`${cellIn} text-right`}
                      value={row.gstPct}
                      onChange={(n) => patchRow(id, { gstPct: n })}
                      disabled={busy}
                      {...ek("gstPct")}
                    />
                  </td>
                  <td className={`${compactRateCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={row.mrp}
                      onChange={(n) =>
                        patchRow(id, resyncPurchaseLineDiscountPatches(row, { mrp: n }))
                      }
                      disabled={busy}
                      aria-label="MRP"
                      {...ek("mrp")}
                    />
                  </td>
                  <td className={`${compactRateCol} align-middle px-0.5 py-1.5`}>
                    <NumericTableInput
                      min={0}
                      step={0.01}
                      className={`${cellIn} text-right`}
                      value={purchaseLineSaleRatePerPack(row)}
                      title="Selling rate per pack; updates S.Disc vs MRP."
                      onChange={(n) => patchRow(id, syncSalesDiscountFromRate(row, n))}
                      disabled={busy}
                      aria-label="Sale rate per pack"
                      {...ek("saleRate")}
                    />
                  </td>
                  <td
                    data-label="Mrg"
                    className={`${compactMarginCol} align-middle px-0.5 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400`}
                    title="Margin % vs net revenue at sale rate (1 pack)"
                  >
                    {marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}
                  </td>
                  <td
                    data-label="Sum"
                    className={`${sumCol} align-middle px-0.5 py-1.5 text-right text-xs tabular-nums text-zinc-800 dark:text-zinc-200`}
                  >
                    ₹{lineSum.toFixed(2)}
                  </td>
                  {!disabled ? (
                    <td className={`${actionCol} align-middle px-0.5 py-1.5 text-center`}>
                      <button
                        type="button"
                        className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        disabled={busy}
                        onClick={() => removeLine(id)}
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!disabled ? (
              <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
                <td data-label="" className={`${slNoCol} bg-inherit px-0 py-2`} aria-hidden="true" />
                <td className={`sticky left-0 z-[1] bg-inherit px-1 py-1.5 align-middle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] dark:bg-emerald-950/20 ${productCol}`}>
                  <div ref={addAnchorRef} className="relative min-h-[2.5rem]">
                    {addNewProduct ? (
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <span
                            className="min-w-0 flex-1 truncate text-sm font-medium text-amber-950 dark:text-amber-100"
                            title={addDraft.productName}
                          >
                            {addDraft.productName}
                          </span>
                          <button
                            type="button"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900"
                            title="Edit product details"
                            aria-label="Edit new product details"
                            onClick={() => openAddNewProductModal({ edit: true })}
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
                            setAddNewProduct(false);
                            resetAddRow();
                            setErr(null);
                          }}
                        >
                          Search catalog instead
                        </button>
                      </div>
                    ) : (
                      <div className="relative min-w-0 w-full">
                        <label className="sr-only" htmlFor={addSearchId}>
                          Search product to add line
                        </label>
                        <PurchaseProductSearchField
                          id={addSearchId}
                          value={addSearchQ}
                          onChange={(v) => {
                            setAddSearchQ(v);
                            if (addDraft.productId && v !== addDraft.productName) {
                              setAddDraft(emptyAddDraft());
                            }
                            setErr(null);
                          }}
                          onKeyDown={onAddSearchKeyDown}
                          ariaLabel="Search catalog product to add"
                          showClear={addSearchQ.length > 0 || !!addDraft.productId}
                          onClear={clearAddSearch}
                          showNewProduct={!addDraft.productId && !addNewProduct}
                          onNewProduct={() => openAddNewProductModal()}
                        />
                      </div>
                    )}
                  </div>
                </td>
                <td className={`${compactIntCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={1}
                    step={1}
                    integer
                    fallback={1}
                    emptyWhenZero={false}
                    className={`${cellIn} text-right`}
                    value={addDraft.pack}
                    onChange={(n) =>
                      patchAddDraft(patchPurchaseLinePack(addDraft, Math.max(1, Math.floor(n))))
                    }
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Pack"
                    {...addEk("pack")}
                  />
                </td>
                <td className={`${batchCol} align-middle px-0.5 py-1.5`}>
                  <input
                    className={cellIn}
                    value={addDraft.batchNo}
                    onChange={(e) => patchAddDraft({ batchNo: e.target.value })}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Batch"
                    {...addEk("batchNo")}
                  />
                </td>
                <td className={`${expiryCol} align-middle px-0.5 py-1.5`}>
                  <ExpiryDateInput
                    className={cellIn}
                    wrapperClassName="min-w-0 w-full"
                    value={addDraft.expiryYmd}
                    onChange={(e) => patchAddDraft({ expiryYmd: e.target.value })}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Expiry"
                    {...addEk("expiryYmd")}
                  />
                </td>
                <td className={`${compactIntCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={1}
                    step={1}
                    integer
                    fallback={1}
                    emptyWhenZero={false}
                    className={`${cellIn} text-right`}
                    value={purchaseLineStripQty(addDraft)}
                    title="Number of strips (packs) received"
                    onChange={(n) =>
                      patchAddDraft(
                        resyncPurchaseLineDiscountPatches(addDraft, {
                          quantity: purchaseLineQuantityFromStrips(n, addDraft.pack),
                        }),
                      )
                    }
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Qty"
                    {...addEk("quantity")}
                  />
                </td>
                <td className={`${compactIntCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    step={1}
                    integer
                    className={`${cellIn} text-right`}
                    value={purchaseLineFreeStripQty(addDraft)}
                    title="Free strips (scheme)"
                    onChange={(n) =>
                      patchAddDraft({
                        freeQty: purchaseLineFreeQtyFromStrips(n, addDraft.pack),
                      })
                    }
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Free strips"
                    {...addEk("freeQty")}
                  />
                </td>
                <td className={`${compactRateCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.costPrice}
                    onChange={(n) =>
                      patchAddDraft(resyncPurchaseLineDiscountPatches(addDraft, { costPrice: n }))
                    }
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Bill rate"
                    {...addEk("costPrice")}
                  />
                </td>
                <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    max={100}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.schemeDiscountPct}
                    title="Scheme discount %"
                    onChange={(n) => patchAddDraft(syncSchemeDiscountFromPct(addDraft, n))}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Scheme discount %"
                    {...addEk("schemeDiscountPct")}
                  />
                </td>
                <td className={`${compactMoneyCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.schemeDiscountRs}
                    title="Linked with Sch%"
                    onChange={(n) => patchAddDraft(syncSchemeDiscountFromRs(addDraft, n))}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Scheme discount rupees"
                    {...addEk("schemeDiscountRs")}
                  />
                </td>
                <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    max={100}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.purchaseDiscountPct}
                    title="Linked with P.Disc₹"
                    onChange={(n) => patchAddDraft(syncPurchaseDiscountFromPct(addDraft, n))}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Purchase discount %"
                    {...addEk("purchaseDiscountPct")}
                  />
                </td>
                <td className={`${compactMoneyCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.purchaseDiscountRs}
                    title="Linked with P.Disc%"
                    onChange={(n) => patchAddDraft(syncPurchaseDiscountFromRs(addDraft, n))}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Purchase discount rupees"
                    {...addEk("purchaseDiscountRs")}
                  />
                </td>
                <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    max={100}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.salesDiscountPct}
                    title="Retail sale discount % per pack (POS)"
                    onChange={(n) => patchAddDraft(syncSalesDiscountFromPct(addDraft, n))}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Sales discount %"
                    {...addEk("salesDiscountPct")}
                  />
                </td>
                <td className={`${compactMoneyCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.salesDiscountRs}
                    title="Retail sale discount ₹ per pack (POS)"
                    onChange={(n) => patchAddDraft(syncSalesDiscountFromRs(addDraft, n))}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Sales discount rupees"
                    {...addEk("salesDiscountRs")}
                  />
                </td>
                <td className={`${compactPctCol} align-middle px-0.5 py-1.5`}>
                  <PurchaseGstSelect
                    className={`${cellIn} text-right`}
                    value={addDraft.gstPct}
                    onChange={(n) => patchAddDraft({ gstPct: n })}
                    disabled={addRowBusy || addDraftLocked}
                    {...addEk("gstPct")}
                  />
                </td>
                <td className={`${compactRateCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addDraft.mrp}
                    onChange={(n) =>
                      patchAddDraft(resyncPurchaseLineDiscountPatches(addDraft, { mrp: n }))
                    }
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="MRP"
                    {...addEk("mrp")}
                  />
                </td>
                <td className={`${compactRateCol} align-middle px-0.5 py-1.5`}>
                  <NumericTableInput
                    min={0}
                    step={0.01}
                    className={`${cellIn} text-right`}
                    value={addHasProduct ? purchaseLineSaleRatePerPack(addDraft) : 0}
                    title="Selling rate per pack; updates S.Disc vs MRP."
                    onChange={(n) => patchAddDraft(syncSalesDiscountFromRate(addDraft, n))}
                    disabled={addRowBusy || addDraftLocked}
                    aria-label="Sale rate per pack"
                    {...addEk("saleRate")}
                  />
                </td>
                <td
                  data-label="Mrg"
                  className={`${compactMarginCol} align-middle px-0.5 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 dark:text-zinc-400`}
                  title="Margin % vs net revenue at sale rate (1 pack)"
                >
                  {addMarginPct != null ? `${addMarginPct.toFixed(1)}%` : "—"}
                </td>
                <td
                  data-label="Sum"
                  className={`${sumCol} align-middle px-0.5 py-1.5 text-right text-xs tabular-nums text-zinc-800 dark:text-zinc-200`}
                >
                  {addHasProduct ? `₹${purchaseLineCostGross(addDraft).toFixed(2)}` : "—"}
                </td>
                <td className={`${actionCol} align-middle px-0.5 py-1.5 text-center`}>
                  <button
                    type="button"
                    data-purchase-line="__add__"
                    data-purchase-field="add"
                    disabled={addRowBusy || !addHasProduct}
                    className="rounded bg-gradient-to-r from-brand-blue to-brand-green px-1.5 py-1 text-[10px] font-medium text-white shadow disabled:opacity-40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitAddRow();
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        document
                          .querySelector<HTMLInputElement>(
                            '[data-purchase-line="__add__"][data-purchase-field="saleRate"]',
                          )
                          ?.focus();
                      }
                    }}
                    onClick={() => void commitAddRow()}
                  >
                    Add
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <PurchaseBillTotalsPanel
        netTotal={billTotals.netTotal}
        schemeDiscountTotal={billTotals.schemeDiscountTotal}
        purchaseDiscountTotal={billTotals.purchaseDiscountTotal}
        gstTotal={billTotals.gstTotal}
        roundOff={billTotals.roundOff}
        grandTotal={billTotals.grandTotal}
      />
      {addListPortal}
      <PurchaseNewProductModal
        open={newProductModalOpen}
        onClose={() => setNewProductModalOpen(false)}
        initial={newProductModalInitial}
        onValidationError={(message) => setErr(message)}
        onApply={applyAddNewProductModal}
      />
    </section>
  );
});
