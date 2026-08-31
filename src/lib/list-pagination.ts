/** Shared defaults for dashboard list pagination (inventory, products, sales, …). */

export const DEFAULT_LIST_PAGE_SIZE = 20;
export const MIN_LIST_PAGE_SIZE = 10;
/** Hard ceiling for rows per page (URL tampering; DOM/render cost). */
export const MAX_LIST_PAGE_SIZE_HARD = 10_000;
export const QUICK_PAGE_SIZES = [10, 20, 50, 100] as const;

export function clampListPageSize(n: number): number {
  return Math.min(MAX_LIST_PAGE_SIZE_HARD, Math.max(MIN_LIST_PAGE_SIZE, Math.round(n)));
}

/** Max value for the manual “Other” rows-per-page input (capped at list total). */
export function listPageSizeInputMax(totalItems: number): number {
  if (totalItems <= 0) return MIN_LIST_PAGE_SIZE;
  return Math.min(MAX_LIST_PAGE_SIZE_HARD, Math.max(totalItems, MIN_LIST_PAGE_SIZE));
}

/** Applies URL/request limit with global hard cap and list total cap. */
export function effectiveListPageSize(requested: number, totalItems: number): number {
  const clamped = clampListPageSize(requested);
  if (totalItems <= 0) return clamped;
  return Math.min(clamped, listPageSizeInputMax(totalItems));
}

/** Parses a positive integer limit from URL params (e.g. `limit`, `blimit`, `slimit`). */
export function parseListLimitParam(raw: unknown): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_LIST_PAGE_SIZE;
  return clampListPageSize(n);
}

/** URL for simple lists using `page` + `limit` query params (products, sales, …). */
export function buildSimpleListUrl(
  basePath: string,
  page: number,
  limit: number,
  extra?: Record<string, string>,
): string {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v) pairs.push([k, v]);
  }
  if (page > 1) pairs.push(["page", String(page)]);
  if (limit !== DEFAULT_LIST_PAGE_SIZE) pairs.push(["limit", String(limit)]);
  const p = new URLSearchParams();
  for (const [k, v] of pairs) {
    p.set(k, v);
  }
  const s = p.toString();
  return s ? `${basePath}?${s}` : basePath;
}
