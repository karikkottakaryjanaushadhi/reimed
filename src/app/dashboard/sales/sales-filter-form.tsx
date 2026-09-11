"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { formatAppDateYmd } from "@/lib/app-timezone";
import { DateRangePickerFields } from "@/components/date-range-picker-fields";
import { FilterOptionsCombobox } from "@/components/filter-options-combobox";
import { readFormParams, useCascadingFilterOptions } from "@/components/use-cascading-filter-options";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/lib/product-categories";
import { PRODUCT_SCHEDULES, PRODUCT_SCHEDULE_LABELS } from "@/lib/product-schedules";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/lib/product-types";
import { PAYMENT_MODES } from "@/lib/constants";

const FILTER_FIELDS = [
  "from",
  "to",
  "billNo",
  "doctor",
  "patient",
  "cashier",
  "product",
  "brand",
  "category",
  "type",
  "schedule",
  "payment",
  "unpaid",
] as const;

const fieldCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const PAYMENT_LABELS: Record<(typeof PAYMENT_MODES)[number], string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  CREDIT: "Credit",
};

export function SalesFilterForm({
  actionPath,
  from,
  to,
  billNo,
  doctor,
  patient,
  cashier,
  product,
  brand,
  category,
  type,
  schedule,
  payment,
  unpaidOnly,
  initialOptions,
  hiddenLimit,
  clearHref,
  resetTodayHref,
}: {
  actionPath: string;
  from: string;
  to: string;
  billNo: string;
  doctor: string;
  patient: string;
  cashier: string;
  product: string;
  brand: string;
  category: string;
  type: string;
  schedule: string;
  payment: string;
  unpaidOnly: boolean;
  initialOptions: {
    doctors: string[];
    patients: string[];
    cashiers: string[];
    products: string[];
    brands: string[];
  };
  hiddenLimit?: string;
  clearHref: string;
  resetTodayHref: string;
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
    initialOptions,
    "/api/dashboard/sales/filter-options",
    readParams,
  );

  return (
    <form
      ref={formRef}
      method="get"
      action={actionPath}
      className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {hiddenLimit ? <input type="hidden" name="limit" value={hiddenLimit} /> : null}

      <DateRangePickerFields from={defaultFrom} to={defaultTo} onChange={refresh} inputClassName={fieldCls} />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Bill #</span>
        <input
          name="billNo"
          type="search"
          defaultValue={billNo}
          onChange={refresh}
          placeholder="Bill number"
          autoComplete="off"
          inputMode="numeric"
          aria-label="Bill number"
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Doctor</span>
        <FilterOptionsCombobox
          name="doctor"
          defaultValue={doctor}
          onInputChange={refresh}
          placeholder="Doctor name"
          ariaLabel="Doctor names"
          options={options.doctors}
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Patient</span>
        <FilterOptionsCombobox
          name="patient"
          defaultValue={patient}
          onInputChange={refresh}
          placeholder="Patient name"
          ariaLabel="Patient names"
          options={options.patients}
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Cashier</span>
        <FilterOptionsCombobox
          name="cashier"
          defaultValue={cashier}
          onInputChange={refresh}
          placeholder="Cashier name"
          ariaLabel="Cashier names"
          options={options.cashiers}
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Product</span>
        <FilterOptionsCombobox
          name="product"
          defaultValue={product}
          onInputChange={refresh}
          placeholder="Product name"
          ariaLabel="Product names"
          options={options.products}
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Brand</span>
        <FilterOptionsCombobox
          name="brand"
          defaultValue={brand}
          onInputChange={refresh}
          placeholder="Brand name"
          ariaLabel="Brand names"
          options={options.brands}
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Category</span>
        <select name="category" defaultValue={category} onChange={refresh} className={fieldCls} aria-label="Category">
          <option value="">All</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PRODUCT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Type</span>
        <select name="type" defaultValue={type} onChange={refresh} className={fieldCls} aria-label="Type">
          <option value="">All</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t} value={t}>
              {PRODUCT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Schedule</span>
        <select name="schedule" defaultValue={schedule} onChange={refresh} className={fieldCls} aria-label="Schedule">
          <option value="">All</option>
          {PRODUCT_SCHEDULES.map((s) => (
            <option key={s} value={s}>
              {PRODUCT_SCHEDULE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Payment</span>
        <select name="payment" defaultValue={payment} onChange={refresh} className={fieldCls} aria-label="Payment mode">
          <option value="">All</option>
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-fit flex-col gap-1 self-end">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">&nbsp;</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap py-2">
          <input
            type="checkbox"
            name="unpaid"
            value="1"
            defaultChecked={unpaidOnly}
            onChange={refresh}
            className="h-4 w-4 shrink-0 rounded border-zinc-300 text-brand-blue focus:ring-brand-blue dark:border-zinc-600"
          />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Unpaid</span>
        </span>
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
      </div>
    </form>
  );
}
