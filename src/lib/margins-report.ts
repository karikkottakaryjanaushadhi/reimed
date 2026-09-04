import { formatAppDateYmd } from "@/lib/app-timezone";
import { createdAtDatetimeRange } from "@/lib/date-range-filter";
import { DEFAULT_LIST_PAGE_SIZE, parseListLimitParam } from "@/lib/list-pagination";
import {
  aggregateBillwiseMargins,
  billwiseSaleLineWhere,
  sumBillwiseMarginRows,
} from "@/lib/billwise-margin-aggregate";
import {
  aggregateProductwiseSales,
  productwiseSaleLineWhere,
  sumProductwiseRows,
} from "@/lib/productwise-sales-aggregate";
import { getProductwiseProductOptions } from "@/lib/sales-filter-options";
import { prisma } from "@/lib/prisma";
import { roundMoney } from "@/lib/sale-return-aggregates";

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

function marginPercent(margin: number, netRevenue: number) {
  return netRevenue > 0 ? roundMoney((margin / netRevenue) * 10000) / 100 : 0;
}

export async function loadMarginsReport(storeId: string, sp: MarginsQuery): Promise<MarginsReport> {
  const view = sp.view === "bill" ? "bill" : "product";
  const rawPage = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const pageSize = parseListLimitParam(sp.limit);
  const today = formatAppDateYmd();
  const fromRaw = typeof sp.from === "string" ? sp.from.trim() : "";
  const toRaw = typeof sp.to === "string" ? sp.to.trim() : "";
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  const billRaw = typeof sp.bill === "string" ? sp.bill.trim() : "";
  const billNo = billRaw ? parseInt(billRaw, 10) : undefined;
  const sort = typeof sp.sort === "string" ? sp.sort : view === "bill" ? "createdAt" : "margin";
  const dir = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : "desc";
  const from = fromRaw || today;
  const to = toRaw || today;

  const dateFilter = createdAtDatetimeRange(from || undefined, to || undefined);
  const saleWhere = {
    storeId,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const lineWhere =
    view === "bill"
      ? billwiseSaleLineWhere(saleWhere, billNo && Number.isFinite(billNo) ? billNo : undefined)
      : productwiseSaleLineWhere(saleWhere, product || undefined);

  const [initialProducts, saleLines, returnLines] = await Promise.all([
    getProductwiseProductOptions({ storeId, from, to }),
    prisma.saleLine.findMany({
      where: lineWhere,
      select: {
        saleId: true,
        qty: true,
        amount: true,
        discountAmount: true,
        gstAmount: true,
        product: { select: { id: true, name: true, packSize: true } },
        lot: { select: { costPrice: true, mrp: true } },
        sale: {
          select: {
            billNo: true,
            createdAt: true,
            customerName: true,
          },
        },
      },
    }),
    prisma.saleReturnLine.findMany({
      where: { saleLine: lineWhere },
      select: {
        qty: true,
        refundTotal: true,
        saleLine: {
          select: {
            saleId: true,
            qty: true,
            amount: true,
            discountAmount: true,
            gstAmount: true,
            product: { select: { id: true, name: true, packSize: true } },
            lot: { select: { costPrice: true, mrp: true } },
            sale: {
              select: {
                billNo: true,
                createdAt: true,
                customerName: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (view === "product") {
    const productTotals = aggregateProductwiseSales(saleLines, returnLines).sort((a, b) => {
      if (sort === "name") {
        const cmp = a.productName.localeCompare(b.productName);
        return dir === "asc" ? cmp : -cmp;
      }
      if (sort === "netRevenue") {
        return dir === "asc" ? a.netRevenue - b.netRevenue : b.netRevenue - a.netRevenue;
      }
      if (sort === "cost") {
        return dir === "asc" ? a.cost - b.cost : b.cost - a.cost;
      }
      if (sort === "margin") {
        return dir === "asc" ? a.margin - b.margin : b.margin - a.margin;
      }
      if (sort === "marginPercent") {
        return dir === "asc" ? a.marginPercent - b.marginPercent : b.marginPercent - a.marginPercent;
      }
      if (sort === "billCount") {
        return dir === "asc" ? a.billCount - b.billCount : b.billCount - a.billCount;
      }
      return dir === "asc" ? a.margin - b.margin : b.margin - a.margin;
    });

    const totals = sumProductwiseRows(productTotals);
    const totalCount = productTotals.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(rawPage, totalPages);
    const pageItems = productTotals.slice((page - 1) * pageSize, page * pageSize);

    return {
      view: "product",
      from,
      to,
      product,
      sort,
      dir,
      page,
      pageSize,
      totalPages,
      totalCount,
      initialProducts,
      items: pageItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        returnQty: item.returnQty,
        billCount: item.billCount,
        gross: item.gross,
        discount: item.discount,
        netRevenue: item.netRevenue,
        cost: item.cost,
        margin: item.margin,
        marginPercent: item.marginPercent,
      })),
      totals: {
        productCount: totals.productCount,
        quantity: totals.quantity,
        gross: totals.gross,
        netRevenue: totals.netRevenue,
        cost: totals.cost,
        margin: totals.margin,
        marginPercent: marginPercent(totals.margin, totals.netRevenue),
      },
    };
  }

  const billTotals = aggregateBillwiseMargins(saleLines, returnLines).sort((a, b) => {
    if (sort === "billNo") {
      return dir === "asc" ? a.billNo - b.billNo : b.billNo - a.billNo;
    }
    if (sort === "createdAt") {
      const cmp = a.createdAt.getTime() - b.createdAt.getTime();
      return dir === "asc" ? cmp : -cmp;
    }
    if (sort === "netRevenue") {
      return dir === "asc" ? a.netRevenue - b.netRevenue : b.netRevenue - a.netRevenue;
    }
    if (sort === "cost") {
      return dir === "asc" ? a.cost - b.cost : b.cost - a.cost;
    }
    if (sort === "margin") {
      return dir === "asc" ? a.margin - b.margin : b.margin - a.margin;
    }
    if (sort === "marginPercent") {
      return dir === "asc" ? a.marginPercent - b.marginPercent : b.marginPercent - a.marginPercent;
    }
    const cmp = a.createdAt.getTime() - b.createdAt.getTime();
    return dir === "asc" ? cmp : -cmp;
  });

  const totals = sumBillwiseMarginRows(billTotals);
  const totalCount = billTotals.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(rawPage, totalPages);
  const pageItems = billTotals.slice((page - 1) * pageSize, page * pageSize);

  return {
    view: "bill",
    from,
    to,
    bill: billRaw,
    sort,
    dir,
    page,
    pageSize,
    totalPages,
    totalCount,
    initialProducts,
    items: pageItems.map((item) => ({
      saleId: item.saleId,
      billNo: item.billNo,
      createdAtIso: item.createdAt.toISOString(),
      customerName: item.customerName,
      lineCount: item.lineCount,
      netRevenue: item.netRevenue,
      cost: item.cost,
      margin: item.margin,
      marginPercent: item.marginPercent,
      returnCredits: item.returnCredits,
    })),
    totals: {
      billCount: totals.billCount,
      netRevenue: totals.netRevenue,
      cost: totals.cost,
      margin: totals.margin,
      marginPercent: totals.marginPercent,
    },
  };
}

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
