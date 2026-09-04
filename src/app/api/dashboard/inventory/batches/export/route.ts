import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { formatAppDateYmd } from "@/lib/app-timezone";
import { csvResponse } from "@/lib/csv";
import { inventoryLotMarginPercent } from "@/lib/inventory-lot-margin";
import {
  queryInventoryBatches,
  resolveInventoryBatchesFilters,
} from "@/lib/inventory-batches-list-query";
import { productCategoryLabel } from "@/lib/product-categories";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filters = await resolveInventoryBatchesFilters({
    storeId: ctx.activeStoreId,
    q: searchParams.get("q") ?? undefined,
    supplierId: searchParams.get("supplierId") ?? undefined,
    brandId: searchParams.get("brandId") ?? undefined,
    expiry: searchParams.get("expiry") ?? undefined,
    expiryOn: searchParams.get("expiryOn") ?? undefined,
    lowStock: searchParams.get("lowStock") === "1",
  });

  const rows = await queryInventoryBatches({
    storeId: ctx.activeStoreId,
    filters,
    sort: searchParams.get("sort") ?? undefined,
    dir: searchParams.get("dir") ?? undefined,
  });

  return csvResponse(
    `batches-expiry-${formatAppDateYmd()}.csv`,
    [
      "Product",
      "Brand",
      "Category",
      "GST %",
      "Pack",
      "Supplier",
      "Batch No",
      "Expiry",
      "Days",
      "Qty",
      "Reorder",
      "Cost",
      "MRP",
      "Sale rate",
      "Disc %",
      "Disc Rs",
      "Margin %",
      "Counted OK",
    ],
    rows.map((row) => {
      const margin = inventoryLotMarginPercent(
        row.costPrice,
        row.mrp,
        row.saleRate,
        row.packSize,
        row.gstPct,
      );
      return [
        row.productName,
        row.brandName ?? "",
        productCategoryLabel(row.productCategory),
        row.gstPct,
        row.packSize,
        row.supplierName ?? "",
        row.batchNo,
        formatAppDateYmd(row.expiryDate),
        row.days,
        row.quantity,
        row.reorderMin,
        row.costPrice.toFixed(2),
        row.mrp.toFixed(2),
        row.saleRate.toFixed(2),
        row.salesDiscountPct.toFixed(2),
        row.salesDiscountRs.toFixed(2),
        margin == null ? "" : margin.toFixed(2),
        row.stockCorrected ? "Yes" : "No",
      ];
    }),
  );
}
