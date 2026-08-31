import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { aggregateStoreStock } from "@/lib/inventory-stock-aggregate";

/** Stock per product at active store (sum of lots). Requires `q` search text. */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const sellableOnly = searchParams.get("sellableOnly") === "1";

  const stock = await aggregateStoreStock({
    storeId: ctx.activeStoreId,
    q,
    sellableOnly,
  });

  return NextResponse.json({ stock });
}
