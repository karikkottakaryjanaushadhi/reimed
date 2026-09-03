import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { csvResponse } from "@/lib/csv";
import { displayDrugCode } from "@/lib/drug-code";
import { formatAppDateYmd } from "@/lib/app-timezone";
import { productCategoryLabel } from "@/lib/product-categories";
import { productTypeLabel } from "@/lib/product-types";
import { parseProductStockFilter, queryProductList } from "@/lib/products-list-query";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rows = await queryProductList({
    storeId: ctx.activeStoreId,
    q: searchParams.get("q") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    gst: searchParams.get("gst") ?? undefined,
    stock: parseProductStockFilter(searchParams.get("stock")),
    sort: searchParams.get("sort") ?? undefined,
    dir: searchParams.get("dir") ?? undefined,
  });

  return csvResponse(
    `products-${formatAppDateYmd()}.csv`,
    [
      "Name",
      "Drug code",
      "Brand",
      "Generic",
      "Category",
      "Type",
      "Supplier",
      "Stock",
      "Pack",
      "GST %",
      "Reorder min",
    ],
    rows.map((row) => [
      row.name,
      displayDrugCode(row.sku, row.productCategory),
      row.brandName ?? "",
      row.genericName ?? "",
      productCategoryLabel(row.productCategory),
      productTypeLabel(row.productType),
      row.suppliers ?? "",
      row.stockQty,
      row.packSize,
      row.gstPct,
      row.reorderMin,
    ]),
  );
}
