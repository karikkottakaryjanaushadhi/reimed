import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import { getSaleReturnFilterOptions } from "@/lib/sale-returns-filter-options";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const options = await getSaleReturnFilterOptions({
    storeId: ctx.activeStoreId,
    from: trimDateParam(searchParams.get("from")) || undefined,
    to: trimDateParam(searchParams.get("to")) || undefined,
    product: searchParams.get("product") ?? undefined,
    batch: searchParams.get("batch") ?? undefined,
    billNo: searchParams.get("billNo") ?? undefined,
    patient: searchParams.get("patient") ?? undefined,
    doctor: searchParams.get("doctor") ?? undefined,
    recordedBy: searchParams.get("recordedBy") ?? undefined,
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
