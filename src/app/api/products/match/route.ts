import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { normalizeInvoiceProductName } from "@/lib/invoice-bill";
import { prisma } from "@/lib/prisma";
import { compactSearchKey } from "@/lib/search-normalize";

/** Best-effort match for distributor invoice lines → catalog product */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("name")?.trim() ?? "";
  const normalized = normalizeInvoiceProductName(raw);
  if (!normalized) return NextResponse.json({ product: null });

  const lower = normalized.toLowerCase();

  const words = normalized
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9.-]/g, ""))
    .filter((w) => w.length > 2)
    .slice(0, 4);

  const narrowed = await prisma.product.findMany({
    where:
      words.length > 0
        ? { OR: words.map((w) => ({ name: { contains: w } })) }
        : { name: { contains: normalized.slice(0, 28) } },
    take: 120,
    select: { id: true, name: true, hsn: true },
  });

  const exact = narrowed.find((p) => p.name.toLowerCase() === lower);
  if (exact) return NextResponse.json({ product: exact });

  const candidates = narrowed.filter((p) => {
    const pl = p.name.toLowerCase();
    return (
      pl.includes(lower) ||
      lower.includes(pl) ||
      compactSearchKey(p.name).includes(compactSearchKey(raw))
    );
  });

  if (candidates.length === 1) return NextResponse.json({ product: candidates[0] });

  candidates.sort((a, b) => {
    const al = a.name.toLowerCase();
    const bl = b.name.toLowerCase();
    const as = al === lower ? 0 : al.startsWith(lower.slice(0, Math.min(12, lower.length))) ? 1 : 2;
    const bs = bl === lower ? 0 : bl.startsWith(lower.slice(0, Math.min(12, lower.length))) ? 1 : 2;
    if (as !== bs) return as - bs;
    return Math.abs(a.name.length - normalized.length) - Math.abs(b.name.length - normalized.length);
  });

  const best = candidates[0];
  return NextResponse.json({ product: best ?? null });
}
