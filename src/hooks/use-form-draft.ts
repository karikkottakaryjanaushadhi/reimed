"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearFormDraft, readFormDraft, writeFormDraft } from "@/lib/form-draft-storage";

type UseFormDraftOptions<T> = {
  storageKey: string;
  value: T;
  isEmpty: (value: T) => boolean;
  debounceMs?: number;
  /** When false (e.g. edit mode), skip read/write. */
  enabled?: boolean;
};

export function useFormDraft<T>({
  storageKey,
  value,
  isEmpty,
  debounceMs = 1500,
  enabled = true,
}: UseFormDraftOptions<T>) {
  const [pendingRestore, setPendingRestore] = useState<T | null>(null);
  const [persistEnabled, setPersistEnabled] = useState(false);
  const hydratedRef = useRef(false);
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  useEffect(() => {
    if (!enabled || hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = readFormDraft<T>(storageKey);
    if (stored && !isEmptyRef.current(stored)) {
      setPendingRestore(stored);
      setPersistEnabled(false);
    } else {
      setPersistEnabled(true);
    }
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled || !persistEnabled) return;
    if (isEmptyRef.current(value)) {
      clearFormDraft(storageKey);
      return;
    }
    const timer = window.setTimeout(() => {
      writeFormDraft(storageKey, value);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [value, enabled, persistEnabled, storageKey, debounceMs]);

  useEffect(() => {
    if (!enabled || !persistEnabled || isEmptyRef.current(value)) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [value, enabled, persistEnabled]);

  const restoreDraft = useCallback((): T | null => {
    if (!pendingRestore) return null;
    const data = pendingRestore;
    setPendingRestore(null);
    setPersistEnabled(true);
    return data;
  }, [pendingRestore]);

  const discardDraft = useCallback(() => {
    clearFormDraft(storageKey);
    setPendingRestore(null);
    setPersistEnabled(true);
  }, [storageKey]);

  const clearSavedDraft = useCallback(() => {
    clearFormDraft(storageKey);
  }, [storageKey]);

  return {
    pendingRestore,
    hasPendingRestore: pendingRestore != null,
    restoreDraft,
    discardDraft,
    clearSavedDraft,
  };
}
