/**
 * Fold duplicate catalog products that share a name into one product.
 *
 * Keeper: most sale lines, then purchase lines, then on-hand quantity,
 * then oldest createdAt, then id.
 *
 * Default is a dry-run. Pass --apply to write.
 *
 *   npx tsx --env-file=.env scripts/merge-duplicate-products.ts
 *   npx tsx --env-file=.env scripts/merge-duplicate-products.ts --apply
 */

import { PrismaClient } from "@prisma/client";

import { normalizeProductName } from "@/lib/product-name";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  createdAt: Date;
  sales: number;
  purchases: number;
  qty: number;
  lots: number;
};

type LotRow = {
  id: string;
  productId: string;
  storeId: string;
  batchNo: string;
  expiryDate: Date;
  quantity: number;
};

function lotKey(lot: Pick<LotRow, "storeId" | "batchNo" | "expiryDate">): string {
  return `${lot.storeId}\0${lot.batchNo}\0${lot.expiryDate.toISOString()}`;
}

function compareKeeper(a: ProductRow, b: ProductRow): number {
  if (b.sales !== a.sales) return b.sales - a.sales;
  if (b.purchases !== a.purchases) return b.purchases - a.purchases;
  if (b.qty !== a.qty) return b.qty - a.qty;
  const created = a.createdAt.getTime() - b.createdAt.getTime();
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

async function loadProducts(): Promise<ProductRow[]> {
  return prisma.$queryRaw<ProductRow[]>`
    SELECT p."id" AS "id",
           p."sku" AS "sku",
           p."name" AS "name",
           p."createdAt" AS "createdAt",
           (SELECT count(*)::int FROM "SaleLine" s WHERE s."productId" = p."id") AS "sales",
           (SELECT count(*)::int FROM "PurchaseLine" pl WHERE pl."productId" = p."id") AS "purchases",
           (SELECT coalesce(sum(l."quantity"), 0)::int FROM "InventoryLot" l WHERE l."productId" = p."id") AS "qty",
           (SELECT count(*)::int FROM "InventoryLot" l WHERE l."productId" = p."id") AS "lots"
    FROM "Product" p
  `;
}

async function loadLots(productIds: string[]): Promise<LotRow[]> {
  if (productIds.length === 0) return [];
  return prisma.inventoryLot.findMany({
    where: { productId: { in: productIds } },
    select: {
      id: true,
      productId: true,
      storeId: true,
      batchNo: true,
      expiryDate: true,
      quantity: true,
    },
  });
}

function groupsOf(products: ProductRow[]): Map<string, ProductRow[]> {
  const groups = new Map<string, ProductRow[]>();
  for (const product of products) {
    const key = normalizeProductName(product.name);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(product);
    else groups.set(key, [product]);
  }
  for (const list of groups.values()) list.sort(compareKeeper);
  return groups;
}

async function mergeLoser(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  keeperId: string,
  loserId: string,
): Promise<{ movedLots: number; combinedLots: number }> {
  await tx.purchaseLine.updateMany({
    where: { productId: loserId },
    data: { productId: keeperId },
  });
  await tx.saleLine.updateMany({
    where: { productId: loserId },
    data: { productId: keeperId },
  });
  await tx.stockTransferLine.updateMany({
    where: { productId: loserId },
    data: { productId: keeperId },
  });

  const loserLots = await tx.inventoryLot.findMany({
    where: { productId: loserId },
    select: {
      id: true,
      storeId: true,
      batchNo: true,
      expiryDate: true,
      quantity: true,
    },
  });

  let movedLots = 0;
  let combinedLots = 0;
  for (const lot of loserLots) {
    const existing = await tx.inventoryLot.findFirst({
      where: {
        productId: keeperId,
        storeId: lot.storeId,
        batchNo: lot.batchNo,
        expiryDate: lot.expiryDate,
      },
      select: { id: true },
    });
    if (existing) {
      await tx.inventoryLot.update({
        where: { id: existing.id },
        data: { quantity: { increment: lot.quantity } },
      });
      await tx.saleLine.updateMany({
        where: { lotId: lot.id },
        data: { lotId: existing.id, productId: keeperId },
      });
      await tx.stockTransferLine.updateMany({
        where: { sourceLotId: lot.id },
        data: { sourceLotId: existing.id, productId: keeperId },
      });
      await tx.inventoryLot.delete({ where: { id: lot.id } });
      combinedLots += 1;
    } else {
      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: { productId: keeperId },
      });
      movedLots += 1;
    }
  }

  const [salesLeft, purchasesLeft, transfersLeft, lotsLeft] = await Promise.all([
    tx.saleLine.count({ where: { productId: loserId } }),
    tx.purchaseLine.count({ where: { productId: loserId } }),
    tx.stockTransferLine.count({ where: { productId: loserId } }),
    tx.inventoryLot.count({ where: { productId: loserId } }),
  ]);
  if (salesLeft || purchasesLeft || transfersLeft || lotsLeft) {
    throw new Error(
      `Product ${loserId} still referenced (sales ${salesLeft}, purchases ${purchasesLeft}, transfers ${transfersLeft}, lots ${lotsLeft})`,
    );
  }

  await tx.product.delete({ where: { id: loserId } });
  return { movedLots, combinedLots };
}

async function main() {
  const products = await loadProducts();
  const groups = [...groupsOf(products).entries()].filter(([, rows]) => rows.length > 1);
  groups.sort((a, b) => a[0].localeCompare(b[0]));

  const duplicateIds = groups.flatMap(([, rows]) => rows.map((row) => row.id));
  const lots = await loadLots(duplicateIds);
  const lotsByProduct = new Map<string, LotRow[]>();
  for (const lot of lots) {
    const list = lotsByProduct.get(lot.productId);
    if (list) list.push(lot);
    else lotsByProduct.set(lot.productId, [lot]);
  }

  let loserCount = 0;
  let combineCount = 0;

  console.log(apply ? "Applying duplicate product merges" : "Dry-run (pass --apply to write)");
  console.log(`${groups.length} name groups`);

  for (const [name, rows] of groups) {
    const [keeper, ...losers] = rows;
    if (!keeper) continue;
    const keeperLots = new Map<string, LotRow>();
    for (const lot of lotsByProduct.get(keeper.id) ?? []) keeperLots.set(lotKey(lot), lot);

    console.log(
      `\nKEEP ${keeper.sku}  ${name}  sales=${keeper.sales} purchases=${keeper.purchases} qty=${keeper.qty} lots=${keeper.lots}`,
    );

    for (const loser of losers) {
      let combined = 0;
      for (const lot of lotsByProduct.get(loser.id) ?? []) {
        const key = lotKey(lot);
        if (keeperLots.has(key)) combined += 1;
        else keeperLots.set(key, { ...lot, productId: keeper.id });
      }
      loserCount += 1;
      combineCount += combined;
      console.log(
        `  DROP ${loser.sku}  sales=${loser.sales} purchases=${loser.purchases} qty=${loser.qty} lots=${loser.lots} combine=${combined}`,
      );
    }

    if (!apply) continue;

    await prisma.$transaction(
      async (tx) => {
        for (const loser of losers) {
          await mergeLoser(tx, keeper.id, loser.id);
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );
  }

  console.log(
    `\n${apply ? "Merged" : "Would merge"} ${loserCount} extra products across ${groups.length} names (${combineCount} lots combined into an existing batch).`,
  );

  if (apply) {
    const remaining = await prisma.$queryRaw<Array<{ groups: number }>>`
      SELECT count(*)::int AS "groups"
      FROM (
        SELECT regexp_replace(btrim(upper("name")), '\\s+', ' ', 'g') AS name_key
        FROM "Product"
        GROUP BY 1
        HAVING count(*) > 1
      ) t
    `;
    console.log(`Duplicate name groups remaining: ${remaining[0]?.groups ?? 0}`);
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
