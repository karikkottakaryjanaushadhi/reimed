import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import {
  parseProductCategoryFilter,
  parseProductScheduleFilter,
  parseProductTypeFilter,
} from "@/lib/products-filter-options";
import { getSalesFilterOptions, parseSalePaymentModeFilter } from "@/lib/sales-filter-options";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const options = await getSalesFilterOptions({
    storeId: ctx.activeStoreId,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    billNo: searchParams.get("billNo") ?? undefined,
    doctor: searchParams.get("doctor") ?? undefined,
    patient: searchParams.get("patient") ?? undefined,
    cashier: searchParams.get("cashier") ?? undefined,
    product: searchParams.get("product") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    category: parseProductCategoryFilter(searchParams.get("category")),
    type: parseProductTypeFilter(searchParams.get("type")),
    schedule: parseProductScheduleFilter(searchParams.get("schedule")),
    payment: parseSalePaymentModeFilter(searchParams.get("payment")),
    unpaid: searchParams.get("unpaid") === "1" || searchParams.get("unpaid") === "true",
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
