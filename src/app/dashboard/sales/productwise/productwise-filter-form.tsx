"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { formatAppDateYmd } from "@/lib/app-timezone";
import { DateRangePickerFields } from "@/components/date-range-picker-fields";
import { FilterOptionsCombobox } from "@/components/filter-options-combobox";
import { readFormParams, useCascadingFilterOptions } from "@/components/use-cascading-filter-options";

const FILTER_FIELDS = ["from", "to", "product"] as const;

export function ProductwiseFilterForm({
  actionPath,
  from,
  to,
  product,
  initialProducts,
  hiddenLimit,
  clearHref,
  resetTodayHref,
  exportHref,
}: {
  actionPath: string;
  from: string;
  to: string;
  product: string;
  initialProducts: string[];
  hiddenLimit?: string;
  clearHref: string;
  resetTodayHref: string;
  exportHref: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const today = formatAppDateYmd();
  const defaultFrom = from || today;
  const defaultTo = to || today;

  const readParams = useCallback(
    () => readFormParams(formRef.current, [...FILTER_FIELDS]),
    [],
  );

  const { options, refresh } = useCascadingFilterOptions(
    { products: initialProducts },
    "/api/dashboard/sales/productwise/filter-options",
    readParams,
  );

  return (
    <form ref={formRef} method="get" action={actionPath} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {hiddenLimit ? <input type="hidden" name="limit" value={hiddenLimit} /> : null}
      <DateRangePickerFields
        from={defaultFrom}
        to={defaultTo}
        onChange={refresh}
        inputClassName="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Product</span>
        <FilterOptionsCombobox
          name="product"
          defaultValue={product}
          onInputChange={refresh}
          placeholder="Product name"
          ariaLabel="Product names"
          options={options.products}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
      <div className="col-span-full flex flex-wrap items-center gap-2 md:flex-nowrap">
        <button
          type="submit"
          className="inline-flex shrink-0 items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Apply
        </button>
        <Link
          href={clearHref}
          className="inline-flex shrink-0 items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Clear filters
        </Link>
        <Link
          href={resetTodayHref}
          className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Reset to today
        </Link>
        <a
          href={exportHref}
          className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Download CSV
        </a>
      </div>
    </form>
  );
}
