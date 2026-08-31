"use client";

import { forwardRef, useCallback, useRef } from "react";

function assignRef<T>(instance: React.ForwardedRef<T>, value: T | null) {
  if (typeof instance === "function") instance(value);
  else if (instance) instance.current = value;
}

export type DatePickerInputProps = Omit<React.ComponentPropsWithoutRef<"input">, "type"> & {
  /** Extra calendar button that opens the native picker where supported. Default true. */
  pickerButton?: boolean;
  /** Place the calendar button inside the input on the right. Default true. */
  pickerInside?: boolean;
  wrapperClassName?: string;
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

export const DatePickerInput = forwardRef<HTMLInputElement, DatePickerInputProps>(
  function DatePickerInput(
    {
      className,
      pickerButton = true,
      pickerInside = true,
      wrapperClassName,
      buttonClassName,
      disabled,
      ...rest
    },
    ref,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null);

    const setRefs = useCallback(
      (el: HTMLInputElement | null) => {
        innerRef.current = el;
        assignRef(ref, el);
      },
      [ref],
    );

    const openPicker = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      if (typeof el.showPicker === "function") {
        try {
          el.showPicker();
          return;
        } catch {
          /* secure context / disabled input */
        }
      }
      el.focus();
    }, []);

    const insetBtnClass =
      buttonClassName ??
      "absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

    const sideBtnClass =
      buttonClassName ??
      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800";

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

    const inputClassName = (() => {
      if (!pickerButton) return className;
      if (pickerInside) return `${className ?? ""} min-w-0 w-full pr-9`.trim();
      return `${className ?? ""} min-w-0 flex-1`.trim();
    })();

    const input = (
      <input ref={setRefs} type="date" disabled={disabled} className={inputClassName} {...rest} />
    );

    if (!pickerButton) {
      return input;
    }

    if (pickerInside) {
      return (
        <div className={`relative min-w-0 ${wrapperClassName ?? ""}`.trim()}>
          {input}
          {pickerBtn}
        </div>
      );
    }

    return (
      <div className={`flex min-w-0 items-center gap-1 ${wrapperClassName ?? ""}`.trim()}>
        {input}
        {pickerBtn}
      </div>
    );
  },
);
