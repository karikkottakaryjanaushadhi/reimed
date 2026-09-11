export const SESSION_COOKIE = "reimed_session";
export const STORE_COOKIE = "reimed_store";

export type StoreRole = "MANAGER" | "CASHIER";
export type PaymentMode = "CASH" | "CARD" | "UPI" | "CREDIT";
export const PAYMENT_MODES = ["CASH", "CARD", "UPI", "CREDIT"] as const;

export function isPaymentMode(v: string): v is PaymentMode {
  return (PAYMENT_MODES as readonly string[]).includes(v);
}

export function parsePaymentModeFilter(raw: unknown): "" | PaymentMode {
  const v = String(raw ?? "").trim().toUpperCase();
  return isPaymentMode(v) ? v : "";
}
