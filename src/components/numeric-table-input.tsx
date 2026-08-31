"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

export type NumericTableInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "onBlur"
> & {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  /** When true (default), show blank instead of 0 until the user enters a value. */
  emptyWhenZero?: boolean;
  /** Parse with parseInt instead of parseFloat. */
  integer?: boolean;
  /** Value applied when the field is cleared and blurred. Defaults to 0. */
  fallback?: number;
};

function parseNumericRaw(raw: string, integer: boolean): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = integer ? Number.parseInt(t, 10) : Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function NumericTableInput({
  value,
  onChange,
  onBlur,
  emptyWhenZero = true,
  integer = false,
  fallback = 0,
  onKeyDown,
  ...rest
}: NumericTableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    if (draft === null) return;
    if (document.activeElement === inputRef.current) return;
    setDraft(null);
  }, [value, draft]);

  const display =
    draft !== null ? draft : emptyWhenZero && value === 0 ? "" : String(value);

  function commitBlur() {
    if (draft !== null) {
      const parsed = parseNumericRaw(draft, integer);
      setDraft(null);
      onChange(parsed ?? fallback);
    }
    onBlur?.();
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseNumericRaw(raw, integer);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={commitBlur}
      onKeyDown={onKeyDown}
      {...rest}
    />
  );
}
