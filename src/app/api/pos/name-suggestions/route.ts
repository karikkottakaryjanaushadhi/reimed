import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { getPosNameSuggestions, type PosNameField } from "@/lib/pos-name-suggestions";

const FIELDS = new Set<PosNameField>(["doctor", "patient"]);

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const field = searchParams.get("field")?.trim() ?? "";
  if (!FIELDS.has(field as PosNameField)) {
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }

  const names = await getPosNameSuggestions({
    storeId: ctx.activeStoreId,
    field: field as PosNameField,
    q: searchParams.get("q") ?? undefined,
  });

  return NextResponse.json(
    { names },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
      },
    },
  );
}
