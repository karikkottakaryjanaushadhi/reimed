import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { getSalesFilterOptions } from "@/lib/sales-filter-options";

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
    product: searchParams.get("product") ?? undefined,
    unpaid: searchParams.get("unpaid") === "1" || searchParams.get("unpaid") === "true",
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
