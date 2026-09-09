"use client";

import Link from "next/link";
import { useCallback, useRef } from "react";
import { DateRangePickerFields } from "@/components/date-range-picker-fields";
import { FilterOptionsCombobox } from "@/components/filter-options-combobox";
import { readFormParams, useCascadingFilterOptions } from "@/components/use-cascading-filter-options";
import type { TransferDirectionFilter } from "@/lib/transfers-filter-options";

const FILTER_FIELDS = ["from", "to", "direction", "branch", "product", "transferNo", "batch", "recordedBy"] as const;

const fieldCls =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-brand-blue-light dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";

export function TransfersFilterForm({
  actionPath,
  from,
  to,
  direction,
  counterpartyId,
  product,
  transferNo,
  batch,
  recordedBy,
  initialOptions,
  hiddenLimit,
  clearHref,
  resetThisMonthHref,
}: {
  actionPath: string;
  from: string;
  to: string;
  direction: TransferDirectionFilter;
  counterpartyId: string;
  product: string;
  transferNo: string;
  batch: string;
  recordedBy: string;
  initialOptions: {
    products: string[];
    recordedBy: string[];
    stores: { id: string; name: string }[];
  };
  hiddenLimit?: string;
  clearHref: string;
  resetThisMonthHref: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const readParams = useCallback(() => readFormParams(formRef.current, [...FILTER_FIELDS]), []);

  const { options, refresh } = useCascadingFilterOptions(
    initialOptions,
    "/api/dashboard/transfers/filter-options",
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

      <DateRangePickerFields from={from} to={to} onChange={refresh} inputClassName={fieldCls} />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Direction</span>
        <select
          name="direction"
          defaultValue={direction === "all" ? "" : direction}
          onChange={refresh}
          className={fieldCls}
          aria-label="Transfer direction"
        >
          <option value="">All</option>
          <option value="out">Sent out</option>
          <option value="in">Received</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Branch</span>
        <select
          name="branch"
          defaultValue={counterpartyId}
          onChange={refresh}
          className={fieldCls}
          aria-label="Counterparty branch"
        >
          <option value="">All branches</option>
          {options.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
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
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Transfer no.</span>
        <input
          name="transferNo"
          type="search"
          defaultValue={transferNo}
          onChange={refresh}
          placeholder="e.g. 42"
          autoComplete="off"
          inputMode="numeric"
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Batch no.</span>
        <input
          name="batch"
          type="search"
          defaultValue={batch}
          onChange={refresh}
          placeholder="Batch on any line"
          autoComplete="off"
          className={fieldCls}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recorded by</span>
        <FilterOptionsCombobox
          name="recordedBy"
          defaultValue={recordedBy}
          onInputChange={refresh}
          placeholder="Staff name"
          ariaLabel="Recorded by"
          options={options.recordedBy}
          className={fieldCls}
        />
      </label>

      <div className="col-span-full flex flex-wrap items-center gap-2">
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
        <Link
          href={resetThisMonthHref}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          This month
        </Link>
      </div>
    </form>
  );
}
