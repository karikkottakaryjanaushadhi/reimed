import { Prisma } from "@prisma/client";
import { compactSearchKey } from "@/lib/search-normalize";

/** Parsed non-empty inventory search — product name only (spacing ignored, case-insensitive). */
export type InventorySearch = { likePat: string };

export function parseInventorySearch(q: string): InventorySearch | null {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const needle = compactSearchKey(trimmed).replace(/%/g, "").replace(/_/g, "");
  if (!needle) return null;
  return { likePat: `%${needle}%` };
}

/** AND ( … ) for JOIN queries that alias lot as `il`, product as `p`. Matches product name only. */
export function inventoryLotSearchAndClause(s: InventorySearch): Prisma.Sql {
  return Prisma.sql`AND replace(lower(p."name"), ' ', '') LIKE ${s.likePat}`;
}

/** Batches page: product name or batch number. */
export function inventoryLotSearchIncludingBatchAndClause(s: InventorySearch): Prisma.Sql {
  return Prisma.sql`AND (
    replace(lower(p."name"), ' ', '') LIKE ${s.likePat}
    OR replace(lower(il."batchNo"), ' ', '') LIKE ${s.likePat}
  )`;
}
