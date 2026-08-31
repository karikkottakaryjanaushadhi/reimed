/**
 * Normalize free-text persisted in the DB: NFKC, trim, uppercase (pharmacy / retail convention).
 * Do not use for login emails or other case-sensitive identifiers — use {@link normalizeStoreEmail}.
 */
export function storeUpper(text: string): string {
  return text.normalize("NFKC").trim().toUpperCase();
}

export function storeUpperOpt(text: string | null | undefined): string | undefined {
  if (text == null) return undefined;
  const t = text.normalize("NFKC").trim();
  return t === "" ? undefined : t.toUpperCase();
}

/** Empty after trim → null (nullable Prisma string fields). */
export function storeUpperNull(text: string | null | undefined): string | null {
  if (text == null) return null;
  const t = text.normalize("NFKC").trim();
  return t === "" ? null : t.toUpperCase();
}

export function normalizeStoreEmail(text: string | null | undefined): string | undefined {
  if (text == null) return undefined;
  const t = text.normalize("NFKC").trim().toLowerCase();
  return t === "" ? undefined : t;
}

/** Bill terms / footer copy: preserve newlines and casing; empty → null. */
export function storeBillTermsNull(text: string | null | undefined): string | null {
  if (text == null) return null;
  const t = text.normalize("NFKC").trim();
  return t === "" ? null : t;
}
