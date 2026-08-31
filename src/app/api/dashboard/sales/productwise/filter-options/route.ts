import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { getProductwiseProductOptions } from "@/lib/sales-filter-options";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const products = await getProductwiseProductOptions({
    storeId: ctx.activeStoreId,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  return NextResponse.json(
    { products },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
      },
    },
  );
}
