import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { getProductBrandOptions, type ProductStockFilter } from "@/lib/products-filter-options";

function parseStock(raw: string | null): ProductStockFilter {
  if (raw === "low" || raw === "out" || raw === "in") return raw;
  return "";
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brands = await getProductBrandOptions({
    storeId: ctx.activeStoreId,
    q: searchParams.get("q") ?? undefined,
    gst: searchParams.get("gst") ?? undefined,
    stock: parseStock(searchParams.get("stock")),
  });

  return NextResponse.json(
    { brands },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
      },
    },
  );
}
