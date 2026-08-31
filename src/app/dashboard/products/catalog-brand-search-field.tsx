"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  anchorRectBelow,
  BILLING_DROPDOWN_LIST_CLASS,
  BILLING_DROPDOWN_OPTION_IDLE_CLASS,
  BILLING_DROPDOWN_OPTION_SELECTED_CLASS,
  floatingDropdownMaxHeight,
} from "@/lib/floating-dropdown";

export type CatalogBrandHit = { id: string; name: string };

type Props = {
  fieldId: string;
  labelCls: string;
  inputCls: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  hits: CatalogBrandHit[];
  hi: number;
  onHiChange: (index: number) => void;
  onPick: (brand: CatalogBrandHit) => void;
  onDismissHits: () => void;
  listOpen: boolean;
  /** Merged onto the field wrapper (defaults include min/max width for desktop rows). */
  wrapClassName?: string;
  inputProps?: {
    "data-np-field"?: string;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  };
};

export function CatalogBrandSearchField({
  fieldId,
  labelCls,
  inputCls,
  value,
  onChange,
  onKeyDown,
  hits,
  hi,
  onHiChange,
  onPick,
  onDismissHits,
  listOpen,
  wrapClassName,
  inputProps,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [popRect, setPopRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePopRect = useCallback(() => {
    if (inputRef.current) setPopRect(anchorRectBelow(inputRef.current));
    else setPopRect(null);
  }, []);

  useLayoutEffect(() => {
    if (!listOpen) {
      setPopRect(null);
      return;
    }
    updatePopRect();
  }, [listOpen, hits, updatePopRect]);

  useEffect(() => {
    if (!listOpen) return;
    const onScrollOrResize = () => updatePopRect();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [listOpen, updatePopRect]);

  useLayoutEffect(() => {
    if (hi < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-brand-idx="${hi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [hi, hits]);

  useEffect(() => {
    if (!listOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      onDismissHits();
    }
    document.addEventListener("mousedown", onDocMouseDown, true);
    return () => document.removeEventListener("mousedown", onDocMouseDown, true);
  }, [listOpen, onDismissHits]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    inputProps?.onKeyDown?.(e);
    if (e.defaultPrevented) return;
    onKeyDown?.(e);
  }

  const listPortal =
    listOpen &&
    popRect &&
    hits.length > 0 &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={listRef}
        id={`${fieldId}-list`}
        role="listbox"
        aria-label="Matching brands"
        style={{
          position: "fixed",
          top: popRect.top,
          left: popRect.left,
          width: popRect.width,
          zIndex: 300,
          maxHeight: floatingDropdownMaxHeight(),
        }}
        className={BILLING_DROPDOWN_LIST_CLASS}
        onWheel={(e) => e.stopPropagation()}
      >
        {hits.map((b, idx) => (
          <li key={b.id} role="option" aria-selected={idx === hi}>
            <button
              type="button"
              data-brand-idx={idx}
              className={`flex w-full px-2.5 py-2 text-left ${
                idx === hi ? BILLING_DROPDOWN_OPTION_SELECTED_CLASS : BILLING_DROPDOWN_OPTION_IDLE_CLASS
              }`}
              onMouseEnter={() => onHiChange(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(b)}
            >
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{b.name}</span>
            </button>
          </li>
        ))}
      </ul>,
      document.body,
    );

  return (
    <>
      <div
        ref={wrapRef}
        className={
          wrapClassName ?? "relative flex min-w-[10rem] max-w-[20rem] flex-1 flex-col gap-1"
        }
      >
        <label className={labelCls} htmlFor={fieldId}>
          Brand
        </label>
        <input
          ref={inputRef}
          id={fieldId}
          autoComplete="off"
          placeholder="Search brand…"
          className={inputCls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? `${fieldId}-list` : undefined}
          data-np-field={inputProps?.["data-np-field"]}
        />
      </div>
      {listPortal}
    </>
  );
}
