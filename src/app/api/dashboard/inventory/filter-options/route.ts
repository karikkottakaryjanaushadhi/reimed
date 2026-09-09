import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { getInventoryFilterOptions } from "@/lib/inventory-filter-options";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const options = await getInventoryFilterOptions({
    storeId: ctx.activeStoreId,
    q: searchParams.get("q") ?? undefined,
    supplierId: searchParams.get("supplierId") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
    expiry: searchParams.get("expiry") ?? undefined,
    expiryOn: searchParams.get("expiryOn") ?? undefined,
    lowStock: searchParams.get("lowStock") === "1",
    category: searchParams.get("category") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    schedule: searchParams.get("schedule") ?? undefined,
    qty: searchParams.get("qty") ?? undefined,
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
