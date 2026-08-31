import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { getDotmatrixReceiptForSale } from "@/lib/dotmatrix-sale-receipt";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format");

  const receipt = await getDotmatrixReceiptForSale(id, ctx.activeStoreId);
  if (!receipt) return new NextResponse("Not found", { status: 404 });

  if (format === "html") {
    return new NextResponse(receipt.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="bill-${receipt.billNo}.html"`,
      },
    });
  }

  return new NextResponse(receipt.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="bill-${receipt.billNo}.txt"`,
    },
  });
}
