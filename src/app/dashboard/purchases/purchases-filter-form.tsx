"use client";

import { useCallback, useId, useRef } from "react";
import { DateRangePickerFields } from "@/components/date-range-picker-fields";
import { FilterOptionsCombobox } from "@/components/filter-options-combobox";
import { readFormParams, useCascadingFilterOptions } from "@/components/use-cascading-filter-options";
import { formatAppMonthEndYmd, formatAppMonthStartYmd } from "@/lib/app-timezone";
import type { PurchaseDateOn, PurchasePaidFilter, PurchaseStatusFilter } from "@/lib/purchases-filter-options";

export type { PurchaseDateOn, PurchasePaidFilter, PurchaseStatusFilter };

const FILTER_FIELDS = ["from", "to", "dateOn", "status", "paid", "supplier", "invoice", "product"] as const;

export function PurchasesFilterForm({
  actionPath,
  from,
  to,
  dateOn,
  supplier,
  invoice,
  product,
  status,
  paid,
  initialOptions,
  hiddenLimit,
  hiddenSort,
  hiddenDir,
  clearHref,
  resetThisMonthHref,
}: {
  actionPath: string;
  from: string;
  to: string;
  dateOn: PurchaseDateOn;
  supplier: string;
  invoice: string;
  product: string;
  status: PurchaseStatusFilter;
  paid: PurchasePaidFilter;
  initialOptions: { suppliers: string[]; products: string[] };
  hiddenLimit?: string;
  hiddenSort?: string;
  hiddenDir?: string;
  clearHref: string;
  resetThisMonthHref: string;
}) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement | null>(null);
  const defaultFrom = from || formatAppMonthStartYmd();
  const defaultTo = to || formatAppMonthEndYmd();

  const readParams = useCallback(
    () => readFormParams(formRef.current, [...FILTER_FIELDS]),
    [],
  );

  const { options, refresh } = useCascadingFilterOptions(
    initialOptions,
    "/api/dashboard/purchases/filter-options",
    readParams,
  );

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <form ref={formRef} id={formId} method="get" action={actionPath} className="contents">
        {hiddenLimit ? <input type="hidden" name="limit" value={hiddenLimit} /> : null}
        {hiddenSort ? <input type="hidden" name="sort" value={hiddenSort} /> : null}
        {hiddenDir ? <input type="hidden" name="dir" value={hiddenDir} /> : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Date on</span>
          <select
            name="dateOn"
            defaultValue={dateOn}
            onChange={refresh}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            aria-label="Which date field to filter"
          >
            <option value="recorded">Recorded (saved)</option>
            <option value="invoice">Invoice date</option>
          </select>
        </label>

        <DateRangePickerFields
          from={defaultFrom}
          to={defaultTo}
          onChange={refresh}
          inputClassName="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</span>
          <select
            name="status"
            defaultValue={status}
            onChange={refresh}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            aria-label="Purchase status"
          >
            <option value="">All</option>
            <option value="complete">Finalized</option>
            <option value="in_progress">Editing</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Payment</span>
          <select
            name="paid"
            defaultValue={paid}
            onChange={refresh}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
            aria-label="Payment status"
          >
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Supplier</span>
          <FilterOptionsCombobox
            name="supplier"
            defaultValue={supplier}
            onInputChange={refresh}
            placeholder="Supplier name"
            ariaLabel="Supplier names"
            options={options.suppliers}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Invoice no.</span>
          <input
            name="invoice"
            type="search"
            defaultValue={invoice}
            onChange={refresh}
            placeholder="Invoice reference"
            autoComplete="off"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Product</span>
          <FilterOptionsCombobox
            name="product"
            defaultValue={product}
            onInputChange={refresh}
            placeholder="Product on any line"
            ariaLabel="Product names"
            options={options.products}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
      </form>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-4">
        <button
          type="submit"
          form={formId}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Apply
        </button>
        <a
          href={clearHref}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Clear filters
        </a>
        <a
          href={resetThisMonthHref}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          This month
        </a>
      </div>
    </div>
  );
}
