import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import {
  getProductFilterOptions,
  parseProductCategoryFilter,
  parseProductScheduleFilter,
  parseProductTypeFilter,
  type ProductStockFilter,
} from "@/lib/products-filter-options";

function parseStock(raw: string | null): ProductStockFilter {
  if (raw === "low" || raw === "out" || raw === "in") return raw;
  return "";
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const options = await getProductFilterOptions({
    storeId: ctx.activeStoreId,
    q: searchParams.get("q") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    gst: searchParams.get("gst") ?? undefined,
    stock: parseStock(searchParams.get("stock")),
    category: parseProductCategoryFilter(searchParams.get("category")),
    type: parseProductTypeFilter(searchParams.get("type")),
    schedule: parseProductScheduleFilter(searchParams.get("schedule")),
    supplier: searchParams.get("supplier") ?? undefined,
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
