/** Browser-local draft persistence (survives tab close / refresh on same device). */

export function formDraftStorageKey(scope: string, storeId?: string): string {
  const base = `reimed:v1:draft:${scope}`;
  return storeId ? `${base}:${storeId}` : base;
}

export function readFormDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeFormDraft(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private mode — ignore.
  }
}

export function clearFormDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
