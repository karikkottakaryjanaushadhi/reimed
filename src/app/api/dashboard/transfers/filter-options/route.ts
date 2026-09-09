import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import { getTransferFilterOptions, parseTransferDirection } from "@/lib/transfers-filter-options";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const options = await getTransferFilterOptions({
    storeId: ctx.activeStoreId,
    from: trimDateParam(searchParams.get("from")) || undefined,
    to: trimDateParam(searchParams.get("to")) || undefined,
    direction: parseTransferDirection(searchParams.get("direction")),
    counterpartyId: searchParams.get("branch") ?? undefined,
    product: searchParams.get("product") ?? undefined,
    transferNo: searchParams.get("transferNo") ?? undefined,
    batch: searchParams.get("batch") ?? undefined,
    recordedBy: searchParams.get("recordedBy") ?? undefined,
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
