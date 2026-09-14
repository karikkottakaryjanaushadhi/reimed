import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/list-pagination";

export type MarginsQuery = {
  page?: string;
  limit?: string;
  from?: string;
  to?: string;
  view?: string;
  product?: string;
  bill?: string;
  sort?: string;
  dir?: string;
};

export type MarginProductItem = {
  productId: string;
  productName: string;
  quantity: number;
  returnQty: number;
  billCount: number;
  gross: number;
  discount: number;
  netRevenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
};

export type MarginBillItem = {
  saleId: string;
  billNo: number;
  createdAtIso: string;
  customerName: string | null;
  lineCount: number;
  netRevenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
  returnCredits: number;
};

export type MarginsReport =
  | {
      view: "product";
      from: string;
      to: string;
      product: string;
      sort: string;
      dir: string;
      page: number;
      pageSize: number;
      totalPages: number;
      totalCount: number;
      initialProducts: string[];
      items: MarginProductItem[];
      totals: {
        productCount: number;
        quantity: number;
        gross: number;
        netRevenue: number;
        cost: number;
        margin: number;
        marginPercent: number;
      };
    }
  | {
      view: "bill";
      from: string;
      to: string;
      bill: string;
      sort: string;
      dir: string;
      page: number;
      pageSize: number;
      totalPages: number;
      totalCount: number;
      initialProducts: string[];
      items: MarginBillItem[];
      totals: {
        billCount: number;
        netRevenue: number;
        cost: number;
        margin: number;
        marginPercent: number;
      };
    };

export function marginsReportCacheKey(sp: MarginsQuery): string {
  return [
    sp.view ?? "product",
    sp.page ?? "1",
    sp.limit ?? String(DEFAULT_LIST_PAGE_SIZE),
    sp.from ?? "",
    sp.to ?? "",
    sp.product ?? "",
    sp.bill ?? "",
    sp.sort ?? "",
    sp.dir ?? "",
  ].join("|");
}
