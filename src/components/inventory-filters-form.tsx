"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useRef } from "react";
import { DatePickerInput } from "@/components/date-picker-input";
import { EXPIRY_SOON_LABEL } from "@/lib/inventory-expiry-filter";
import {
  readFormParamsWithCheckbox,
  useCascadingFilterOptions,
} from "@/components/use-cascading-filter-options";

export type InventoryFilterValues = {
  q: string;
  supplierId: string;
  brandId: string;
  expiry: string;
  expiryOn: string;
  lowStock: boolean;
};

const FILTER_FIELDS = [
  { name: "q", type: "field" as const },
  { name: "supplierId", type: "field" as const },
  { name: "brandId", type: "field" as const },
  { name: "expiry", type: "field" as const },
  { name: "expiryOn", type: "field" as const },
  { name: "lowStock", type: "checkbox" as const },
];

export function InventoryFiltersForm({
  action,
  filters,
  initialOptions,
  hiddenFields,
  clearHref,
  exportHref,
}: {
  action: string;
  filters: InventoryFilterValues;
  initialOptions: { suppliers: { id: string; name: string }[]; brands: { id: string; name: string }[] };
  hiddenFields?: ReactNode;
  clearHref: string;
  exportHref?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const hasActive =
    !!filters.q.trim() ||
    !!filters.supplierId ||
    !!filters.brandId ||
    !!filters.expiry ||
    !!filters.expiryOn ||
    filters.lowStock;

  const readParams = useCallback(
    () => readFormParamsWithCheckbox(formRef.current, FILTER_FIELDS),
    [],
  );

  const { options, refresh } = useCascadingFilterOptions(
    initialOptions,
    "/api/dashboard/inventory/filter-options",
    readParams,
  );

  return (
    <form ref={formRef} method="get" action={action} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {hiddenFields}
      <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Search</span>
        <input
          name="q"
          type="search"
          placeholder="Product name…"
          defaultValue={filters.q}
          onChange={refresh}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 md:text-sm"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Supplier</span>
        <select
          name="supplierId"
          defaultValue={filters.supplierId}
          onChange={refresh}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 md:text-sm"
        >
          <option value="">All suppliers</option>
          {options.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Brand</span>
        <select
          name="brandId"
          defaultValue={filters.brandId}
          onChange={refresh}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 md:text-sm"
        >
          <option value="">All brands</option>
          {options.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Expiry</span>
        <select
          name="expiry"
          defaultValue={filters.expiry}
          onChange={refresh}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 md:text-sm"
        >
          <option value="">All expiry</option>
          <option value="expired">Expired</option>
          <option value="soon">{EXPIRY_SOON_LABEL}</option>
          <option value="valid">Not expired</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Expires before</span>
        <DatePickerInput
          name="expiryOn"
          defaultValue={filters.expiryOn}
          onChange={refresh}
          wrapperClassName="w-full"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 md:text-sm"
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Low stock</span>
        <label className="flex min-h-[42px] w-full cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-950">
          <input
            type="checkbox"
            name="lowStock"
            value="1"
            defaultChecked={filters.lowStock}
            onChange={refresh}
            className="rounded border-zinc-400 accent-amber-500"
          />
          <span className="text-zinc-900 dark:text-zinc-100">Low stock only</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          className="touch-manipulation rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Search
        </button>
        {hasActive ? (
          <Link
            href={clearHref}
            className="touch-manipulation rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Clear
          </Link>
        ) : null}
        {exportHref ? (
          <a
            href={exportHref}
            className="touch-manipulation rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Download CSV
          </a>
        ) : null}
      </div>
    </form>
  );
}
