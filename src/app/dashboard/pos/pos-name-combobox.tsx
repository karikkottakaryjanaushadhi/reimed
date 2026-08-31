"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import type { PosNameField } from "@/lib/pos-name-suggestions";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

export function PosNameCombobox({
  field,
  value,
  onChange,
  className,
  ariaLabel,
  inputRef: externalInputRef,
  onEnterNext,
}: {
  field: PosNameField;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement | null>;
  onEnterNext?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const innerInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const [popRect, setPopRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      innerInputRef.current = el;
      assignRef(externalInputRef, el);
    },
    [externalInputRef],
  );

  const updateRect = useCallback(() => {
    const el = innerInputRef.current;
    if (el) setPopRect(anchorRectBelow(el));
  }, []);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({ field });
          const q = value.trim();
          if (q) params.set("q", q);
          const res = await fetch(`/api/pos/name-suggestions?${params}`, { signal: ac.signal });
          if (!res.ok) return;
          const data = (await res.json()) as { names?: string[] };
          setOptions(data.names ?? []);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      })();
    }, 200);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [field, open, value]);

  useEffect(() => {
    if (options.length > 0) setHi(0);
    else setHi(-1);
  }, [options]);

  useLayoutEffect(() => {
    if (hi < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-pos-name-opt-idx="${hi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [hi, options]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setPopRect(null);
  }, []);

  const pickOption = useCallback(
    (next: string) => {
      onChange(next);
      closeMenu();
    },
    [closeMenu, onChange],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (open && options.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHi((h) => (h < 0 ? 0 : Math.min(options.length - 1, h + 1)));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHi((h) => (h < 0 ? options.length - 1 : Math.max(0, h - 1)));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const row = options[hi >= 0 ? hi : 0];
          if (row) pickOption(row);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeMenu();
          return;
        }
      }
      onEnterNext?.(e);
    },
    [closeMenu, hi, onEnterNext, open, options, pickOption],
  );

  const listPortal =
    open &&
    popRect &&
    options.length > 0 &&
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
        {options.map((opt, idx) => (
          <li
            key={opt}
            role="option"
            aria-selected={idx === hi}
            className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
          >
            <button
              type="button"
              data-pos-name-opt-idx={idx}
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
        type="search"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          updateRect();
        }}
        className={className}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-autocomplete="list"
        onFocus={() => {
          setOpen(true);
          updateRect();
        }}
        onBlur={() => {
          window.setTimeout(() => closeMenu(), 120);
        }}
        onKeyDown={onKeyDown}
      />
      {listPortal}
    </>
  );
}
