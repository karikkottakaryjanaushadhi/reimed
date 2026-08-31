/** Match POS billing: ~5 visible rows, scroll inside list; cap by viewport height. */
export const FLOATING_DROPDOWN_MAX_VISIBLE_ROWS = 5;
export const FLOATING_DROPDOWN_ROW_REM = 2.35;

/** Open list panel (portal listbox) — same as POS / purchase billing dropdowns. */
export const BILLING_DROPDOWN_LIST_CLASS =
  "overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-xl outline-none dark:border-zinc-700 dark:bg-zinc-900";

export const BILLING_DROPDOWN_OPTION_SELECTED_CLASS =
  "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-50";

export const BILLING_DROPDOWN_OPTION_IDLE_CLASS = "hover:bg-zinc-50 dark:hover:bg-zinc-800";

export function floatingDropdownMaxHeight(): string {
  return `min(${FLOATING_DROPDOWN_MAX_VISIBLE_ROWS * FLOATING_DROPDOWN_ROW_REM}rem, 42vh)`;
}

export function anchorRectBelow(anchor: HTMLElement, gapPx = 4): { top: number; left: number; width: number } {
  const r = anchor.getBoundingClientRect();
  return { top: r.bottom + gapPx, left: r.left, width: r.width };
}
