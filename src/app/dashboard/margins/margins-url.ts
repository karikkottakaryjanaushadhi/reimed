import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-pagination";

export function buildMarginsUrl(
  page: number,
  limit: number,
  extra: Record<string, string>,
): string {
  const pairs: Array<[string, string]> = Object.entries(extra).filter(([, v]) => v);
  if (page > 1) pairs.push(["page", String(page)]);
  if (limit !== DEFAULT_LIST_PAGE_SIZE) pairs.push(["limit", String(limit)]);
  const params = new URLSearchParams();
  for (const [k, v] of pairs) params.set(k, v);
  const query = params.toString();
  return query ? `/dashboard/margins?${query}` : "/dashboard/margins";
}
