import type { PaymentMode } from "@/lib/constants";
import { roundMoney } from "@/lib/purchase-return-aggregates";

export const PURCHASE_PAYMENT_MODES = ["CASH", "CARD", "UPI", "CREDIT"] as const;

export function isPurchasePaymentMode(v: string): v is PaymentMode {
  return (PURCHASE_PAYMENT_MODES as readonly string[]).includes(v);
}

/** Default paid state when creating a purchase from payment mode. */
export function defaultPurchasePaid(_paymentMode?: PaymentMode | string): boolean {
  return false;
}

/** UPI / Card use txn last-4; cash and credit do not. */
export function paymentRefApplies(paymentMode: PaymentMode | string): boolean {
  return paymentMode === "UPI" || paymentMode === "CARD";
}

/**
 * Normalize a pasted UTR / txn id to last 4 alphanumeric chars.
 * Returns null when empty or when mode does not use a ref.
 */
export function normalizePaymentRefLast4(
  paymentMode: PaymentMode | string,
  raw: string | null | undefined,
): string | null {
  if (!paymentRefApplies(paymentMode)) return null;
  if (raw == null) return null;
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!cleaned) return null;
  return cleaned.slice(-4);
}

/** Parse yyyy-mm-dd to UTC noon Date, or null. */
export function parsePurchasePaidAt(ymd: string | null | undefined): Date | null {
  if (ymd == null) return null;
  const s = ymd.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function todayPaidAtYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type PurchaseSettlementWrite = {
  paymentMode: PaymentMode;
  paid: boolean;
  amountPaid: number;
  paidAt: Date | null;
  paymentRefLast4: string | null;
};

/**
 * Build settlement fields for create / mark-paid / mark-unpaid.
 * `netTotal` is GST-inclusive net after returns (grand total when no returns).
 */
export function resolvePurchaseSettlement(input: {
  paymentMode: PaymentMode | string;
  paid: boolean;
  netTotal: number;
  paidAtYmd?: string | null;
  paymentRefLast4?: string | null;
}): PurchaseSettlementWrite {
  const paymentMode = isPurchasePaymentMode(String(input.paymentMode))
    ? (input.paymentMode as PaymentMode)
    : "CASH";
  const net = roundMoney(Math.max(0, input.netTotal));

  if (!input.paid) {
    return {
      paymentMode,
      paid: false,
      amountPaid: 0,
      paidAt: null,
      paymentRefLast4: null,
    };
  }

  const paidAt =
    parsePurchasePaidAt(input.paidAtYmd) ?? parsePurchasePaidAt(todayPaidAtYmd());
  return {
    paymentMode,
    paid: true,
    amountPaid: net,
    paidAt,
    paymentRefLast4: normalizePaymentRefLast4(paymentMode, input.paymentRefLast4),
  };
}

/**
 * Outstanding contribution of one purchase toward supplier balance.
 * Positive = you owe; negative = supplier credit (e.g. CN after full pay).
 */
export function purchaseDueContribution(
  paid: boolean,
  netTotal: number,
  amountPaid: number,
): number {
  const net = roundMoney(netTotal);
  const paidAmt = roundMoney(amountPaid);
  const raw = roundMoney(net - paidAmt);
  if (!paid) return raw;
  return Math.min(0, raw);
}

export function sumSupplierOutstanding(
  rows: ReadonlyArray<{ paid: boolean; netTotal: number; amountPaid: number }>,
): number {
  return roundMoney(rows.reduce((s, r) => s + purchaseDueContribution(r.paid, r.netTotal, r.amountPaid), 0));
}

/** After a return changes net: keep amountPaid; refresh paid flag. */
export function paidFlagAfterNetChange(
  amountPaid: number,
  newNet: number,
  currentlyPaid = false,
): boolean {
  const paidAmt = roundMoney(amountPaid);
  const net = roundMoney(newNet);
  if (paidAmt > 0) return paidAmt >= net;
  // Legacy settled rows (paid=true, amountPaid=0): stay paid so AP is not inflated.
  if (currentlyPaid) return true;
  return paidAmt >= net;
}
