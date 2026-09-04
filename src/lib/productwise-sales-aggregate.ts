import type { Prisma } from "@prisma/client";
import { saleLineCostAmount, saleLineMarginAmount } from "@/lib/sale-line";
import { roundMoney } from "@/lib/sale-return-aggregates";

export type ProductwiseRow = {
  productId: string;
  productName: string;
  packSize: number;
  /** Pack MRP from lots sold in the period (min across lines). */
  mrpMin: number | null;
  /** Pack MRP from lots sold in the period (max across lines). */
  mrpMax: number | null;
  quantity: number;
  returnQty: number;
  gross: number;
  discount: number;
  tax: number;
  cost: number;
  margin: number;
  returnCredits: number;
  billCount: number;
  netRevenue: number;
  marginPercent: number;
};

type Agg = {
  productId: string;
  productName: string;
  packSize: number;
  mrpMin: number | null;
  mrpMax: number | null;
  quantity: number;
  returnQty: number;
  gross: number;
  discount: number;
  tax: number;
  cost: number;
  margin: number;
  returnCredits: number;
  billIds: Set<string>;
};

type SaleLineRow = {
  saleId: string;
  qty: number;
  amount: unknown;
  discountAmount: unknown;
  gstAmount: unknown;
  product: { id: string; name: string; packSize: unknown };
  lot: { costPrice: unknown; mrp: unknown };
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
    product: { id: string; name: string; packSize: unknown };
    lot: { costPrice: unknown; mrp: unknown };
  };
};

function noteLotMrp(entry: Agg, rawMrp: unknown) {
  const mrp = Number(rawMrp);
  if (!Number.isFinite(mrp) || mrp < 0) return;
  entry.mrpMin = entry.mrpMin == null ? mrp : Math.min(entry.mrpMin, mrp);
  entry.mrpMax = entry.mrpMax == null ? mrp : Math.max(entry.mrpMax, mrp);
}

function ensureAgg(map: Map<string, Agg>, line: { product: { id: string; name: string; packSize: unknown } }): Agg {
  let entry = map.get(line.product.id);
  if (!entry) {
    entry = {
      productId: line.product.id,
      productName: line.product.name,
      packSize: Number(line.product.packSize) || 1,
      mrpMin: null,
      mrpMax: null,
      quantity: 0,
      returnQty: 0,
      gross: 0,
      discount: 0,
      tax: 0,
      cost: 0,
      margin: 0,
      returnCredits: 0,
      billIds: new Set(),
    };
    map.set(line.product.id, entry);
  }
  return entry;
}

function applySaleLine(entry: Agg, line: SaleLineRow) {
  const qty = line.qty;
  const amount = Number(line.amount);
  const discountAmount = Number(line.discountAmount);
  const gstAmount = Number(line.gstAmount);
  const costAmount = saleLineCostAmount(qty, Number(line.lot.costPrice), entry.packSize);
  const lineMargin = saleLineMarginAmount(amount, discountAmount, gstAmount, costAmount);

  noteLotMrp(entry, line.lot.mrp);
  entry.quantity += qty;
  entry.gross = roundMoney(entry.gross + amount);
  entry.discount = roundMoney(entry.discount + discountAmount);
  entry.tax = roundMoney(entry.tax + gstAmount);
  entry.cost = roundMoney(entry.cost + costAmount);
  entry.margin = roundMoney(entry.margin + lineMargin);
  entry.billIds.add(line.saleId);
}

function applyReturnLine(entry: Agg, saleLine: ReturnLineRow["saleLine"], returnLine: ReturnLineRow) {
  const soldQty = saleLine.qty;
  const returnQty = returnLine.qty;
  if (soldQty <= 0 || returnQty <= 0) return;

  const ratio = returnQty / soldQty;
  const amount = Number(saleLine.amount);
  const discountAmount = Number(saleLine.discountAmount);
  const gstAmount = Number(saleLine.gstAmount);
  const refundTotal = Number(returnLine.refundTotal);
  const retAmount = roundMoney(amount * ratio);
  const retDiscount = roundMoney(discountAmount * ratio);
  const retTax = roundMoney(gstAmount * ratio);
  const retCost = saleLineCostAmount(returnQty, Number(saleLine.lot.costPrice), entry.packSize);
  const retMargin = saleLineMarginAmount(retAmount, retDiscount, retTax, retCost);

  noteLotMrp(entry, saleLine.lot.mrp);
  entry.quantity -= returnQty;
  entry.returnQty += returnQty;
  entry.gross = roundMoney(entry.gross - retAmount);
  entry.discount = roundMoney(entry.discount - retDiscount);
  entry.tax = roundMoney(entry.tax - retTax);
  entry.cost = roundMoney(entry.cost - retCost);
  entry.margin = roundMoney(entry.margin - retMargin);
  entry.returnCredits = roundMoney(entry.returnCredits + refundTotal);
}

function finalizeRow(entry: Agg): ProductwiseRow {
  const netRevenue = roundMoney(Math.max(0, entry.gross - entry.discount));
  const marginPercent =
    netRevenue > 0 ? roundMoney((entry.margin / netRevenue) * 10000) / 100 : 0;

  return {
    productId: entry.productId,
    productName: entry.productName,
    packSize: entry.packSize,
    mrpMin: entry.mrpMin,
    mrpMax: entry.mrpMax,
    quantity: entry.quantity,
    returnQty: entry.returnQty,
    gross: entry.gross,
    discount: entry.discount,
    tax: entry.tax,
    cost: entry.cost,
    margin: entry.margin,
    returnCredits: entry.returnCredits,
    billCount: entry.billIds.size,
    netRevenue,
    marginPercent,
  };
}

export function formatProductwiseMrp(mrpMin: number | null, mrpMax: number | null): string {
  if (mrpMin == null || mrpMax == null) return "—";
  if (mrpMin === mrpMax) return `₹${mrpMin.toFixed(2)}`;
  return `₹${mrpMin.toFixed(2)}–₹${mrpMax.toFixed(2)}`;
}

export function aggregateProductwiseSales(
  saleLines: SaleLineRow[],
  returnLines: ReturnLineRow[],
): ProductwiseRow[] {
  const map = new Map<string, Agg>();

  for (const line of saleLines) {
    const entry = ensureAgg(map, line);
    applySaleLine(entry, line);
  }

  for (const rl of returnLines) {
    const entry = ensureAgg(map, rl.saleLine);
    applyReturnLine(entry, rl.saleLine, rl);
  }

  return Array.from(map.values()).map(finalizeRow);
}

export type ProductwiseTotals = {
  productCount: number;
  quantity: number;
  returnQty: number;
  gross: number;
  discount: number;
  tax: number;
  cost: number;
  margin: number;
  returnCredits: number;
  netRevenue: number;
};

export function sumProductwiseRows(rows: ProductwiseRow[]): ProductwiseTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      productCount: acc.productCount + 1,
      quantity: acc.quantity + row.quantity,
      returnQty: acc.returnQty + row.returnQty,
      gross: roundMoney(acc.gross + row.gross),
      discount: roundMoney(acc.discount + row.discount),
      tax: roundMoney(acc.tax + row.tax),
      cost: roundMoney(acc.cost + row.cost),
      margin: roundMoney(acc.margin + row.margin),
      returnCredits: roundMoney(acc.returnCredits + row.returnCredits),
      netRevenue: roundMoney(acc.netRevenue + row.netRevenue),
    }),
    {
      productCount: 0,
      quantity: 0,
      returnQty: 0,
      gross: 0,
      discount: 0,
      tax: 0,
      cost: 0,
      margin: 0,
      returnCredits: 0,
      netRevenue: 0,
    },
  );
  return totals;
}

/** Shared sale-line filter for productwise queries (sales + returns on those bills). */
export function productwiseSaleLineWhere(
  saleWhere: Prisma.SaleWhereInput,
  product?: string,
): Prisma.SaleLineWhereInput {
  return {
    sale: saleWhere,
    ...(product
      ? {
          product: {
            name: { contains: product, mode: "insensitive" },
          },
        }
      : {}),
  };
}
