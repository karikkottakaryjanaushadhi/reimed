import { NextResponse } from "next/server";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import { getPurchaseReturnFilterOptions } from "@/lib/purchase-returns-filter-options";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const options = await getPurchaseReturnFilterOptions({
    storeId: ctx.activeStoreId,
    from: trimDateParam(searchParams.get("from")) || undefined,
    to: trimDateParam(searchParams.get("to")) || undefined,
    supplier: searchParams.get("supplier") ?? undefined,
    product: searchParams.get("product") ?? undefined,
    batch: searchParams.get("batch") ?? undefined,
    purchaseNo: searchParams.get("purchaseNo") ?? undefined,
    creditNote: searchParams.get("creditNote") ?? undefined,
    recordedBy: searchParams.get("recordedBy") ?? undefined,
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
