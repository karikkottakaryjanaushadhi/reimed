import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { formatAppDateYmd } from "@/lib/app-timezone";
import { csvResponse } from "@/lib/csv";
import { productCategoryLabel } from "@/lib/product-categories";
import { productTypeLabel } from "@/lib/product-types";
import {
  queryStockLevels,
  resolveStockLevelsFilters,
} from "@/lib/stock-levels-list-query";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filters = await resolveStockLevelsFilters({
    storeId: ctx.activeStoreId,
    q: searchParams.get("q") ?? undefined,
    supplierId: searchParams.get("supplierId") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
    expiry: searchParams.get("expiry") ?? undefined,
    expiryOn: searchParams.get("expiryOn") ?? undefined,
    lowStock: searchParams.get("lowStock") === "1",
  });

  const rows = await queryStockLevels({
    storeId: ctx.activeStoreId,
    filters,
    sort: searchParams.get("sort") ?? undefined,
    dir: searchParams.get("dir") ?? undefined,
  });

  return csvResponse(
    `stock-levels-${formatAppDateYmd()}.csv`,
    ["Product", "Brand", "Category", "Type", "GST %", "Supplier", "Qty", "Reorder"],
    rows.map((row) => [
      row.name,
      row.brandName ?? "",
      productCategoryLabel(row.productCategory),
      productTypeLabel(row.productType),
      row.gstPct,
      row.supplier ?? "",
      row.qty,
      row.reorderMin,
    ]),
  );
}
