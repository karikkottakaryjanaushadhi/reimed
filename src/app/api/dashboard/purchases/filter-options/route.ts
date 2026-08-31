import { NextResponse } from "next/server";
import { getAuthContext, isManager } from "@/lib/auth-context";
import {
  getPurchaseFilterOptions,
  type PurchaseDateOn,
  type PurchaseStatusFilter,
} from "@/lib/purchases-filter-options";

function parseDateOn(raw: string | null): PurchaseDateOn {
  return raw === "invoice" ? "invoice" : "recorded";
}

function parseStatus(raw: string | null): PurchaseStatusFilter {
  if (raw === "complete" || raw === "in_progress") return raw;
  return "";
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const options = await getPurchaseFilterOptions({
    storeId: ctx.activeStoreId,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    dateOn: parseDateOn(searchParams.get("dateOn")),
    supplier: searchParams.get("supplier") ?? undefined,
    invoice: searchParams.get("invoice") ?? undefined,
    product: searchParams.get("product") ?? undefined,
    status: parseStatus(searchParams.get("status")),
  });

  return NextResponse.json(options, {
    headers: {
      "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
    },
  });
}
