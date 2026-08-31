import { Prisma, type PrismaClient } from "@prisma/client";
import { normalizeInventoryLotExpiryDate } from "@/lib/inventory-lot-expiry";
import { storeUpper } from "@/lib/store-text";

type Db = Prisma.TransactionClient | PrismaClient;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export type InventoryLotKey = {
  storeId: string;
  productId: string;
  batchNo: string;
  expiryDate: string | Date;
};

function lotKeyFields(key: InventoryLotKey) {
  return {
    storeId: key.storeId,
    productId: key.productId,
    batchNo: storeUpper(key.batchNo),
    expiryDate: normalizeInventoryLotExpiryDate(key.expiryDate),
  };
}

/** Find lot by business key; tolerates legacy rows stored at non-noon UTC on the same calendar day. */
export async function findInventoryLotByKey(db: Db, key: InventoryLotKey) {
  const { storeId, productId, batchNo, expiryDate } = lotKeyFields(key);

  const exact = await db.inventoryLot.findUnique({
    where: {
      storeId_productId_batchNo_expiryDate: { storeId, productId, batchNo, expiryDate },
    },
  });
  if (exact) return exact;

  const ymd = expiryDate.toISOString().slice(0, 10);
  return db.inventoryLot.findFirst({
    where: {
      storeId,
      productId,
      batchNo,
      expiryDate: {
        gte: new Date(`${ymd}T00:00:00.000Z`),
        lte: new Date(`${ymd}T23:59:59.999Z`),
      },
    },
    orderBy: [{ quantity: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Resolve the inventory lot to adjust when undoing or editing a purchase line.
 * Falls back to the only (or best-matching) lot for the same product + batch when the
 * exact expiry key is missing — e.g. line expiry was corrected without a matching lot row.
 */
export async function findInventoryLotForPurchaseLineUndo(db: Db, key: InventoryLotKey) {
  const exact = await findInventoryLotByKey(db, key);
  if (exact) return exact;

  const { storeId, productId, batchNo, expiryDate } = lotKeyFields(key);
  const candidates = await db.inventoryLot.findMany({
    where: { storeId, productId, batchNo },
    orderBy: [{ quantity: "desc" }, { createdAt: "asc" }],
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const ymd = expiryDate.toISOString().slice(0, 10);
  const dayMatches = candidates.filter(
    (c) => c.expiryDate.toISOString().slice(0, 10) === ymd,
  );
  if (dayMatches.length === 1) return dayMatches[0];
  if (dayMatches.length > 0) return dayMatches[0];

  return candidates[0];
}

export type PurchaseLotPricing = {
  costPrice: Prisma.Decimal;
  mrp: Prisma.Decimal;
  saleRate: Prisma.Decimal;
  salesDiscountPct: Prisma.Decimal;
  salesDiscountRs: Prisma.Decimal;
};

/** Add stock from a purchase line; one lot per store + product + batch + expiry. */
export async function upsertInventoryLotStockFromPurchase(
  db: Db,
  args: InventoryLotKey & {
    supplierId: string | null;
    stockIn: number;
    pricing: PurchaseLotPricing;
  },
): Promise<void> {
  const { storeId, productId, batchNo, expiryDate } = lotKeyFields(args);
  const pricingAt = new Date();
  const updateData = {
    quantity: { increment: args.stockIn },
    costPrice: args.pricing.costPrice,
    mrp: args.pricing.mrp,
    supplierId: args.supplierId,
    saleRate: args.pricing.saleRate,
    salesDiscountPct: args.pricing.salesDiscountPct,
    salesDiscountRs: args.pricing.salesDiscountRs,
    pricingUpdatedAt: pricingAt,
  };

  const existing = await findInventoryLotByKey(db, args);
  if (existing) {
    if (existing.expiryDate.getTime() !== expiryDate.getTime()) {
      await db.inventoryLot.update({
        where: { id: existing.id },
        data: { expiryDate },
      });
    }
    await db.inventoryLot.update({
      where: { id: existing.id },
      data: updateData,
    });
    return;
  }

  try {
    await db.inventoryLot.create({
      data: {
        storeId,
        productId,
        batchNo,
        expiryDate,
        quantity: args.stockIn,
        supplierId: args.supplierId,
        costPrice: args.pricing.costPrice,
        mrp: args.pricing.mrp,
        saleRate: args.pricing.saleRate,
        salesDiscountPct: args.pricing.salesDiscountPct,
        salesDiscountRs: args.pricing.salesDiscountRs,
        pricingUpdatedAt: pricingAt,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    await db.inventoryLot.update({
      where: {
        storeId_productId_batchNo_expiryDate: { storeId, productId, batchNo, expiryDate },
      },
      data: updateData,
    });
  }
}

/** Replace lot qty and pricing (same batch key, e.g. purchase line edit). */
export async function updateInventoryLotFromPurchase(
  db: Db,
  lotId: string,
  args: {
    supplierId: string | null;
    quantity: number;
    pricing: PurchaseLotPricing;
  },
): Promise<void> {
  await db.inventoryLot.update({
    where: { id: lotId },
    data: {
      quantity: args.quantity,
      costPrice: args.pricing.costPrice,
      mrp: args.pricing.mrp,
      supplierId: args.supplierId,
      saleRate: args.pricing.saleRate,
      salesDiscountPct: args.pricing.salesDiscountPct,
      salesDiscountRs: args.pricing.salesDiscountRs,
      pricingUpdatedAt: new Date(),
    },
  });
}

export async function decrementInventoryLotStock(
  db: Db,
  key: InventoryLotKey,
  qty: number,
): Promise<{ lotId: string; previousQty: number } | null> {
  const lot = await findInventoryLotByKey(db, key);
  if (!lot) return null;
  if (lot.quantity < qty) throw new Error("insufficient_lot_stock");
  await db.inventoryLot.update({
    where: { id: lot.id },
    data: { quantity: { decrement: qty } },
  });
  return { lotId: lot.id, previousQty: lot.quantity };
}
