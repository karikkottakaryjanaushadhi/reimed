import type { Prisma } from "@prisma/client";
import { saleLinePackSize } from "@/lib/inventory-lot-pack-size";
import { saleLineCostAmount, saleLineMarginAmount } from "@/lib/sale-line";
import { roundMoney } from "@/lib/sale-return-aggregates";

export type BillwiseMarginRow = {
  saleId: string;
  billNo: number;
  createdAt: Date;
  customerName: string | null;
  lineCount: number;
  gross: number;
  discount: number;
  tax: number;
  cost: number;
  margin: number;
  returnCredits: number;
  netRevenue: number;
  marginPercent: number;
};

type BillAgg = {
  saleId: string;
  billNo: number;
  createdAt: Date;
  customerName: string | null;
  lineCount: number;
  gross: number;
  discount: number;
  tax: number;
  cost: number;
  margin: number;
  returnCredits: number;
};

type SaleLineRow = {
  saleId: string;
  qty: number;
  amount: unknown;
  discountAmount: unknown;
  gstAmount: unknown;
  packSize?: unknown;
  product: { packSize?: unknown };
  lot: { costPrice: unknown };
  sale: {
    billNo: number;
    createdAt: Date;
    customerName: string | null;
  };
};

type ReturnLineRow = {
  qty: number;
  refundTotal: unknown;
  saleLine: {
    saleId: string;
    qty: number;
    amount: unknown;
    discountAmount: unknown;
    gstAmount: unknown;
    packSize?: unknown;
    product: { packSize?: unknown };
    lot: { costPrice: unknown };
    sale: {
      billNo: number;
      createdAt: Date;
      customerName: string | null;
    };
  };
};

function ensureBill(map: Map<string, BillAgg>, line: SaleLineRow | ReturnLineRow["saleLine"]): BillAgg {
  const saleId = line.saleId;
  let entry = map.get(saleId);
  if (!entry) {
    entry = {
      saleId,
      billNo: line.sale.billNo,
      createdAt: line.sale.createdAt,
      customerName: line.sale.customerName,
      lineCount: 0,
      gross: 0,
      discount: 0,
      tax: 0,
      cost: 0,
      margin: 0,
      returnCredits: 0,
    };
    map.set(saleId, entry);
  }
  return entry;
}

function applySaleLine(entry: BillAgg, line: SaleLineRow) {
  const packSize = saleLinePackSize(line);
  const qty = line.qty;
  const amount = Number(line.amount);
  const discountAmount = Number(line.discountAmount);
  const gstAmount = Number(line.gstAmount);
  const costAmount = saleLineCostAmount(qty, Number(line.lot.costPrice), packSize);
  const lineMargin = saleLineMarginAmount(amount, discountAmount, gstAmount, costAmount);

  entry.lineCount += 1;
  entry.gross = roundMoney(entry.gross + amount);
  entry.discount = roundMoney(entry.discount + discountAmount);
  entry.tax = roundMoney(entry.tax + gstAmount);
  entry.cost = roundMoney(entry.cost + costAmount);
  entry.margin = roundMoney(entry.margin + lineMargin);
}

function applyReturnLine(entry: BillAgg, saleLine: ReturnLineRow["saleLine"], returnLine: ReturnLineRow) {
  const soldQty = saleLine.qty;
  const returnQty = returnLine.qty;
  if (soldQty <= 0 || returnQty <= 0) return;

  const packSize = saleLinePackSize(saleLine);
  const ratio = returnQty / soldQty;
  const amount = Number(saleLine.amount);
  const discountAmount = Number(saleLine.discountAmount);
  const gstAmount = Number(saleLine.gstAmount);
  const refundTotal = Number(returnLine.refundTotal);
  const retAmount = roundMoney(amount * ratio);
  const retDiscount = roundMoney(discountAmount * ratio);
  const retTax = roundMoney(gstAmount * ratio);
  const retCost = saleLineCostAmount(returnQty, Number(saleLine.lot.costPrice), packSize);
  const retMargin = saleLineMarginAmount(retAmount, retDiscount, retTax, retCost);

  entry.gross = roundMoney(entry.gross - retAmount);
  entry.discount = roundMoney(entry.discount - retDiscount);
  entry.tax = roundMoney(entry.tax - retTax);
  entry.cost = roundMoney(entry.cost - retCost);
  entry.margin = roundMoney(entry.margin - retMargin);
  entry.returnCredits = roundMoney(entry.returnCredits + refundTotal);
}

function finalizeRow(entry: BillAgg): BillwiseMarginRow {
  const netRevenue = roundMoney(Math.max(0, entry.gross - entry.discount));
  const marginPercent =
    netRevenue > 0 ? roundMoney((entry.margin / netRevenue) * 10000) / 100 : 0;

  return {
    saleId: entry.saleId,
    billNo: entry.billNo,
    createdAt: entry.createdAt,
    customerName: entry.customerName,
    lineCount: entry.lineCount,
    gross: entry.gross,
    discount: entry.discount,
    tax: entry.tax,
    cost: entry.cost,
    margin: entry.margin,
    returnCredits: entry.returnCredits,
    netRevenue,
    marginPercent,
  };
}

export function aggregateBillwiseMargins(
  saleLines: SaleLineRow[],
  returnLines: ReturnLineRow[],
): BillwiseMarginRow[] {
  const map = new Map<string, BillAgg>();

  for (const line of saleLines) {
    const entry = ensureBill(map, line);
    applySaleLine(entry, line);
  }

  for (const rl of returnLines) {
    const entry = ensureBill(map, rl.saleLine);
    applyReturnLine(entry, rl.saleLine, rl);
  }

  return Array.from(map.values()).map(finalizeRow);
}

export type BillwiseMarginTotals = {
  billCount: number;
  gross: number;
  discount: number;
  tax: number;
  cost: number;
  margin: number;
  returnCredits: number;
  netRevenue: number;
  marginPercent: number;
};

export function sumBillwiseMarginRows(rows: BillwiseMarginRow[]): BillwiseMarginTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      billCount: acc.billCount + 1,
      gross: roundMoney(acc.gross + row.gross),
      discount: roundMoney(acc.discount + row.discount),
      tax: roundMoney(acc.tax + row.tax),
      cost: roundMoney(acc.cost + row.cost),
      margin: roundMoney(acc.margin + row.margin),
      returnCredits: roundMoney(acc.returnCredits + row.returnCredits),
      netRevenue: roundMoney(acc.netRevenue + row.netRevenue),
    }),
    {
      billCount: 0,
      gross: 0,
      discount: 0,
      tax: 0,
      cost: 0,
      margin: 0,
      returnCredits: 0,
      netRevenue: 0,
    },
  );
  const marginPercent =
    totals.netRevenue > 0 ? roundMoney((totals.margin / totals.netRevenue) * 10000) / 100 : 0;
  return { ...totals, marginPercent };
}

export function billwiseSaleLineWhere(
  saleWhere: Prisma.SaleWhereInput,
  billNo?: number,
): Prisma.SaleLineWhereInput {
  return {
    sale: {
      ...saleWhere,
      ...(billNo != null && Number.isFinite(billNo) ? { billNo } : {}),
    },
  };
}
