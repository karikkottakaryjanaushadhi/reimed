import { formDraftStorageKey } from "@/lib/form-draft-storage";
import type { CartLine } from "@/app/dashboard/pos/cart-types";

export type PosBillingDraft = {
  v: 1;
  savedAt: number;
  cart: CartLine[];
  customerName: string;
  customerPhone: string;
  doctorName: string;
  paymentMode: string;
  paid?: boolean;
  /** Cash tendered amount as typed string; empty when unset. */
  cashReceived?: string;
};

export function posBillingDraftKey(storeId: string): string {
  return formDraftStorageKey("pos-billing", storeId);
}

export function isPosBillingDraftEmpty(d: PosBillingDraft): boolean {
  if (d.cart.length > 0) return false;
  if (d.customerName.trim() || d.customerPhone.trim() || d.doctorName.trim()) return false;
  return true;
}

export function buildPosBillingDraft(input: Omit<PosBillingDraft, "v" | "savedAt">): PosBillingDraft {
  return {
    v: 1,
    savedAt: Date.now(),
    ...input,
  };
}
