import Link from "next/link";
import {
  DEFAULT_LIST_PAGE_SIZE,
  MIN_LIST_PAGE_SIZE,
  QUICK_PAGE_SIZES,
  listPageSizeInputMax,
} from "@/lib/list-pagination";

/** Prev/next links + editable page number for a single paginated list. */
export function ListPaginationNav({
  label,
  page,
  totalPages,
  totalItems,
  prevHref,
  nextHref,
  basePath,
  pageParamName = "page",
  extraHidden,
}: {
  label: string;
  page: number;
  totalPages: number;
  totalItems: number;
  prevHref: string;
  nextHref: string;
  basePath: string;
  pageParamName?: string;
  extraHidden?: Record<string, string>;
}) {
  if (totalItems === 0) return null;
  const linkCls =
    "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";
  const disabledCls = "rounded-lg border border-transparent px-3 py-1.5 text-zinc-400";
  const inputCls =
    "w-14 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100";
  const goBtnCls =
    "rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{label}:</span>
        <form
          key={`${pageParamName}-${page}`}
          method="get"
          action={basePath}
          className="inline-flex flex-wrap items-center gap-1.5"
        >
          {Object.entries(extraHidden ?? {}).map(([k, v]) =>
            v ? <input key={k} type="hidden" name={k} value={v} /> : null,
          )}
          <span>page</span>
          <input
            name={pageParamName}
            type="number"
            min={1}
            max={Math.max(1, totalPages)}
            step={1}
            defaultValue={page}
            className={inputCls}
            aria-label={`${label} page number`}
          />
          <span>of {totalPages}</span>
          <button type="submit" className={goBtnCls}>
            Go
          </button>
        </form>
        <span className="text-zinc-400">· {totalItems} total</span>
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={prevHref} className={linkCls}>
            Previous
          </Link>
        ) : (
          <span className={disabledCls}>Previous</span>
        )}
        {page < totalPages ? (
          <Link href={nextHref} className={linkCls}>
            Next
          </Link>
        ) : (
          <span className={disabledCls}>Next</span>
        )}
      </div>
    </div>
  );
}

function buildQueryUrl(basePath: string, entries: Array<[string, string]>): string {
  const p = new URLSearchParams();
  for (const [k, v] of entries) {
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/**
 * Rows-per-page quick links + manual GET form (same behaviour as Stock & expiry inventory sections).
 * Changing limit resets to page 1 via hidden `page` field on submit.
 */
export function ListPageSizeControls({
  basePath,
  pageParamName = "page",
  limitParamName = "limit",
  currentLimit,
  totalItems,
  extraHidden,
}: {
  basePath: string;
  pageParamName?: string;
  limitParamName?: string;
  currentLimit: number;
  totalItems: number;
  extraHidden?: Record<string, string>;
}) {
  const inputMax = listPageSizeInputMax(totalItems);

  function quickHref(limit: number): string {
    const pairs: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(extraHidden ?? {})) {
      if (v) pairs.push([k, v]);
    }
    if (limit !== DEFAULT_LIST_PAGE_SIZE) pairs.push([limitParamName, String(limit)]);
    return buildQueryUrl(basePath, pairs);
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="uppercase tracking-wide">Rows per page</span>
      <span className="flex flex-wrap gap-1">
        {QUICK_PAGE_SIZES.map((n) => {
          const active = n === currentLimit;
          return (
            <Link
              key={n}
              href={quickHref(n)}
              scroll={false}
              className={`rounded-md px-2 py-1 font-medium ${
                active
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {n}
            </Link>
          );
        })}
      </span>
      <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name={pageParamName} value="1" />
        {Object.entries(extraHidden ?? {}).map(([k, v]) =>
          v ? <input key={k} type="hidden" name={k} value={v} /> : null,
        )}
        <label className="flex items-center gap-1.5">
          <span className="whitespace-nowrap">Other</span>
          <input
            name={limitParamName}
            type="number"
            min={MIN_LIST_PAGE_SIZE}
            max={inputMax}
            step={1}
            defaultValue={Math.min(currentLimit, inputMax)}
            className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Apply
        </button>
      </form>
      <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{totalItems} total</span>
    </div>
  );
}
