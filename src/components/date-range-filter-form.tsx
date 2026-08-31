import Link from "next/link";

import { DateRangePickerFields } from "@/components/date-range-picker-fields";

/** GET form: preserves optional hidden fields (e.g. limit) and navigates with date params. */
export function DateRangeFilterForm({
  actionPath,
  from,
  to,
  hiddenFields,
  clearHref,
  submitLabel = "Apply",
}: {
  actionPath: string;
  from: string;
  to: string;
  hiddenFields?: Record<string, string | undefined>;
  /** Same list URL without date filters (may keep limit / page reset). */
  clearHref: string;
  submitLabel?: string;
}) {
  return (
    <form method="get" action={actionPath} className="flex flex-wrap items-end gap-2">
      {Object.entries(hiddenFields ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <DateRangePickerFields from={from} to={to} />
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {submitLabel}
      </button>
      <Link
        href={clearHref}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Clear dates
      </Link>
    </form>
  );
}
