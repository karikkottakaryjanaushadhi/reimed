"use client";

import { useCallback, useId, useRef } from "react";
import { DateRangePickerFields } from "@/components/date-range-picker-fields";
import { FilterOptionsCombobox } from "@/components/filter-options-combobox";
import { readFormParams, useCascadingFilterOptions } from "@/components/use-cascading-filter-options";
import { formatAppMonthEndYmd, formatAppMonthStartYmd } from "@/lib/app-timezone";
import { PAYMENT_MODES } from "@/lib/constants";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/lib/product-categories";
import { PRODUCT_SCHEDULES, PRODUCT_SCHEDULE_LABELS } from "@/lib/product-schedules";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS } from "@/lib/product-types";
import type { PurchaseDateOn, PurchasePaidFilter, PurchaseStatusFilter } from "@/lib/purchases-filter-options";

export type { PurchaseDateOn, PurchasePaidFilter, PurchaseStatusFilter };

const FILTER_FIELDS = [
  "from",
  "to",
  "dateOn",
  "status",
  "paid",
  "payment",
  "supplier",
  "cashier",
  "invoice",
  "amount",
  "product",
  "brand",
  "category",
  "type",
  "schedule",
] as const;

const fieldCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

const PAYMENT_LABELS: Record<(typeof PAYMENT_MODES)[number], string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  CREDIT: "Credit",
};

export function PurchasesFilterForm({
  actionPath,
  from,
  to,
  dateOn,
  supplier,
  cashier,
  invoice,
  amount,
  product,
  brand,
  category,
  type,
  schedule,
  payment,
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
  cashier: string;
  invoice: string;
  amount: string;
  product: string;
  brand: string;
  category: string;
  type: string;
  schedule: string;
  payment: string;
  status: PurchaseStatusFilter;
  paid: PurchasePaidFilter;
  initialOptions: { suppliers: string[]; cashiers: string[]; products: string[]; brands: string[] };
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
          <select name="dateOn" defaultValue={dateOn} onChange={refresh} className={fieldCls} aria-label="Which date field to filter">
            <option value="recorded">Recorded (saved)</option>
            <option value="invoice">Invoice date</option>
          </select>
        </label>

        <DateRangePickerFields from={defaultFrom} to={defaultTo} onChange={refresh} inputClassName={fieldCls} />

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</span>
          <select name="status" defaultValue={status} onChange={refresh} className={fieldCls} aria-label="Purchase status">
            <option value="">All</option>
            <option value="complete">Finalized</option>
            <option value="in_progress">Editing</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Paid</span>
          <select name="paid" defaultValue={paid} onChange={refresh} className={fieldCls} aria-label="Payment status">
            <option value="">All</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Mode</span>
          <select name="payment" defaultValue={payment} onChange={refresh} className={fieldCls} aria-label="Payment mode">
            <option value="">All</option>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m]}
              </option>
            ))}
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
            className={fieldCls}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recorded by</span>
          <FilterOptionsCombobox
            name="cashier"
            defaultValue={cashier}
            onInputChange={refresh}
            placeholder="User name"
            ariaLabel="Recorded by"
            options={options.cashiers}
            className={fieldCls}
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
            className={fieldCls}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total ₹</span>
          <input
            name="amount"
            type="search"
            defaultValue={amount}
            onChange={refresh}
            placeholder="Bill total"
            autoComplete="off"
            inputMode="decimal"
            aria-label="Purchase total amount"
            className={fieldCls}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Product</span>
          <FilterOptionsCombobox
            name="product"
            defaultValue={product}
            onInputChange={refresh}
            placeholder="Product on any line"
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
