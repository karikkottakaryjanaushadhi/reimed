import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { purchaseBillTotalsFromLines } from "@/lib/purchase-line";
import {
  netPurchaseTotal,
  returnCreditsByPurchaseIds,
  roundMoney,
} from "@/lib/purchase-return-aggregates";
import { purchaseDueContribution, sumSupplierOutstanding } from "@/lib/purchase-paid";
import { snapProductGstPct } from "@/lib/product-gst-slabs";

const billLineSelect = {
  quantity: true,
  costPrice: true,
  pack: true,
  purchaseDiscountPct: true,
  purchaseDiscountRs: true,
  schemeDiscountPct: true,
  schemeDiscountRs: true,
  gstPct: true,
} as const;

function toBillLine(line: {
  quantity: number;
  costPrice: Prisma.Decimal | { toString(): string };
  pack: number;
  purchaseDiscountPct: Prisma.Decimal | { toString(): string };
  purchaseDiscountRs: Prisma.Decimal | { toString(): string };
  schemeDiscountPct: Prisma.Decimal | { toString(): string };
  schemeDiscountRs: Prisma.Decimal | { toString(): string };
  gstPct: Prisma.Decimal | { toString(): string };
}) {
  return {
    quantity: line.quantity,
    costPrice: Number(line.costPrice),
    pack: line.pack,
    purchaseDiscountPct: Number(line.purchaseDiscountPct),
    purchaseDiscountRs: Number(line.purchaseDiscountRs),
    schemeDiscountPct: Number(line.schemeDiscountPct),
    schemeDiscountRs: Number(line.schemeDiscountRs),
    gstPct: snapProductGstPct(line.gstPct),
  };
}

export type SupplierOutstandingRow = {
  supplierId: string;
  outstanding: number;
  unpaidCount: number;
};

/** Outstanding per supplier for a store (+ = you owe, − = credit). */
export async function supplierOutstandingByStore(
  storeId: string,
  supplierIds?: string[],
): Promise<Map<string, SupplierOutstandingRow>> {
  const purchases = await prisma.purchase.findMany({
    where: {
      storeId,
      ...(supplierIds?.length ? { supplierId: { in: supplierIds } } : {}),
    },
    select: {
      id: true,
      supplierId: true,
      paid: true,
      amountPaid: true,
      lines: { select: billLineSelect },
    },
  });

  const credits = await returnCreditsByPurchaseIds(
    storeId,
    purchases.map((p) => p.id),
  );

  const bySupplier = new Map<string, { paid: boolean; netTotal: number; amountPaid: number }[]>();
  for (const p of purchases) {
    const grand = purchaseBillTotalsFromLines(p.lines.map(toBillLine)).grandTotal;
    const net = netPurchaseTotal(grand, credits.get(p.id) ?? 0);
    const row = {
      paid: p.paid,
      netTotal: net,
      amountPaid: Number(p.amountPaid),
    };
    const list = bySupplier.get(p.supplierId) ?? [];
    list.push(row);
    bySupplier.set(p.supplierId, list);
  }

  const out = new Map<string, SupplierOutstandingRow>();
  for (const [supplierId, rows] of bySupplier) {
    out.set(supplierId, {
      supplierId,
      outstanding: sumSupplierOutstanding(rows),
      unpaidCount: rows.filter((r) => !r.paid && roundMoney(r.netTotal - r.amountPaid) > 0).length,
    });
  }
  return out;
}

export async function supplierOutstandingForSupplier(
  storeId: string,
  supplierId: string,
): Promise<{
  outstanding: number;
  unpaidCount: number;
  purchases: Array<{
    id: string;
    purchaseNo: number;
    paid: boolean;
    paymentMode: string;
    amountPaid: number;
    netTotal: number;
    due: number;
    invoiceRef: string | null;
    invoiceDate: Date | null;
    createdAt: Date;
  }>;
}> {
  const purchases = await prisma.purchase.findMany({
    where: { storeId, supplierId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      purchaseNo: true,
      paid: true,
      paymentMode: true,
      amountPaid: true,
      invoiceRef: true,
      invoiceDate: true,
      createdAt: true,
      lines: { select: billLineSelect },
    },
  });

  const credits = await returnCreditsByPurchaseIds(
    storeId,
    purchases.map((p) => p.id),
  );

  const rows = purchases.map((p) => {
    const grand = purchaseBillTotalsFromLines(p.lines.map(toBillLine)).grandTotal;
    const netTotal = netPurchaseTotal(grand, credits.get(p.id) ?? 0);
    const amountPaid = Number(p.amountPaid);
    const due = purchaseDueContribution(p.paid, netTotal, amountPaid);
    return {
      id: p.id,
      purchaseNo: p.purchaseNo,
      paid: p.paid,
      paymentMode: p.paymentMode,
      amountPaid,
      netTotal,
      due,
      invoiceRef: p.invoiceRef,
      invoiceDate: p.invoiceDate,
      createdAt: p.createdAt,
    };
  });

  return {
    outstanding: sumSupplierOutstanding(rows),
    unpaidCount: rows.filter((r) => !r.paid && roundMoney(r.netTotal - r.amountPaid) > 0).length,
    purchases: rows,
  };
}
