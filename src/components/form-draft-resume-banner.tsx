"use client";

import { APP_LOCALE, APP_TIMEZONE } from "@/lib/app-timezone";

function formatSavedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString(APP_LOCALE, {
      timeZone: APP_TIMEZONE,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "";
  }
}

export function FormDraftResumeBanner({
  title,
  savedAt,
  onRestore,
  onDiscard,
}: {
  title: string;
  savedAt?: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const when = savedAt ? formatSavedAt(savedAt) : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2.5 text-sm dark:border-amber-800/60 dark:bg-amber-950/35"
      role="status"
    >
      <p className="min-w-0 flex-1 text-amber-950 dark:text-amber-100">
        <span className="font-medium">{title}</span>
        {when ? (
          <span className="mt-0.5 block text-xs font-normal text-amber-800/90 dark:text-amber-200/80">
            Last saved {when}
          </span>
        ) : null}
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          className="touch-manipulation rounded-lg bg-gradient-to-r from-brand-blue to-brand-green px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:brightness-110"
          onClick={onRestore}
        >
          Resume
        </button>
        <button
          type="button"
          className="touch-manipulation rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100/80 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/40"
          onClick={onDiscard}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
