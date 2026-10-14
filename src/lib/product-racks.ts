import type { PrismaClient } from "@prisma/client";

/** Shared shelf codes (e.g. A1, Z10). A product's shelf is stored per shop. */
export const RACK_CODE_PATTERN = /^[A-Z]{1,2}[0-9]{1,3}$/;

export const INVALID_RACK_CODE_ERROR = "Rack must be a letter plus number (e.g. A1, A2, Z10)";
export const DUPLICATE_RACK_CODE_ERROR = "A rack with this code already exists";

export function normalizeRackCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isRackCode(v: string): boolean {
  return RACK_CODE_PATTERN.test(v);
}

export function parseRackCode(raw: string): { letter: string; number: number } | null {
  const code = normalizeRackCode(raw);
  const m = code.match(/^([A-Z]{1,2})([0-9]{1,3})$/);
  if (!m) return null;
  return { letter: m[1]!, number: Number(m[2]) };
}

export function compareRackCodes(a: string, b: string): number {
  const pa = parseRackCode(a);
  const pb = parseRackCode(b);
  if (pa && pb) {
    const c = pa.letter.localeCompare(pb.letter);
    if (c !== 0) return c;
    return pa.number - pb.number;
  }
  return a.localeCompare(b);
}

export function sortRacksByCode<T extends { code: string }>(racks: T[]): T[] {
  return [...racks].sort((a, b) => compareRackCodes(a.code, b.code));
}

export async function findExistingRackId(
  db: Pick<PrismaClient, "rack">,
  id: string,
): Promise<string | null> {
  const rack = await db.rack.findUnique({ where: { id }, select: { id: true } });
  return rack?.id ?? null;
}

type StoreRackDb = {
  productStoreRack: PrismaClient["productStoreRack"];
};

/** Sets or clears the shelf for one product in one shop. */
export async function setProductStoreRack(
  db: StoreRackDb,
  storeId: string,
  productId: string,
  rackId: string | null,
): Promise<void> {
  if (!rackId) {
    await db.productStoreRack.deleteMany({ where: { storeId, productId } });
    return;
  }
  await db.productStoreRack.upsert({
    where: { storeId_productId: { storeId, productId } },
    create: { storeId, productId, rackId },
    update: { rackId },
  });
}
