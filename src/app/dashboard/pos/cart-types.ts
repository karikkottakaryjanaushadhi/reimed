/** POS billing — shared between page and draft-line module */

export type Lot = {
  id: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  mrp: number;
  saleRate?: number;
  salesDiscountPct?: number;
  salesDiscountRs?: number;
  /** From purchase / EasyTab import (InventoryLot.supplierId). */
  supplierName?: string | null;
  /** Past expiry calendar day (IST); not sellable at POS. */
  expired?: boolean;
  /** Units per pack for this batch (billing). */
  packSize: number;
  product: { id: string; name: string; packSize: number; gstPct: number };
};

export type CartLine = {
  productId: string;
  lotId: string;
  name: string;
  batchNo: string;
  expiryDate: string;
  packSize: number;
  /** GST % for tax extraction (from product; EasyTab GST_MASTER / manual). */
  gstPct: number;
  qty: number;
  maxQty: number;
  mrp: number;
  /** Lot trade cost per pack (for Mrg% on screen). */
  costPrice: number;
  rate: number;
  discountPct: number;
  discountFromLotOnly?: boolean;
  /** Qty already on this bill for this lot (edit mode); raises max sellable while editing. */
  reservedQty?: number;
};
