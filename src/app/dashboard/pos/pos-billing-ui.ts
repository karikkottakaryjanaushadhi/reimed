/** Shared POS billing field / table chrome (new bill screen). */
export const POS_FIELD_INPUT_CLASS =
  "rounded border border-zinc-300 px-2 py-2 text-base tabular-nums touch-manipulation md:px-1 md:py-1 md:text-sm dark:border-zinc-600 dark:bg-zinc-950";

/** POS table shell (desktop only — mobile uses card layout). */
export const POS_TABLE_SCROLL_WRAP_CLASS =
  "w-full min-w-0 overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

export const POS_TABLE_CLASS =
  "w-full table-fixed border-collapse text-left text-sm";

/** Narrow serial-number column (max 3 digits). */
export const LINE_TABLE_SLNO_COL = "w-[1.75rem] min-w-[1.75rem] max-w-[1.75rem]";

export const POS_CUSTOMER_GRID_CLASS =
  "grid grid-cols-1 gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-900";

export const POS_CUSTOMER_FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 text-base dark:border-zinc-600 dark:bg-zinc-950 md:py-1.5 md:text-sm";

export const POS_PRIMARY_CTA_CLASS =
  "touch-manipulation w-full rounded-xl bg-gradient-to-r from-brand-blue to-brand-green py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";
