import { formDraftStorageKey } from "@/lib/form-draft-storage";

export type PurchaseFormDraftLine = {
  key: string;
  productId: string | null;
  labelName: string;
  manufacturer?: string;
  catalogBrandId?: string | null;
  catalogReorderMin?: number;
  catalogGstPct?: number;
  genericName?: string;
  pack: number;
  unit?: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  mrp: number;
  hsn?: string;
  purchaseDiscountPct: number;
  purchaseDiscountRs: number;
  schemeDiscountPct: number;
  schemeDiscountRs: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  freeQty: number;
  gstPct: number;
};

export type PurchaseFormDraft = {
  v: 1;
  savedAt: number;
  supplierId: string;
  supplierQ: string;
  invoiceNo: string;
  invoiceDate: string;
  lines: PurchaseFormDraftLine[];
  draftLine: PurchaseFormDraftLine;
  draftQ: string;
  draftNewProduct: boolean;
  editingInProgress: boolean;
  paymentMode?: "CASH" | "CARD" | "UPI" | "CREDIT";
  billPaid?: boolean;
  paidAt?: string;
  paymentRefLast4?: string;
  importMetaNotes: string;
  saleRateDrafts: Record<string, string>;
};

export function purchaseFormDraftKey(storeId: string): string {
  return formDraftStorageKey("purchase-new", storeId);
}

export function isPurchaseFormDraftEmpty(d: PurchaseFormDraft): boolean {
  if (d.lines.length > 0) return false;
  if (d.supplierId.trim() || d.supplierQ.trim() || d.invoiceNo.trim() || d.invoiceDate.trim()) {
    return false;
  }
  if (d.importMetaNotes.trim()) return false;
  if (d.draftQ.trim() || d.draftNewProduct) return false;
  const row = d.draftLine;
  if (row.productId || row.labelName.trim() || row.batchNo.trim() || row.expiryDate.trim()) {
    return false;
  }
  if (row.quantity !== 1 || row.costPrice !== 0 || row.mrp !== 0) return false;
  return true;
}

export function buildPurchaseFormDraft(input: Omit<PurchaseFormDraft, "v" | "savedAt">): PurchaseFormDraft {
  return {
    v: 1,
    savedAt: Date.now(),
    ...input,
  };
}
