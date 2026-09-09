/** POS F3 inquiry — product master + store batches. */

export type ProductInquiryLot = {
  id: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  mrp: number;
  saleRate: number;
  salesDiscountPct: number;
  salesDiscountRs: number;
  supplierName: string | null;
  packSize: number;
  daysToExpiry: number;
  expired: boolean;
};

export type ProductInquiryProduct = {
  id: string;
  name: string;
  sku: string;
  genericName: string | null;
  brand: string | null;
  hsn: string | null;
  gstPct: number;
  packSize: number;
  productCategory: string;
  productType: string;
  productSchedule: string;
  reorderMin: number;
  unit: string;
};

export type ProductInquiry = {
  product: ProductInquiryProduct;
  lots: ProductInquiryLot[];
};
