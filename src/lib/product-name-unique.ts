import { Prisma, type PrismaClient } from "@prisma/client";
import { DUPLICATE_PRODUCT_NAME_ERROR, normalizeProductName } from "@/lib/product-name";

type ProductNameDb = Pick<PrismaClient, "$queryRaw">;

export class DuplicateProductNameError extends Error {
  constructor() {
    super(DUPLICATE_PRODUCT_NAME_ERROR);
    this.name = "DuplicateProductNameError";
  }
}

/** Exact name match after trim, collapsed spaces, and uppercase. */
export async function findProductIdByName(
  db: ProductNameDb,
  name: string,
  excludeId?: string,
): Promise<string | null> {
  const normalized = normalizeProductName(name);
  if (!normalized) return null;
  const rows = await db.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "Product"
      WHERE regexp_replace(btrim(upper("name")), '\\s+', ' ', 'g') = ${normalized}
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
      LIMIT 1
    `,
  );
  return rows[0]?.id ?? null;
}

export async function assertProductNameAvailable(
  db: ProductNameDb,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existingId = await findProductIdByName(db, name, excludeId);
  if (existingId) throw new DuplicateProductNameError();
}
