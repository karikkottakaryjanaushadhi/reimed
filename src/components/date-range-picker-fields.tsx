"use client";

import { useEffect, useState, type ChangeEventHandler } from "react";
import { DatePickerInput } from "@/components/date-picker-input";

const labelClass = "text-xs font-medium uppercase tracking-wide text-zinc-500";

export function DateRangePickerFields({
  from,
  to,
  fromLabel = "From",
  toLabel = "To",
  onChange,
  inputClassName,
}: {
  from: string;
  to: string;
  fromLabel?: string;
  toLabel?: string;
  onChange?: () => void;
  inputClassName?: string;
}) {
  const [fromDate, setFromDate] = useState(from);
  const [toDate, setToDate] = useState(to);

  useEffect(() => {
    setFromDate(from);
    setToDate(to);
  }, [from, to]);

  const handleFromChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const nextFrom = e.target.value;
    setFromDate(nextFrom);
    if (nextFrom && toDate && toDate < nextFrom) {
      setToDate(nextFrom);
    }
    onChange?.();
  };

  const handleToChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const nextTo = e.target.value;
    setToDate(nextTo);
    if (nextTo && fromDate && fromDate > nextTo) {
      setFromDate(nextTo);
    }
    onChange?.();
  };

  const pickerClass =
    inputClassName ??
    "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{fromLabel}</span>
        <DatePickerInput
          name="from"
          value={fromDate}
          max={toDate || undefined}
          onChange={handleFromChange}
          wrapperClassName="w-full"
          className={pickerClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{toLabel}</span>
        <DatePickerInput
          name="to"
          value={toDate}
          min={fromDate || undefined}
          onChange={handleToChange}
          wrapperClassName="w-full"
          className={pickerClass}
        />
      </label>
    </>
  );
}
