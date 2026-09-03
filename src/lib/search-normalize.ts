/**
 * Normalize text for loose product search (ignore spaces, case).
 * Example: "A NETA Z SOFTGEL" and "ANETAZSOFTGEL" both become "anetazsoftgel".
 */
export function compactSearchKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** Substring match after compacting both sides (handles "ane" → "…ane…"). */
export function nameMatchesLooseQuery(name: string, query: string): boolean {
  const t = compactSearchKey(query);
  if (!t) return true;
  return compactSearchKey(name).includes(t);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Lower score = better match. Prefers exact/prefix/word-start hits over substring matches
 * buried later in the name (e.g. "mask" → "MASK N95" before "CHARCOAL PEEL OFF MASK").
 */
export function productSearchRelevanceScore(name: string, query: string): number {
  const q = query.trim();
  if (!q) return 0;

  const qLower = q.toLowerCase();
  const nameLower = name.toLowerCase();
  const qCompact = compactSearchKey(q);
  const nameCompact = compactSearchKey(name);

  if (nameLower === qLower) return 0;
  if (nameCompact === qCompact) return 1;
  if (nameLower.startsWith(qLower)) return 2;
  if (nameCompact.startsWith(qCompact)) return 3;

  const wordStartRe = new RegExp(`(^|\\s)${escapeRegExp(qLower)}($|\\s)`, "i");
  const wordMatch = wordStartRe.exec(name);
  if (wordMatch) return 10 + (wordMatch.index ?? 0);

  const idx = nameCompact.indexOf(qCompact);
  if (idx >= 0) return 100 + idx;

  return Number.MAX_SAFE_INTEGER;
}

export function compareProductSearchRelevance(aName: string, bName: string, query: string): number {
  const diff = productSearchRelevanceScore(aName, query) - productSearchRelevanceScore(bName, query);
  if (diff !== 0) return diff;
  const lenDiff = aName.length - bName.length;
  if (lenDiff !== 0) return lenDiff;
  return aName.localeCompare(bName);
}

/** Best (lowest) score among product name, generic, or other searchable fields. */
export function productSearchFieldsRelevanceScore(
  query: string,
  ...fields: Array<string | null | undefined>
): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const field of fields) {
    if (!field) continue;
    const score = productSearchRelevanceScore(field, query);
    if (score < best) best = score;
  }
  return best;
}

export function sortByProductSearchRelevance<T>(
  items: readonly T[],
  query: string,
  getName: (item: T) => string,
): T[] {
  const q = query.trim();
  if (!q) return [...items];
  return [...items].sort((a, b) => compareProductSearchRelevance(getName(a), getName(b), q));
}
