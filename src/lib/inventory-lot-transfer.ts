import { Prisma, type PrismaClient } from "@prisma/client";
import { isInventoryLotExpired } from "@/lib/inventory-lot-expiry";
import { findInventoryLotByKey } from "@/lib/inventory-lot-upsert";

type Db = Prisma.TransactionClient | PrismaClient;

export type StockTransferLineInput = {
  sourceLotId: string;
  quantity: number;
};

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Increment qty on existing dest lot, or create with source pricing. Never overwrites dest pricing. */
async function incrementOrCreateDestinationLot(
  db: Db,
  toStoreId: string,
  sourceLot: {
    productId: string;
    batchNo: string;
    expiryDate: Date;
    supplierId: string | null;
    packSize: number;
    costPrice: Prisma.Decimal;
    mrp: Prisma.Decimal;
    saleRate: Prisma.Decimal;
    salesDiscountPct: Prisma.Decimal;
    salesDiscountRs: Prisma.Decimal;
  },
  qty: number,
): Promise<void> {
  const existing = await findInventoryLotByKey(db, {
    storeId: toStoreId,
    productId: sourceLot.productId,
    batchNo: sourceLot.batchNo,
    expiryDate: sourceLot.expiryDate,
  });

  if (existing) {
    await db.inventoryLot.update({
      where: { id: existing.id },
      data: { quantity: { increment: qty } },
    });
    return;
  }

  try {
    await db.inventoryLot.create({
      data: {
        storeId: toStoreId,
        productId: sourceLot.productId,
        batchNo: sourceLot.batchNo,
        expiryDate: sourceLot.expiryDate,
        quantity: qty,
        packSize: Math.max(1, Math.trunc(sourceLot.packSize) || 1),
        supplierId: sourceLot.supplierId,
        costPrice: sourceLot.costPrice,
        mrp: sourceLot.mrp,
        saleRate: sourceLot.saleRate,
        salesDiscountPct: sourceLot.salesDiscountPct,
        salesDiscountRs: sourceLot.salesDiscountRs,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await findInventoryLotByKey(db, {
      storeId: toStoreId,
      productId: sourceLot.productId,
      batchNo: sourceLot.batchNo,
      expiryDate: sourceLot.expiryDate,
    });
    if (!again) throw err;
    await db.inventoryLot.update({
      where: { id: again.id },
      data: { quantity: { increment: qty } },
    });
  }
}

export async function executeStockTransferInTransaction(
  db: Db,
  args: {
    fromStoreId: string;
    toStoreId: string;
    createdById: string;
    notes: string | null;
    lines: StockTransferLineInput[];
  },
): Promise<{ id: string; transferNo: number }> {
  if (args.fromStoreId === args.toStoreId) throw new Error("same_store");
  if (args.lines.length === 0) throw new Error("no_lines");

  const settings = await db.storeSettings.findUnique({ where: { storeId: args.fromStoreId } });
  if (!settings) throw new Error("no_settings");

  const transferNo = settings.nextTransferNo;
  await db.storeSettings.update({
    where: { storeId: args.fromStoreId },
    data: { nextTransferNo: { increment: 1 } },
  });

  const resolvedLines: Array<{
    sourceLotId: string;
    productId: string;
    batchNo: string;
    expiryDate: Date;
    quantity: number;
    sourceLot: Awaited<ReturnType<typeof db.inventoryLot.findUnique>>;
  }> = [];

  const seenLotIds = new Set<string>();

  for (const line of args.lines) {
    if (line.quantity < 1) throw new Error("invalid_qty");
    if (seenLotIds.has(line.sourceLotId)) throw new Error("duplicate_lot");
    seenLotIds.add(line.sourceLotId);

    const sourceLot = await db.inventoryLot.findUnique({ where: { id: line.sourceLotId } });
    if (!sourceLot) throw new Error("lot_not_found");
    if (sourceLot.storeId !== args.fromStoreId) throw new Error("lot_wrong_store");
    if (isInventoryLotExpired(sourceLot.expiryDate)) throw new Error("expired_lot");
    if (sourceLot.quantity < line.quantity) throw new Error("short_stock");

    resolvedLines.push({
      sourceLotId: sourceLot.id,
      productId: sourceLot.productId,
      batchNo: sourceLot.batchNo,
      expiryDate: sourceLot.expiryDate,
      quantity: line.quantity,
      sourceLot,
    });
  }

  const completedAt = new Date();
  const transfer = await db.stockTransfer.create({
    data: {
      transferNo,
      fromStoreId: args.fromStoreId,
      toStoreId: args.toStoreId,
      notes: args.notes,
      status: "COMPLETED",
      completedAt,
      createdById: args.createdById,
      lines: {
        create: resolvedLines.map((r) => ({
          sourceLotId: r.sourceLotId,
          productId: r.productId,
          batchNo: r.batchNo,
          expiryDate: r.expiryDate,
          quantity: r.quantity,
        })),
      },
    },
    select: { id: true, transferNo: true },
  });

  for (const row of resolvedLines) {
    const lot = row.sourceLot!;
    await db.inventoryLot.update({
      where: { id: lot.id },
      data: { quantity: { decrement: row.quantity } },
    });
    await incrementOrCreateDestinationLot(db, args.toStoreId, lot, row.quantity);
  }

  return transfer;
}
