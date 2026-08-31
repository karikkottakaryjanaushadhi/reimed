import type { PaymentMode } from "@/lib/constants";

/** Default paid state when creating a bill from payment mode. */
export function defaultSalePaid(paymentMode: PaymentMode | string): boolean {
  return paymentMode !== "CREDIT";
}
