export type ProductListRow = {
  productId: string;
  sku: string;
  name: string;
  genericName: string | null;
  productCategory: string | null;
  productType: string | null;
  brandId: string | null;
  brandName: string | null;
  packSize: number;
  reorderMin: number;
  gstPct: number;
  stockQty: number;
  suppliers: string | null;
};
