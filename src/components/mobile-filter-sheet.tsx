"use client";

import { useEffect, useId, useState } from "react";

export function MobileFilterSheet({
  title,
  description,
  activeCount = 0,
  children,
}: {
  title: string;
  description?: string;
  activeCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const badge = activeCount > 0 ? activeCount : null;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <section className="hidden rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 md:block dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h2>
        {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
        {children}
      </section>

      <div className="md:hidden">
        <button
          type="button"
          className="flex w-full touch-manipulation items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3.5 text-left dark:border-zinc-800 dark:bg-zinc-900/40"
          aria-expanded={open}
          aria-controls={sheetId}
          onClick={() => setOpen(true)}
        >
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</span>
          <span className="flex items-center gap-2 text-sm text-zinc-500">
            {badge !== null ? (
              <span className="rounded-full bg-brand-blue/25 px-2 py-0.5 text-xs font-medium text-brand-blue-light">
                {badge} active
              </span>
            ) : (
              <span className="text-xs">Tap to edit</span>
            )}
            <span aria-hidden className="text-zinc-400">
              ▾
            </span>
          </span>
        </button>

        {open ? (
          <MobileFilterSheetPanel id={sheetId} title={title} description={description} onClose={() => setOpen(false)}>
            {children}
          </MobileFilterSheetPanel>
        ) : null}
      </div>
    </>
  );
}

function MobileFilterSheetPanel({
  id,
  title,
  description,
  onClose,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close filters"
        onClick={onClose}
      />
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="relative z-10 max-h-[min(88vh,640px)] overflow-y-auto rounded-t-2xl border border-zinc-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </h2>
            {description ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
          </div>
          <button
            type="button"
            className="touch-manipulation rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}