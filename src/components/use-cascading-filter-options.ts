"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useCascadingFilterOptions<T>(initial: T, fetchUrl: string, readParams: () => Record<string, string>) {
  const [options, setOptions] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, T>());
  const lastParamsKeyRef = useRef<string>("");

  const refresh = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(readParams())) {
        if (value) params.set(key, value);
      }
      const paramsKey = params.toString();
      if (paramsKey === lastParamsKeyRef.current) return;
      lastParamsKeyRef.current = paramsKey;

      const cached = cacheRef.current.get(paramsKey);
      if (cached) {
        setOptions(cached);
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(`${fetchUrl}?${paramsKey}`, { signal: ac.signal });
        if (!res.ok) return;
        const next = (await res.json()) as T;
        cacheRef.current.set(paramsKey, next);
        setOptions(next);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }, 300);
  }, [fetchUrl, readParams]);

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return { options, refresh };
}

export function readFormParams(form: HTMLFormElement | null, names: string[]): Record<string, string> {
  if (!form) return {};
  const fd = new FormData(form);
  const out: Record<string, string> = {};
  for (const name of names) {
    const raw = fd.get(name);
    if (typeof raw === "string" && raw.trim()) out[name] = raw.trim();
  }
  return out;
}

export function readFormParamsWithCheckbox(
  form: HTMLFormElement | null,
  fields: Array<{ name: string; type: "field" | "checkbox" }>,
): Record<string, string> {
  if (!form) return {};
  const fd = new FormData(form);
  const out: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === "checkbox") {
      if (fd.get(field.name) === "1") out[field.name] = "1";
      continue;
    }
    const raw = fd.get(field.name);
    if (typeof raw === "string" && raw.trim()) out[field.name] = raw.trim();
  }
  return out;
}
