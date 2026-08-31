"use client";

/**
 * Toggle for “still editing” vs “ready to finalize” — same semantics on new purchase and edit detail.
 */
export function PurchaseEditingInProgressSwitch({
  checked,
  onCheckedChange,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/90 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-800/50 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Editing in progress</span>
      <span className="relative inline-flex h-5 w-9 shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          aria-checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 rounded-full bg-zinc-300 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-blue peer-checked:bg-gradient-to-r peer-checked:from-brand-blue peer-checked:to-brand-green dark:bg-zinc-600"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-0.5 top-0.5 z-10 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ease-out peer-checked:translate-x-4 dark:bg-zinc-100"
        />
      </span>
    </label>
  );
}
