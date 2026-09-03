import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { csvResponse } from "@/lib/csv";
import { formatAppDateYmd } from "@/lib/app-timezone";
import { loadProductwiseSalesReport } from "@/lib/productwise-sales-report";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const today = formatAppDateYmd();
  const from = searchParams.get("from")?.trim() || today;
  const to = searchParams.get("to")?.trim() || today;
  const product = searchParams.get("product")?.trim() || "";
  const sort = searchParams.get("sort") ?? undefined;
  const dir = searchParams.get("dir") ?? undefined;

  const rows = await loadProductwiseSalesReport({
    storeId: ctx.activeStoreId,
    from,
    to,
    product,
    sort,
    dir,
  });

  return csvResponse(
    `productwise-sales-${from}-to-${to}.csv`,
    [
      "Product",
      "Supplier",
      "Net qty",
      "Return qty",
      "Remaining qty",
      "Bills",
      "Gross",
      "Discount",
      "Returns",
      "Net",
      "Tax",
      "Cost",
    ],
    rows.map((row) => [
      row.productName,
      row.supplier ?? "",
      row.quantity,
      row.returnQty,
      row.remainingQty,
      row.billCount,
      row.gross.toFixed(2),
      row.discount.toFixed(2),
      row.returnCredits.toFixed(2),
      row.netRevenue.toFixed(2),
      row.tax.toFixed(2),
      row.cost.toFixed(2),
    ]),
  );
}
