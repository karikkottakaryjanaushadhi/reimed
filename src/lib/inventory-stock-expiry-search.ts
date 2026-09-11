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

/** Product ids whose compact name matches — uses Product_name_compact_trgm_idx. */
export function inventoryProductNameMatchIdsSql(s: InventorySearch): Prisma.Sql {
  return Prisma.sql`
    SELECT p2."id"
    FROM "Product" p2
    WHERE replace(lower(p2."name"), ' ', '') LIKE ${s.likePat}
  `;
}

/** AND ( … ) for JOIN queries that alias lot as `il`. Matches product name only. */
export function inventoryLotSearchAndClause(s: InventorySearch): Prisma.Sql {
  return Prisma.sql`AND il."productId" IN (${inventoryProductNameMatchIdsSql(s)})`;
}

/** Batches page: product name (GIN on Product) or batch number (GIN on InventoryLot). */
export function inventoryLotSearchIncludingBatchAndClause(s: InventorySearch): Prisma.Sql {
  return Prisma.sql`AND (
    il."productId" IN (${inventoryProductNameMatchIdsSql(s)})
    OR replace(lower(il."batchNo"), ' ', '') LIKE ${s.likePat}
  )`;
}
