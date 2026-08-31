"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatAppDateYmd } from "@/lib/app-timezone";
import {
  expiryTypingMode,
  formatExpiryDdMmYyyyTyping,
  formatExpiryMmYyTyping,
  isExpiryIsoOnOrAfterToday,
  isoToExpiryDdMmYyyy,
  parseExpiryInputToIso,
} from "@/lib/invoice-bill";

function assignRef<T>(instance: React.ForwardedRef<T>, value: T | null) {
  if (typeof instance === "function") instance(value);
  else if (instance) instance.current = value;
}

export type ExpiryDateInputProps = Omit<React.ComponentPropsWithoutRef<"input">, "type" | "value"> & {
  value?: string;
  wrapperClassName?: string;
  /** Calendar button that opens the native date picker. Default true. */
  pickerButton?: boolean;
  /** Place the calendar button inside the input on the right. Default true. */
  pickerInside?: boolean;
  buttonClassName?: string;
};

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.75 2a.75.75 0 01.75.75V4h7.5V2.75a.75.75 0 011.5 0V4h.75A2.75 2.75 0 0119 6.75v8.5A2.75 2.75 0 0116.25 18H3.75A2.75 2.75 0 011 15.25v-8.5A2.75 2.75 0 013.75 4H4.5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function formatExpiryTyping(raw: string): string {
  return expiryTypingMode(raw) === "mmyy" ? formatExpiryMmYyTyping(raw) : formatExpiryDdMmYyyyTyping(raw);
}

function committedDisplay(iso: string): string {
  return iso ? isoToExpiryDdMmYyyy(iso) : "";
}

export const ExpiryDateInput = forwardRef<HTMLInputElement, ExpiryDateInputProps>(
  function ExpiryDateInput(
    {
      value = "",
      onChange,
      onBlur,
      onFocus,
      className,
      wrapperClassName,
      pickerButton = true,
      pickerInside = true,
      buttonClassName,
      disabled,
      ...rest
    },
    ref,
  ) {
    const isoValue = value;
    const todayYmd = useMemo(() => formatAppDateYmd(), []);
    const [text, setText] = useState(() => committedDisplay(isoValue));
    const lastCommittedIso = useRef(isoValue);
    const focusedRef = useRef(false);
    const textRef = useRef<HTMLInputElement | null>(null);
    const pickerRef = useRef<HTMLInputElement | null>(null);

    const setTextRefs = useCallback(
      (el: HTMLInputElement | null) => {
        textRef.current = el;
        assignRef(ref, el);
      },
      [ref],
    );

    useEffect(() => {
      if (isoValue !== lastCommittedIso.current) {
        lastCommittedIso.current = isoValue;
        if (!focusedRef.current) {
          setText(committedDisplay(isoValue));
        }
      }
    }, [isoValue]);

    const emitIso = useCallback(
      (iso: string) => {
        lastCommittedIso.current = iso;
        onChange?.({ target: { value: iso } } as React.ChangeEvent<HTMLInputElement>);
      },
      [onChange],
    );

    const commitIso = useCallback(
      (iso: string) => {
        if (iso && !isExpiryIsoOnOrAfterToday(iso, todayYmd)) return;
        setText(committedDisplay(iso));
        emitIso(iso);
      },
      [emitIso, todayYmd],
    );

    const commitText = useCallback(
      (display: string) => {
        const trimmed = display.trim();
        if (!trimmed) {
          setText("");
          emitIso("");
          return;
        }
        const iso = parseExpiryInputToIso(trimmed);
        if (iso) {
          commitIso(iso);
          return;
        }
        setText(committedDisplay(lastCommittedIso.current));
      },
      [commitIso, emitIso],
    );

    const openPicker = useCallback(() => {
      const el = pickerRef.current;
      if (!el || disabled) return;
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
          return;
        } catch {
          /* secure context / unsupported */
        }
      }
      el.focus();
    }, [disabled]);

    const insetBtnClass =
      buttonClassName ??
      "absolute right-1 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

    const sideBtnClass =
      buttonClassName ??
      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800";

    const textClassName = (() => {
      if (!pickerButton) return className;
      if (pickerInside) return `${className ?? ""} min-w-0 w-full pr-9`.trim();
      return `${className ?? ""} min-w-0 flex-1`.trim();
    })();

    const textInput = (
      <input
        ref={setTextRefs}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="mm/yy"
        maxLength={10}
        disabled={disabled}
        className={textClassName}
        value={text}
        onFocus={(e) => {
          focusedRef.current = true;
          e.target.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const formatted = formatExpiryTyping(e.target.value);
          setText(formatted);
          const iso = parseExpiryInputToIso(formatted);
          if (iso) commitIso(iso);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          commitText(text);
          onBlur?.(e);
        }}
        {...rest}
      />
    );

    const pickerInput = (
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        value={isoValue}
        min={todayYmd}
        onChange={(e) => commitIso(e.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    );

    const pickerBtn = (
      <button
        type="button"
        disabled={disabled}
        className={pickerInside ? insetBtnClass : sideBtnClass}
        aria-label="Open calendar"
        title="Choose date"
        onClick={openPicker}
      >
        <CalendarGlyph className="h-4 w-4" />
      </button>
    );

    if (!pickerButton) {
      if (!wrapperClassName) return textInput;
      return <div className={wrapperClassName}>{textInput}</div>;
    }

    if (pickerInside) {
      return (
        <div className={`relative min-w-0 ${wrapperClassName ?? ""}`.trim()}>
          {textInput}
          {pickerInput}
          {pickerBtn}
        </div>
      );
    }

    return (
      <div className={`flex min-w-0 items-center gap-1 ${wrapperClassName ?? ""}`.trim()}>
        <div className="relative min-w-0 flex-1">
          {textInput}
          {pickerInput}
        </div>
        {pickerBtn}
      </div>
    );
  },
);
