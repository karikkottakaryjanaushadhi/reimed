"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import {
  anchorRectBelow,
  BILLING_DROPDOWN_LIST_CLASS,
  BILLING_DROPDOWN_OPTION_IDLE_CLASS,
  BILLING_DROPDOWN_OPTION_SELECTED_CLASS,
  floatingDropdownMaxHeight,
} from "@/lib/floating-dropdown";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

export function FilterOptionsCombobox({
  name,
  defaultValue = "",
  placeholder,
  className,
  options,
  ariaLabel,
  onInputChange,
  inputRef: externalInputRef,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  options: string[];
  ariaLabel: string;
  onInputChange?: () => void;
  inputRef?: Ref<HTMLInputElement | null>;
}) {
  const innerInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultValue);
  const [hi, setHi] = useState(0);
  const [popRect, setPopRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setQuery(defaultValue);
    if (innerInputRef.current) innerInputRef.current.value = defaultValue;
  }, [defaultValue]);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      innerInputRef.current = el;
      assignRef(externalInputRef, el);
    },
    [externalInputRef],
  );

  const uniqueOptions = useMemo(
    () => [...new Set(options.map((o) => o.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uniqueOptions;
    return uniqueOptions.filter((o) => o.toLowerCase().includes(q));
  }, [uniqueOptions, query]);

  const updateRect = useCallback(() => {
    const el = innerInputRef.current;
    if (el) setPopRect(anchorRectBelow(el));
  }, []);

  useEffect(() => {
    if (filtered.length > 0) setHi(0);
    else setHi(-1);
  }, [filtered]);

  useLayoutEffect(() => {
    if (hi < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-filter-opt-idx="${hi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [hi, filtered]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPopRect(null);
  }, []);

  const pickOption = useCallback(
    (value: string) => {
      setQuery(value);
      if (innerInputRef.current) innerInputRef.current.value = value;
      closeMenu();
      onInputChange?.();
    },
    [closeMenu, onInputChange],
  );

  const onInput = useCallback(() => {
    const v = innerInputRef.current?.value ?? "";
    setQuery(v);
    setOpen(true);
    updateRect();
    onInputChange?.();
  }, [onInputChange, updateRect]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open || filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((h) => (h < 0 ? 0 : Math.min(filtered.length - 1, h + 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((h) => (h < 0 ? filtered.length - 1 : Math.max(0, h - 1)));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const row = filtered[hi >= 0 ? hi : 0];
        if (row) pickOption(row);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    },
    [closeMenu, filtered, hi, open, pickOption],
  );

  const listPortal =
    open &&
    popRect &&
    filtered.length > 0 &&
    typeof document !== "undefined" &&
    createPortal(
      <ul
        ref={listRef}
        role="listbox"
        aria-label={ariaLabel}
        style={{
          position: "fixed",
          top: popRect.top,
          left: popRect.left,
          width: popRect.width,
          zIndex: 100,
          maxHeight: floatingDropdownMaxHeight(),
        }}
        className={BILLING_DROPDOWN_LIST_CLASS}
        onWheel={(e) => e.stopPropagation()}
      >
        {filtered.map((opt, idx) => (
          <li
            key={opt}
            role="option"
            aria-selected={idx === hi}
            className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
          >
            <button
              type="button"
              data-filter-opt-idx={idx}
              className={`flex w-full px-2 py-2 text-left ${
                idx === hi ? BILLING_DROPDOWN_OPTION_SELECTED_CLASS : BILLING_DROPDOWN_OPTION_IDLE_CLASS
              }`}
              onMouseEnter={() => setHi(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickOption(opt)}
            >
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{opt}</span>
            </button>
          </li>
        ))}
      </ul>,
      document.body,
    );

  return (
    <>
      <input
        ref={setInputRef}
        name={name}
        type="search"
        autoComplete="off"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-autocomplete="list"
        onFocus={() => {
          setOpen(true);
          updateRect();
        }}
        onBlur={() => {
          window.setTimeout(() => closeMenu(), 120);
        }}
        onInput={onInput}
        onKeyDown={onKeyDown}
      />
      {listPortal}
    </>
  );
}
