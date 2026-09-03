import type { PaymentMode } from "@/lib/constants";

/** Default paid state when creating a bill from payment mode. */
export function defaultSalePaid(paymentMode: PaymentMode | string): boolean {
  return paymentMode !== "CREDIT";
}

/** Persist cash tendered only for CASH bills; otherwise null. */
export function resolveSaleCashReceived(
  paymentMode: PaymentMode | string,
  cashReceived: number | null | undefined,
): number | null {
  if (paymentMode !== "CASH") return null;
  if (cashReceived == null || !Number.isFinite(cashReceived) || cashReceived < 0) return null;
  return Math.round(cashReceived * 100) / 100;
}
