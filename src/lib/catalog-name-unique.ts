import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeProductName } from "@/lib/product-name";

type NameDb = Pick<PrismaClient, "$queryRaw"> & {
  brand: PrismaClient["brand"];
};

export const DUPLICATE_BRAND_NAME_ERROR = "A brand with this name already exists";
export const DUPLICATE_SUPPLIER_NAME_ERROR = "A supplier with this name already exists";

async function findIdByNormalizedName(
  db: Pick<PrismaClient, "$queryRaw">,
  table: "Brand" | "Supplier",
  name: string,
  excludeId?: string,
): Promise<string | null> {
  const normalized = normalizeProductName(name);
  if (!normalized) return null;
  const tableSql = table === "Brand" ? Prisma.sql`"Brand"` : Prisma.sql`"Supplier"`;
  const rows = await db.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM ${tableSql}
      WHERE regexp_replace(btrim(upper("name")), '\\s+', ' ', 'g') = ${normalized}
      ${excludeId ? Prisma.sql`AND "id" <> ${excludeId}` : Prisma.empty}
      LIMIT 1
    `,
  );
  return rows[0]?.id ?? null;
}

export function findBrandIdByName(db: Pick<PrismaClient, "$queryRaw">, name: string, excludeId?: string) {
  return findIdByNormalizedName(db, "Brand", name, excludeId);
}

export function findSupplierIdByName(db: Pick<PrismaClient, "$queryRaw">, name: string, excludeId?: string) {
  return findIdByNormalizedName(db, "Supplier", name, excludeId);
}

/** Reuse a brand with the same name, or create one. */
export async function resolveBrandId(db: NameDb, rawName: string): Promise<string> {
  const name = normalizeProductName(rawName);
  const existing = await findBrandIdByName(db, name);
  if (existing) return existing;
  try {
    const created = await db.brand.create({ data: { name }, select: { id: true } });
    return created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await findBrandIdByName(db, name);
      if (again) return again;
    }
    throw e;
  }
}
