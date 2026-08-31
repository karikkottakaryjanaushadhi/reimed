"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { FilterOptionsCombobox } from "@/components/filter-options-combobox";
import { readFormParams, useCascadingFilterOptions } from "@/components/use-cascading-filter-options";
import { PRODUCT_GST_SLABS } from "@/lib/product-gst-slabs";
import type { ProductStockFilter } from "@/lib/products-filter-options";

export type { ProductStockFilter };

const FILTER_FIELDS = ["q", "brand", "gst", "stock"] as const;

export function ProductsFilterForm({
  q,
  brand,
  gst,
  stock,
  initialBrands,
  hiddenLimit,
  hiddenSort,
  hiddenDir,
  clearHref,
}: {
  q: string;
  brand: string;
  gst: string;
  stock: ProductStockFilter;
  initialBrands: string[];
  hiddenLimit?: string;
  hiddenSort?: string;
  hiddenDir?: string;
  clearHref: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const readParams = useCallback(
    () => readFormParams(formRef.current, [...FILTER_FIELDS]),
    [],
  );

  const { options, refresh } = useCascadingFilterOptions(
    { brands: initialBrands },
    "/api/dashboard/products/filter-options",
    readParams,
  );

  return (
    <form
      ref={formRef}
      method="get"
      action="/dashboard/products"
      className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      {hiddenLimit ? <input type="hidden" name="limit" value={hiddenLimit} /> : null}
      {hiddenSort ? <input type="hidden" name="sort" value={hiddenSort} /> : null}
      {hiddenDir ? <input type="hidden" name="dir" value={hiddenDir} /> : null}

      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Search</span>
        <input
          name="q"
          type="search"
          defaultValue={q}
          onChange={refresh}
          placeholder="Name, drug code, brand or generic…"
          autoComplete="off"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
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
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">GST %</span>
        <select
          name="gst"
          defaultValue={gst}
          onChange={refresh}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          aria-label="GST slab"
        >
          <option value="">All</option>
          {PRODUCT_GST_SLABS.map((p) => (
            <option key={p} value={String(p)}>
              {p}%
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Stock</span>
        <select
          name="stock"
          defaultValue={stock}
          onChange={refresh}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          aria-label="Stock level"
        >
          <option value="">All</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-5">
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Apply
        </button>
        <Link
          href={clearHref}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Clear filters
        </Link>
      </div>
    </form>
  );
}
