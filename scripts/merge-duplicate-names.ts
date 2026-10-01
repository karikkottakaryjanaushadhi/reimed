/**
 * Fold brands and suppliers that share a name into one record.
 *
 * Name key: trim, collapse spaces, uppercase.
 * Brand keeper: most products, then oldest createdAt, then id.
 * Supplier keeper: most purchases, then lots, then oldest createdAt, then id.
 * Empty supplier contact fields are filled from the folded records. Existing keeper values stay.
 *
 * Default is a dry-run. Pass --apply to write.
 *
 *   npx tsx --env-file=.env scripts/merge-duplicate-names.ts
 *   npx tsx --env-file=.env scripts/merge-duplicate-names.ts --apply
 */

import { PrismaClient } from "@prisma/client";

import { normalizeProductName } from "@/lib/product-name";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type BrandRow = {
  id: string;
  name: string;
  createdAt: Date;
  products: number;
};

type SupplierRow = {
  id: string;
  name: string;
  createdAt: Date;
  purchases: number;
  lots: number;
  phone: string | null;
  phoneAlt: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  company: string | null;
  contactPerson: string | null;
  drugLicense1: string | null;
  drugLicense2: string | null;
  legacySupplierCode: number | null;
};

function byCreatedThenId(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number {
  const created = a.createdAt.getTime() - b.createdAt.getTime();
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareBrand(a: BrandRow, b: BrandRow): number {
  if (b.products !== a.products) return b.products - a.products;
  return byCreatedThenId(a, b);
}

function compareSupplier(a: SupplierRow, b: SupplierRow): number {
  if (b.purchases !== a.purchases) return b.purchases - a.purchases;
  if (b.lots !== a.lots) return b.lots - a.lots;
  return byCreatedThenId(a, b);
}

function groupByName<T extends { name: string }>(rows: T[], compare: (a: T, b: T) => number): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = normalizeProductName(row.name);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const out = [...groups.entries()].filter(([, list]) => list.length > 1);
  for (const [, list] of out) list.sort(compare);
  out.sort((a, b) => a[0].localeCompare(b[0]));
  return out;
}

async function loadBrands(): Promise<BrandRow[]> {
  return prisma.$queryRaw<BrandRow[]>`
    SELECT b."id" AS "id",
           b."name" AS "name",
           b."createdAt" AS "createdAt",
           (SELECT count(*)::int FROM "Product" p WHERE p."brandId" = b."id") AS "products"
    FROM "Brand" b
  `;
}

async function loadSuppliers(): Promise<SupplierRow[]> {
  return prisma.$queryRaw<SupplierRow[]>`
    SELECT s."id" AS "id",
           s."name" AS "name",
           s."createdAt" AS "createdAt",
           s."phone" AS "phone",
           s."phoneAlt" AS "phoneAlt",
           s."email" AS "email",
           s."address" AS "address",
           s."gstin" AS "gstin",
           s."company" AS "company",
           s."contactPerson" AS "contactPerson",
           s."drugLicense1" AS "drugLicense1",
           s."drugLicense2" AS "drugLicense2",
           s."legacySupplierCode" AS "legacySupplierCode",
           (SELECT count(*)::int FROM "Purchase" p WHERE p."supplierId" = s."id") AS "purchases",
           (SELECT count(*)::int FROM "InventoryLot" l WHERE l."supplierId" = s."id") AS "lots"
    FROM "Supplier" s
  `;
}

const supplierTextFields = [
  "phone",
  "phoneAlt",
  "email",
  "address",
  "gstin",
  "company",
  "contactPerson",
  "drugLicense1",
  "drugLicense2",
] as const;

async function mergeBrands(groups: Array<[string, BrandRow[]]>) {
  let dropped = 0;
  console.log(`\nBrands: ${groups.length} name groups`);
  for (const [name, rows] of groups) {
    const [keeper, ...losers] = rows;
    if (!keeper) continue;
    console.log(`KEEP brand ${keeper.id}  ${name}  products=${keeper.products}`);
    for (const loser of losers) {
      dropped += 1;
      console.log(`  DROP brand ${loser.id}  products=${loser.products}`);
    }
    if (!apply) continue;
    await prisma.$transaction(async (tx) => {
      for (const loser of losers) {
        await tx.product.updateMany({
          where: { brandId: loser.id },
          data: { brandId: keeper.id },
        });
        await tx.brand.delete({ where: { id: loser.id } });
      }
      if (keeper.name !== name) {
        await tx.brand.update({ where: { id: keeper.id }, data: { name } });
      }
    });
  }
  console.log(`${apply ? "Merged" : "Would merge"} ${dropped} extra brands.`);
}

async function mergeSuppliers(groups: Array<[string, SupplierRow[]]>) {
  let dropped = 0;
  console.log(`\nSuppliers: ${groups.length} name groups`);
  for (const [name, rows] of groups) {
    const [keeper, ...losers] = rows;
    if (!keeper) continue;
    console.log(
      `KEEP supplier ${keeper.id}  ${name}  purchases=${keeper.purchases} lots=${keeper.lots}`,
    );
    for (const loser of losers) {
      dropped += 1;
      console.log(`  DROP supplier ${loser.id}  purchases=${loser.purchases} lots=${loser.lots}`);
    }
    if (!apply) continue;
    await prisma.$transaction(async (tx) => {
      const filled: Partial<Record<(typeof supplierTextFields)[number], string>> = {};
      for (const field of supplierTextFields) {
        if (keeper[field]?.trim()) continue;
        const value = losers.map((loser) => loser[field]?.trim()).find(Boolean);
        if (value) filled[field] = value;
      }
      let legacyCode = keeper.legacySupplierCode;
      if (legacyCode == null) {
        const donor = losers.find((loser) => loser.legacySupplierCode != null);
        if (donor?.legacySupplierCode != null) {
          legacyCode = donor.legacySupplierCode;
          await tx.supplier.update({
            where: { id: donor.id },
            data: { legacySupplierCode: null },
          });
        }
      }

      for (const loser of losers) {
        await tx.purchase.updateMany({
          where: { supplierId: loser.id },
          data: { supplierId: keeper.id },
        });
        await tx.inventoryLot.updateMany({
          where: { supplierId: loser.id },
          data: { supplierId: keeper.id },
        });
        await tx.supplier.delete({ where: { id: loser.id } });
      }

      await tx.supplier.update({
        where: { id: keeper.id },
        data: {
          name,
          ...filled,
          ...(legacyCode != null && keeper.legacySupplierCode == null
            ? { legacySupplierCode: legacyCode }
            : {}),
        },
      });
    });
  }
  console.log(`${apply ? "Merged" : "Would merge"} ${dropped} extra suppliers.`);
}

async function remaining(table: "Brand" | "Supplier"): Promise<number> {
  const tableSql = table === "Brand" ? `"Brand"` : `"Supplier"`;
  const rows = await prisma.$queryRawUnsafe<Array<{ groups: number }>>(
    `SELECT count(*)::int AS "groups" FROM (
       SELECT regexp_replace(btrim(upper("name")), '\\s+', ' ', 'g') AS name_key
       FROM ${tableSql}
       GROUP BY 1
       HAVING count(*) > 1
     ) t`,
  );
  return rows[0]?.groups ?? 0;
}

async function main() {
  console.log(apply ? "Applying brand and supplier merges" : "Dry-run (pass --apply to write)");
  const brands = groupByName(await loadBrands(), compareBrand);
  const suppliers = groupByName(await loadSuppliers(), compareSupplier);
  await mergeBrands(brands);
  await mergeSuppliers(suppliers);
  if (apply) {
    console.log(`Duplicate brand groups remaining: ${await remaining("Brand")}`);
    console.log(`Duplicate supplier groups remaining: ${await remaining("Supplier")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
