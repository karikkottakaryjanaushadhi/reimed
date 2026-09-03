"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { NumericTableInput } from "@/components/numeric-table-input";
import { computePosSaleLineMoney } from "@/lib/sale-checkout-resolve";
import { saleLineMarginPercent } from "@/lib/sale-line";
import { floatingDropdownMaxHeight } from "@/lib/floating-dropdown";
import { drugCodeMatchesQuery, displayDrugCode } from "@/lib/drug-code";
import { nameMatchesLooseQuery, sortByProductSearchRelevance } from "@/lib/search-normalize";
import type { CartLine, Lot } from "./cart-types";
import {
  applyMrpDiscountAmountToLine,
  applyMrpDiscountPctToLine,
  availableLotQty,
  availableProductStock,
  defaultQtyForLot,
  defaultRateForLot,
  effectiveLineDiscountPct,
  formatLotExpiry,
  nominalDiscountPctFromLot,
  round2,
  scrollChildIntoViewContainer,
  posRateMrpBracketLabel,
  posRateMrpBracketRangeLabel,
  posStockAvailabilityClass,
  posStockAvailabilityLabel,
  syncMrpDiscountFields,
} from "./pos-line-helpers";
import { LINE_TABLE_SLNO_COL, POS_FIELD_INPUT_CLASS, POS_PRIMARY_CTA_CLASS } from "./pos-billing-ui";

type StockRow = {
  productId: string;
  sku: string;
  name: string;
  genericName?: string | null;
  brand?: string | null;
  supplier?: string | null;
  mrpMin: number | null;
  mrpMax: number | null;
  rateMin: number | null;
  rateMax: number | null;
  quantity: number;
  expiredQuantity?: number;
};

function isMdUpViewport() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

function pickViewportRef<T>(mobile: RefObject<T | null>, desktop: RefObject<T | null>) {
  return isMdUpViewport() ? desktop : mobile;
}

export function useDraftLine({
  cart,
  onCommit,
  tableScrollRef,
  focusCustomerName,
}: {
  cart: CartLine[];
  onCommit: (line: CartLine) => void;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  focusCustomerName?: () => void;
}) {
  const searchFieldId = useId();
  const [q, setQ] = useState("");
  const [allStock, setAllStock] = useState<StockRow[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState("");
  const [qty, setQty] = useState(1);
  const [rate, setRate] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountFromLotOnly, setDiscountFromLotOnly] = useState(true);
  const searchInputMobileRef = useRef<HTMLInputElement>(null);
  const searchInputDesktopRef = useRef<HTMLInputElement>(null);
  const stockAnchorDesktopRef = useRef<HTMLDivElement>(null);
  const batchAnchorRef = useRef<HTMLElement>(null);
  const qtyInputMobileRef = useRef<HTMLInputElement>(null);
  const qtyInputDesktopRef = useRef<HTMLInputElement>(null);
  const stockListRef = useRef<HTMLUListElement>(null);
  const batchListRef = useRef<HTMLUListElement>(null);
  const [stockPopRect, setStockPopRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [batchPopRect, setBatchPopRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const focusQtyAfterPickRef = useRef(false);
  const focusBatchAfterPickRef = useRef(false);
  const [stockHi, setStockHi] = useState(0);
  /** Mobile: show full batch list only while choosing; collapse after pick. */
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);

  useLayoutEffect(() => {
    pickViewportRef(searchInputMobileRef, searchInputDesktopRef).current?.focus();
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (!t) {
      setAllStock([]);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/inventory/stock?q=${encodeURIComponent(t)}`, { signal: ac.signal });
          const data = await res.json();
          if (res.ok) setAllStock(data.stock ?? []);
        } catch (e) {
          if (e instanceof Error && e.name === "AbortError") return;
        }
      })();
    }, 200);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  const filteredStock = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    const matches = allStock
      .filter(
        (p) =>
          nameMatchesLooseQuery(p.name, t) ||
          nameMatchesLooseQuery(p.genericName ?? "", t) ||
          drugCodeMatchesQuery(p.sku, t),
      )
      .map((p) => ({
        ...p,
        quantity: availableProductStock(p.quantity, cart, p.productId),
        expiredQuantity: p.expiredQuantity ?? 0,
      }));
    return sortByProductSearchRelevance(matches, t, (p) => {
      if (nameMatchesLooseQuery(p.name, t)) return p.name;
      if (nameMatchesLooseQuery(p.genericName ?? "", t)) return p.genericName ?? p.name;
      return displayDrugCode(p.sku) || p.name;
    });
  }, [allStock, q, cart]);

  const visibleLots = useMemo(
    () => lots.filter((l) => availableLotQty(l.quantity, cart, l.id) > 0),
    [lots, cart],
  );

  const pickableLots = useMemo(() => visibleLots.filter((l) => !l.expired), [visibleLots]);

  const stockMenuOpen =
    productId === null && lots.length === 0 && q.trim().length > 0 && filteredStock.length > 0;

  const updatePopoverRects = useCallback(() => {
    if (typeof window === "undefined") return;
    if (stockMenuOpen && stockAnchorDesktopRef.current) {
      const r = stockAnchorDesktopRef.current.getBoundingClientRect();
      setStockPopRect({ top: r.bottom + 4, left: r.left, width: r.width });
    } else {
      setStockPopRect(null);
    }
    if (lots.length > 0 && batchPickerOpen && batchAnchorRef.current) {
      const r = batchAnchorRef.current.getBoundingClientRect();
      setBatchPopRect({ top: r.top, left: r.left, width: r.width });
    } else {
      setBatchPopRect(null);
    }
  }, [stockMenuOpen, lots.length, batchPickerOpen]);

  useLayoutEffect(() => {
    updatePopoverRects();
  }, [updatePopoverRects, stockHi, filteredStock, lots, lotId, q, batchPickerOpen]);

  useEffect(() => {
    const onScrollOrResize = () => updatePopoverRects();
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("scroll", onScrollOrResize, opts);
    window.addEventListener("resize", onScrollOrResize);
    const scrollEl = tableScrollRef.current;
    scrollEl?.addEventListener("scroll", onScrollOrResize, opts);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, opts);
      window.removeEventListener("resize", onScrollOrResize);
      scrollEl?.removeEventListener("scroll", onScrollOrResize, opts);
    };
  }, [updatePopoverRects, tableScrollRef]);

  useEffect(() => {
    if (!stockMenuOpen && lots.length === 0) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as Node | null;
      if (stockListRef.current?.contains(t) || batchListRef.current?.contains(t)) {
        e.stopPropagation();
      }
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [stockMenuOpen, lots.length]);

  useEffect(() => {
    if (filteredStock.length > 0) setStockHi(0);
    else setStockHi(-1);
  }, [filteredStock]);

  useLayoutEffect(() => {
    if (stockHi < 0 || !stockListRef.current) return;
    const el = stockListRef.current.querySelector(`[data-stock-idx="${stockHi}"]`) as HTMLElement | null;
    if (!el) return;
    scrollChildIntoViewContainer(stockListRef.current, el);
  }, [stockHi, filteredStock]);

  useLayoutEffect(() => {
    if (!batchListRef.current || lots.length < 1) return;
    const el = batchListRef.current.querySelector(`[data-batch-selected="true"]`) as HTMLElement | null;
    if (!el) return;
    scrollChildIntoViewContainer(batchListRef.current, el);
  }, [lotId, lots]);

  async function pickProduct(pid: string) {
    setProductId(pid);
    setLotId("");
    const res = await fetch(`/api/inventory/lots?productId=${pid}&inStockOnly=1`);
    const data = await res.json();
    if (res.ok) {
      const list: Lot[] = data.lots ?? [];
      setLots(list);
      const withStock = list.filter((l) => availableLotQty(l.quantity, cart, l.id) > 0);
      const pickable = withStock.filter((l) => !l.expired);
      setBatchPickerOpen(withStock.length > 1 || (withStock.length === 1 && Boolean(withStock[0]?.expired)));
      const first = pickable[0];
      if (first) {
        const avail = availableLotQty(first.quantity, cart, first.id);
        setLotId(first.id);
        setQty(defaultQtyForLot({ ...first, quantity: avail }));
        setRate(defaultRateForLot(first));
        setDiscountFromLotOnly(true);
        setDiscountPct(nominalDiscountPctFromLot(first));
        if (pickable.length > 1) {
          focusBatchAfterPickRef.current = true;
        } else {
          focusQtyAfterPickRef.current = true;
        }
      } else {
        setLotId("");
        setRate(0);
        setQty(1);
        if (withStock.length > 0) {
          focusBatchAfterPickRef.current = true;
          const nameFromLots = withStock[0]?.product?.name;
          if (nameFromLots) setQ(nameFromLots);
        } else {
          setLots([]);
          const nameFromLots = list[0]?.product?.name;
          if (nameFromLots) setQ(nameFromLots);
        }
      }
    }
  }

  useEffect(() => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return;
    const avail = availableLotQty(lot.quantity, cart, lot.id);
    if (avail < 1) return;
    setQty((q) => (q > avail ? avail : q));
  }, [cart, lots, lotId]);

  useLayoutEffect(() => {
    if (!lotId || lots.length === 0) return;
    const cur = lots.find((l) => l.id === lotId);
    if (cur) setQ(cur.product.name);
  }, [lots, lotId]);

  useLayoutEffect(() => {
    if (!focusBatchAfterPickRef.current || lots.length <= 1 || !lotId || !batchPickerOpen) return;
    focusBatchAfterPickRef.current = false;
    requestAnimationFrame(() => batchListRef.current?.focus({ preventScroll: true }));
  }, [lots, lotId, batchPickerOpen]);

  useLayoutEffect(() => {
    if (!focusQtyAfterPickRef.current || !lotId || lots.length === 0) return;
    focusQtyAfterPickRef.current = false;
    const el = pickViewportRef(qtyInputMobileRef, qtyInputDesktopRef).current;
    if (el && !el.disabled) {
      el.focus();
      el.select();
    }
  }, [lots, lotId]);

  function focusQtySelectAll() {
    requestAnimationFrame(() => {
      const el = pickViewportRef(qtyInputMobileRef, qtyInputDesktopRef).current;
      if (el && !el.disabled) {
        el.focus();
        el.select();
      }
    });
  }

  function focusActiveSearch() {
    requestAnimationFrame(() => {
      pickViewportRef(searchInputMobileRef, searchInputDesktopRef).current?.focus();
    });
  }

  function setQtyFromInput(raw: string) {
    if (raw.trim() === "") {
      setQty(0);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    let q = Math.floor(n);
    if (q < 0) q = 0;
    const cur = selectedLot();
    const avail = cur ? availableLotQty(cur.quantity, cart, cur.id) : 0;
    if (avail > 0 && q > avail) q = avail;
    setQty(q);
  }

  function commitQty() {
    const lot = selectedLot();
    const avail = lot ? availableLotQty(lot.quantity, cart, lot.id) : 0;
    setQty((q) => {
      if (!Number.isFinite(q) || q < 1) return 1;
      if (avail < 1) return 1;
      return Math.min(q, avail);
    });
  }

  function selectedLot(): Lot | undefined {
    return lots.find((l) => l.id === lotId);
  }

  function setDraftLineGross(raw: number) {
    const lot = selectedLot();
    if (!lot) return;
    let gross = Number(raw);
    if (!Number.isFinite(gross) || gross < 0) gross = 0;
    const qn = Math.max(1, qty);
    const ps = Math.max(1, Math.trunc(lot.product.packSize) || 1);
    const synced = syncMrpDiscountFields(lot.mrp, round2((gross * ps) / qn));
    setRate(synced.rate);
    setDiscountFromLotOnly(true);
    setDiscountPct(synced.discountPct);
  }

  function setDraftDiscountFromPct(raw: number) {
    const lot = selectedLot();
    if (!lot) return;
    const { rate, discountPct } = applyMrpDiscountPctToLine(lot.mrp, raw);
    setRate(rate);
    setDiscountFromLotOnly(true);
    setDiscountPct(discountPct);
  }

  function setDraftDiscountFromAmount(raw: number) {
    const lot = selectedLot();
    if (!lot) return;
    const { rate, discountPct } = applyMrpDiscountAmountToLine(
      qty,
      lot.mrp,
      lot.product.packSize,
      raw,
    );
    setRate(rate);
    setDiscountFromLotOnly(true);
    setDiscountPct(discountPct);
  }

  function confirmBatchSelection() {
    setBatchPickerOpen(false);
    focusQtySelectAll();
  }

  function openBatchPicker() {
    setBatchPickerOpen(true);
    focusBatchAfterPickRef.current = true;
  }

  function applyLotChoice(l: Lot, opts?: { keepPickerOpen?: boolean }) {
    if (l.expired) return;
    const avail = availableLotQty(l.quantity, cart, l.id);
    setLotId(l.id);
    setRate(defaultRateForLot(l));
    setDiscountFromLotOnly(true);
    setDiscountPct(nominalDiscountPctFromLot(l));
    setQty(defaultQtyForLot({ ...l, quantity: avail }));
    if (opts?.keepPickerOpen) {
      requestAnimationFrame(() => batchListRef.current?.focus({ preventScroll: true }));
    } else {
      setBatchPickerOpen(false);
      focusQtySelectAll();
    }
  }

  function onBatchListKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    const cur = pickableLots.findIndex((x) => x.id === lotId);
    if (cur < 0) return;
    if (e.key === "Enter") {
      e.preventDefault();
      confirmBatchSelection();
      return;
    }
    if (pickableLots.length <= 1) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      applyLotChoice(pickableLots[Math.min(pickableLots.length - 1, cur + 1)], { keepPickerOpen: true });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      applyLotChoice(pickableLots[Math.max(0, cur - 1)], { keepPickerOpen: true });
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      applyLotChoice(pickableLots[0], { keepPickerOpen: true });
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      applyLotChoice(pickableLots[pickableLots.length - 1], { keepPickerOpen: true });
    }
  }

  function handleAdd() {
    const lot = selectedLot();
    const avail = lot ? availableLotQty(lot.quantity, cart, lot.id) : 0;
    if (!lot || lot.expired || avail < 1 || qty < 1 || qty > avail) return;
    onCommit({
      productId: lot.product.id,
      lotId: lot.id,
      name: lot.product.name,
      batchNo: lot.batchNo,
      expiryDate: lot.expiryDate.slice(0, 10),
      packSize: lot.product.packSize,
      gstPct: lot.product.gstPct ?? 0,
      qty,
      maxQty: lot.quantity,
      reservedQty: 0,
      mrp: lot.mrp,
      costPrice: lot.costPrice,
      rate,
      discountPct,
      discountFromLotOnly,
    });
    setQ("");
    setProductId(null);
    setLots([]);
    setLotId("");
    setQty(1);
    setRate(0);
    setDiscountPct(0);
    setDiscountFromLotOnly(true);
    setBatchPickerOpen(false);
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const pickListOpen =
      q.trim().length > 0 && filteredStock.length > 0 && lots.length === 0;

    if (pickListOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setStockHi((h) => {
          if (filteredStock.length === 0) return -1;
          if (h < 0) return 0;
          return Math.min(filteredStock.length - 1, h + 1);
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setStockHi((h) => {
          if (filteredStock.length === 0) return -1;
          if (h < 0) return filteredStock.length - 1;
          return Math.max(0, h - 1);
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const i = stockHi >= 0 ? stockHi : 0;
        const row = filteredStock[i];
        if (row) void pickProduct(row.productId);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setQ("");
        return;
      }
    }

    if (e.key !== "Enter") return;
    e.preventDefault();
    if (lots.length > 0 && selectedLot()) {
      focusQtySelectAll();
      return;
    }
    if (!pickListOpen && lots.length === 0) {
      focusCustomerName?.();
    }
  }

  function onQtyKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const cur = selectedLot();
    if (cur && qty >= 1 && qty <= availableLotQty(cur.quantity, cart, cur.id)) {
      handleAdd();
    }
  }

  function onCommitKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const cur = selectedLot();
    if (cur && qty >= 1 && qty <= availableLotQty(cur.quantity, cart, cur.id)) {
      handleAdd();
    }
  }

  const lot = selectedLot();
  const lotAvailableQty = lot ? availableLotQty(lot.quantity, cart, lot.id) : 0;
  const draftGstPct = lot ? (lot.product.gstPct ?? 0) : null;
  const preview = lot
    ? computePosSaleLineMoney({
        qty,
        rate,
        mrp: lot.mrp,
        packSize: lot.product.packSize,
        discountPctOffRate: effectiveLineDiscountPct(rate, lot.mrp, discountPct, discountFromLotOnly),
        gstPct: draftGstPct ?? 0,
      })
    : null;
  const previewDiscRs = preview?.discountAmount ?? 0;
  const previewMarginPct =
    preview && lot
      ? saleLineMarginPercent(
          preview.amount,
          preview.discountAmount,
          preview.gstAmount,
          qty,
          lot.costPrice,
          lot.product.packSize,
        )
      : null;
  const addDisabled = !lot || lot.expired || lotAvailableQty < 1 || qty < 1 || qty > lotAvailableQty;

  return {
    searchFieldId,
    q,
    setQ,
    lots,
    visibleLots,
    pickableLots,
    lotAvailableQty,
    lotAvailableQtyFor: (l: Lot) => availableLotQty(l.quantity, cart, l.id),
    lotId,
    qty,
    setQty,
    setQtyFromInput,
    commitQty,
    discountPct,
    setDiscountPct,
    setDiscountFromLotOnly,
    searchInputMobileRef,
    searchInputDesktopRef,
    stockAnchorDesktopRef,
    batchAnchorRef,
    qtyInputMobileRef,
    qtyInputDesktopRef,
    stockListRef,
    batchListRef,
    stockHi,
    setStockHi,
    stockMenuOpen,
    filteredStock,
    stockPopRect,
    batchPopRect,
    lot,
    preview,
    previewDiscRs,
    previewMarginPct,
    draftGstPct,
    addDisabled,
    batchPickerOpen,
    setBatchPickerOpen,
    openBatchPicker,
    confirmBatchSelection,
    pickProduct,
    applyLotChoice,
    handleAdd,
    onSearchKeyDown,
    onQtyKeyDown,
    onCommitKeyDown,
    onBatchListKeyDown,
    setDraftLineGross,
    setDraftDiscountFromPct,
    setDraftDiscountFromAmount,
    focusQtySelectAll,
    clearProductSelection: () => {
      setProductId(null);
      setLots([]);
      setLotId("");
      setBatchPickerOpen(false);
    },
    clearSearch: () => {
      setQ("");
      setProductId(null);
      setLots([]);
      setLotId("");
      setQty(1);
      setRate(0);
      setDiscountPct(0);
      setDiscountFromLotOnly(true);
      setBatchPickerOpen(false);
      requestAnimationFrame(() => focusActiveSearch());
    },
    focusActiveSearch,
  };
}

export type DraftLineState = ReturnType<typeof useDraftLine>;

function DraftLineProductSearch({
  draft,
  placeholder,
  inputClassName,
  hideLabel,
  searchInputRef,
  stockAnchorRef,
}: {
  draft: DraftLineState;
  placeholder: string;
  inputClassName?: string;
  hideLabel?: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  stockAnchorRef?: RefObject<HTMLDivElement | null>;
}) {
  const showClear = draft.q.length > 0 || draft.lots.length > 0;
  return (
    <div ref={stockAnchorRef} className="relative min-w-0">
      {hideLabel ? null : (
        <label className="sr-only" htmlFor={draft.searchFieldId}>
          Search product
        </label>
      )}
      <input
        ref={searchInputRef}
        id={draft.searchFieldId}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputClassName ?? ""}${showClear ? " pr-9" : ""}`.trim()}
        value={draft.q}
        onChange={(e) => {
          draft.setQ(e.target.value);
          draft.clearProductSelection();
        }}
        onKeyDown={draft.onSearchKeyDown}
      />
      {showClear ? (
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-1 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Clear search"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => draft.clearSearch()}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

function StockPickerList({
  draft,
  className,
  listStyle,
}: {
  draft: DraftLineState;
  className?: string;
  listStyle?: React.CSSProperties;
}) {
  if (!draft.stockMenuOpen) return null;
  return (
    <ul
      ref={draft.stockListRef}
      role="listbox"
      aria-label="Matching products"
      style={listStyle}
      className={
        className ??
        "max-h-48 overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
      }
    >
      {draft.filteredStock.map((p, idx) => {
        const stockLabel = posStockAvailabilityLabel(p.quantity ?? 0, p.expiredQuantity ?? 0);
        return (
        <li key={p.productId} role="option" aria-selected={idx === draft.stockHi}>
          <button
            type="button"
            data-stock-idx={idx}
            className={`flex w-full items-start justify-between gap-2 px-2.5 py-2 text-left ${
              idx === draft.stockHi
                ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
            onMouseEnter={() => draft.setStockHi(idx)}
            onClick={() => void draft.pickProduct(p.productId)}
          >
            <span className="min-w-0 flex-1">
              <span className="block break-words font-medium text-zinc-900 dark:text-zinc-100">{p.name}</span>
              {p.genericName ? (
                <span className="mt-0.5 block truncate text-[10px] text-zinc-500 dark:text-zinc-400" title={p.genericName}>
                  {p.genericName}
                </span>
              ) : null}
              {displayDrugCode(p.sku) ? (
                <span className="mt-0.5 block font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                  {displayDrugCode(p.sku)}
                </span>
              ) : null}
              {p.brand ? (
                <span className="mt-0.5 block truncate text-[10px] text-zinc-500 dark:text-zinc-400" title={p.brand}>
                  {p.brand}
                </span>
              ) : null}
            </span>
            <span className="flex max-w-[6.5rem] shrink-0 flex-col items-end gap-0.5 break-words text-right">
              <span
                className={`whitespace-normal tabular-nums text-[11px] font-medium ${posStockAvailabilityClass(stockLabel.tone)}`}
              >
                {stockLabel.text}
              </span>
              {p.mrpMin != null && p.mrpMax != null ? (
                <span className="whitespace-normal break-words tabular-nums text-[11px] leading-tight text-zinc-500">
                  {posRateMrpBracketRangeLabel(
                    p.rateMin ?? p.mrpMin,
                    p.rateMax ?? p.mrpMax,
                    p.mrpMin,
                    p.mrpMax,
                  )}
                </span>
              ) : null}
            </span>
          </button>
        </li>
        );
      })}
    </ul>
  );
}

function batchPickerRowClass(selected: boolean, expired: boolean): string {
  if (expired) {
    return selected
      ? "bg-red-100/80 text-red-950 dark:bg-red-950/40 dark:text-red-100"
      : "cursor-not-allowed text-red-900/80 dark:text-red-200/90";
  }
  return selected
    ? "bg-emerald-100 font-medium text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50"
    : "hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:text-zinc-200";
}

function BatchPickerList({
  draft,
  className,
  tabIndex,
}: {
  draft: DraftLineState;
  className?: string;
  tabIndex?: number;
}) {
  if (draft.visibleLots.length === 0) return null;
  return (
    <ul
      ref={draft.batchListRef}
      tabIndex={tabIndex ?? (draft.visibleLots.length > 1 ? 0 : -1)}
      role="listbox"
      aria-label="Choose batch"
      className={
        className ??
        "max-h-40 overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      }
      onKeyDown={(e) => {
        draft.onBatchListKeyDown(e);
        if (!e.defaultPrevented) draft.onCommitKeyDown(e);
      }}
    >
      {draft.visibleLots.map((l) => {
        const selected = l.id === draft.lotId;
        const expired = Boolean(l.expired);
        const expLabel = formatLotExpiry(l.expiryDate);
        return (
          <li key={l.id} role="none">
            <button
              type="button"
              role="option"
              aria-selected={selected}
              aria-disabled={expired}
              disabled={expired}
              data-batch-selected={selected ? "true" : undefined}
              className={`flex w-full flex-wrap items-baseline gap-x-2 gap-y-1 px-2.5 py-2 text-left ${batchPickerRowClass(selected, expired)}`}
              onClick={() => draft.applyLotChoice(l)}
            >
              <span className="min-w-0 break-all font-mono">{l.batchNo}</span>
              <span className={`shrink-0 ${expired ? "font-medium text-red-700 dark:text-red-300" : "text-zinc-600 dark:text-zinc-400"}`}>
                {expired ? "Expired" : `Exp ${expLabel}`}
              </span>
              <span className="shrink-0 tabular-nums">{posRateMrpBracketLabel(defaultRateForLot(l), l.mrp)}</span>
              <span className="shrink-0 text-zinc-500">{draft.lotAvailableQtyFor(l)} left</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function useMdUp() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

export function DraftLinePortals({ draft }: { draft: DraftLineState }) {
  const mdUp = useMdUp();
  if (!mdUp) return null;

  const dropdownMaxH = floatingDropdownMaxHeight();

  const stockListPortal =
    draft.stockMenuOpen &&
    draft.stockPopRect &&
    typeof document !== "undefined" &&
    createPortal(
      <StockPickerList
        draft={draft}
        className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900"
        listStyle={{
          position: "fixed",
          top: draft.stockPopRect.top,
          left: draft.stockPopRect.left,
          width: draft.stockPopRect.width,
          zIndex: 100,
          maxHeight: dropdownMaxH,
        }}
      />,
      document.body,
    );

  const batchListPortal =
    draft.batchPickerOpen &&
    draft.visibleLots.length > 0 &&
    draft.batchPopRect &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={draft.batchListRef}
        tabIndex={draft.visibleLots.length > 1 ? 0 : -1}
        role="listbox"
        aria-label="Choose batch to sell from"
        style={{
          position: "fixed",
          top: draft.batchPopRect.top,
          left: draft.batchPopRect.left,
          width: draft.batchPopRect.width,
          zIndex: 100,
          maxHeight: dropdownMaxH,
        }}
        className="overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-300 bg-white py-1 text-[10px] shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 dark:border-zinc-600 dark:bg-zinc-950 sm:text-xs"
        onWheel={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          draft.onBatchListKeyDown(e);
          if (!e.defaultPrevented) draft.onCommitKeyDown(e);
        }}
      >
        {draft.visibleLots.map((l) => {
          const selected = l.id === draft.lotId;
          const expired = Boolean(l.expired);
          const expLabel = formatLotExpiry(l.expiryDate);
          return (
            <li key={l.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={expired}
                disabled={expired}
                data-batch-selected={selected ? "true" : undefined}
                className={`flex w-full min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-1.5 text-left text-xs leading-snug ${batchPickerRowClass(selected, expired)}`}
                onClick={() => draft.applyLotChoice(l)}
              >
                <span className="min-w-0 break-all font-mono sm:break-normal">{l.batchNo}</span>
                <span className={`shrink-0 ${expired ? "font-medium text-red-700 dark:text-red-300" : "text-zinc-600 dark:text-zinc-400"}`}>
                  {expired ? "Expired" : `Exp ${expLabel}`}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-900 dark:text-zinc-50">
                  {posRateMrpBracketLabel(defaultRateForLot(l), l.mrp)}
                </span>
                <span className="shrink-0 text-zinc-500">{draft.lotAvailableQtyFor(l)} left</span>
              </button>
            </li>
          );
        })}
      </ul>,
      document.body,
    );

  return (
    <>
      {stockListPortal}
      {batchListPortal}
    </>
  );
}

export function DraftLineMobileCard({ draft }: { draft: DraftLineState }) {
  const { lot, preview, previewDiscRs, previewMarginPct } = draft;

  return (
    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400" htmlFor={draft.searchFieldId}>
        Search product
      </label>
      <div className="relative mt-1">
        <DraftLineProductSearch
          draft={draft}
          placeholder="Name or generic…"
          inputClassName={`w-full bg-white ${POS_FIELD_INPUT_CLASS}`}
          hideLabel
          searchInputRef={draft.searchInputMobileRef}
        />
        <StockPickerList draft={draft} className="mt-1 max-h-48 overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900" />
      </div>

      {draft.lots.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Batch</p>
          {draft.batchPickerOpen ? (
            <BatchPickerList draft={draft} className="mt-1 max-h-40 overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
          ) : draft.visibleLots.length > 0 && draft.pickableLots.length === 0 ? (
            <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">Batch expired — cannot bill</p>
          ) : lot ? (
            <div className="mt-1 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <p className="font-mono text-zinc-900 dark:text-zinc-50">{lot.batchNo}</p>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                Exp {formatLotExpiry(lot.expiryDate)} · {posRateMrpBracketLabel(defaultRateForLot(lot), lot.mrp)} ·{" "}
                {draft.lotAvailableQty} in stock
              </p>
              {draft.visibleLots.length > 1 ? (
                <button
                  type="button"
                  className="mt-2 touch-manipulation text-xs font-medium text-brand-blue-light hover:underline"
                  onClick={() => draft.openBatchPicker()}
                >
                  Change batch
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {lot ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs text-zinc-500">
            Qty
            <input
              ref={draft.qtyInputMobileRef}
              type="number"
              min={0}
              title={
                draft.lotAvailableQty > 0
                  ? `Max ${draft.lotAvailableQty} available`
                  : "No stock available"
              }
              className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right`}
              value={draft.qty < 1 ? "" : draft.qty}
              onChange={(e) => draft.setQtyFromInput(e.target.value)}
              onBlur={draft.commitQty}
              onKeyDown={draft.onQtyKeyDown}
            />
          </label>
          <label className="block text-xs text-zinc-500">
            MRP
            <div className="mt-1 py-2 text-right text-base font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
              ₹{lot.mrp.toFixed(2)}
            </div>
          </label>
          <label className="block text-xs text-zinc-500">
            Amount
            <NumericTableInput
              min={0}
              step={0.01}
              className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right font-medium`}
              value={preview?.grossRate ?? 0}
              onChange={draft.setDraftLineGross}
              onKeyDown={draft.onCommitKeyDown}
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Disc%
            <NumericTableInput
              min={0}
              max={100}
              step={0.01}
              className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right`}
              value={draft.discountPct}
              onChange={draft.setDraftDiscountFromPct}
              onKeyDown={draft.onCommitKeyDown}
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Disc ₹
            <NumericTableInput
              min={0}
              max={preview ? Math.max(preview.amount, previewDiscRs) : 0}
              step={0.01}
              className={`mt-1 w-full ${POS_FIELD_INPUT_CLASS} text-right`}
              value={previewDiscRs}
              onChange={draft.setDraftDiscountFromAmount}
              onKeyDown={draft.onCommitKeyDown}
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Mrg%
            <div className="mt-1 py-2 text-right text-base tabular-nums text-zinc-800 dark:text-zinc-200">
              {previewMarginPct == null ? "—" : `${previewMarginPct.toFixed(1)}%`}
            </div>
          </label>
          <div className="col-span-2 flex justify-between border-t border-zinc-200/80 pt-3 text-sm dark:border-zinc-700">
            <span className="text-zinc-500">Sum</span>
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
              ₹{(preview?.lineInclusiveTotal ?? 0).toFixed(2)}
            </span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={draft.addDisabled}
        aria-disabled={draft.addDisabled}
        onClick={() => {
          if (draft.addDisabled) return;
          draft.handleAdd();
        }}
        className={`mt-4 ${POS_PRIMARY_CTA_CLASS}`}
      >
        Add to bill
      </button>
    </div>
  );
}

export function DraftLineTableRow({ draft }: { draft: DraftLineState }) {
  const { lot, preview, previewDiscRs, previewMarginPct, draftGstPct } = draft;

  return (
    <tr className="bg-emerald-50/40 dark:bg-emerald-950/15">
      <td className={`${LINE_TABLE_SLNO_COL} bg-inherit px-0 py-2`} aria-hidden="true" />
      <td className="relative min-w-0 px-2 py-2 align-middle">
        <div className="relative min-h-[2.5rem]">
          <DraftLineProductSearch
            draft={draft}
            placeholder="Search name or generic…"
            inputClassName={`w-full bg-white px-2 py-2 dark:bg-zinc-950 ${POS_FIELD_INPUT_CLASS}`}
            searchInputRef={draft.searchInputDesktopRef}
            stockAnchorRef={draft.stockAnchorDesktopRef}
          />
        </div>
      </td>
      <td
        ref={draft.batchAnchorRef as RefObject<HTMLTableCellElement>}
        className={`relative min-w-0 px-1 py-2 align-middle ${draft.lots.length > 0 ? "min-h-[2.5rem]" : ""}`}
      >
        {draft.lots.length === 0 ? (
          <span className="inline-block text-xs text-zinc-400">—</span>
        ) : lot && !draft.batchPickerOpen ? (
          <div className="min-w-0 text-xs">
            <p className="truncate font-mono text-zinc-900 dark:text-zinc-50">{lot.batchNo}</p>
            {draft.visibleLots.length > 1 ? (
              <button
                type="button"
                className="mt-0.5 touch-manipulation text-[10px] font-medium text-brand-blue-light hover:underline"
                onClick={() => draft.openBatchPicker()}
              >
                Change
              </button>
            ) : null}
          </div>
        ) : draft.visibleLots.length > 0 && draft.pickableLots.length === 0 ? (
          <span className="text-xs font-medium text-red-700 dark:text-red-400">Expired</span>
        ) : null}
      </td>
      <td className="relative z-10 whitespace-nowrap bg-emerald-50/40 px-1 py-2 align-middle font-mono text-xs tabular-nums text-zinc-600 dark:bg-emerald-950/25 dark:text-zinc-300">
        {lot ? (
          lot.expired ? (
            <span className="font-medium text-red-700 dark:text-red-400">Expired</span>
          ) : (
            formatLotExpiry(lot.expiryDate)
          )
        ) : (
          "—"
        )}
      </td>
      <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-300">
        {lot ? lot.product.packSize : "—"}
      </td>
      <td className="px-1 py-2 align-middle text-right">
        <input
          ref={draft.qtyInputDesktopRef}
          type="number"
          min={0}
          title={
            draft.lotAvailableQty > 0 ? `Max ${draft.lotAvailableQty} available` : "No stock available"
          }
          className={`ml-auto w-14 max-w-full text-right ${POS_FIELD_INPUT_CLASS}`}
          value={draft.qty < 1 ? "" : draft.qty}
          disabled={!lot}
          onChange={(e) => draft.setQtyFromInput(e.target.value)}
          onBlur={draft.commitQty}
          onKeyDown={draft.onQtyKeyDown}
        />
      </td>
      <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-400">
        {lot ? `₹${lot.mrp.toFixed(2)}` : "—"}
      </td>
      <td className="px-1 py-2 align-middle text-right">
        <NumericTableInput
          min={0}
          step={0.01}
          className={`ml-auto w-full min-w-0 max-w-[5rem] text-right font-medium text-zinc-800 dark:text-zinc-200 ${POS_FIELD_INPUT_CLASS}`}
          value={preview?.grossRate ?? 0}
          disabled={!lot}
          onChange={draft.setDraftLineGross}
          onKeyDown={draft.onCommitKeyDown}
        />
      </td>
      <td className="px-1 py-2 align-middle text-right">
        <NumericTableInput
          min={0}
          max={100}
          step={0.01}
          className={`ml-auto w-full min-w-0 max-w-[3.25rem] text-right ${POS_FIELD_INPUT_CLASS}`}
          value={draft.discountPct}
          disabled={!lot}
          onChange={draft.setDraftDiscountFromPct}
          onKeyDown={draft.onCommitKeyDown}
        />
      </td>
      <td className="px-1 py-2 align-middle text-right">
        <NumericTableInput
          min={0}
          max={preview ? Math.max(preview.amount, previewDiscRs) : 0}
          step={0.01}
          className={`ml-auto w-full min-w-0 max-w-[4rem] text-right ${POS_FIELD_INPUT_CLASS}`}
          value={previewDiscRs}
          disabled={!lot}
          onChange={draft.setDraftDiscountFromAmount}
          onKeyDown={draft.onCommitKeyDown}
        />
      </td>
      <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-400">
        {previewMarginPct == null ? "—" : `${previewMarginPct.toFixed(1)}%`}
      </td>
      <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-300">
        {draftGstPct == null ? "—" : `${draftGstPct}%`}
      </td>
      <td className="px-1 py-2 align-middle text-right tabular-nums text-zinc-600 dark:text-zinc-400">
        {preview ? `₹${preview.gstAmount.toFixed(2)}` : "—"}
      </td>
      <td className="px-1 py-2 align-middle text-right tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
        {preview ? `₹${preview.lineInclusiveTotal.toFixed(2)}` : "—"}
      </td>
      <td className="px-1 py-2 text-center align-middle">
        <button
          type="button"
          disabled={draft.addDisabled}
          aria-disabled={draft.addDisabled}
          className="touch-manipulation rounded bg-gradient-to-r from-brand-blue to-brand-green px-2 py-1.5 text-xs font-medium text-white shadow disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => {
            if (draft.addDisabled) return;
            draft.handleAdd();
          }}
        >
          Add
        </button>
      </td>
    </tr>
  );
}

/** Single draft-line controller: shared state for mobile card + desktop table row. */
export function DraftLineController({
  cart,
  onCommit,
  tableScrollRef,
  focusCustomerName,
  children,
}: {
  cart: CartLine[];
  onCommit: (line: CartLine) => void;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  focusCustomerName?: () => void;
  children: (draft: DraftLineState) => ReactNode;
}) {
  const draft = useDraftLine({ cart, onCommit, tableScrollRef, focusCustomerName });
  return <>{children(draft)}</>;
}
