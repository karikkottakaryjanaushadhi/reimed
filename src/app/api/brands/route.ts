import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { compactSearchKey } from "@/lib/search-normalize";
import { storeUpper } from "@/lib/store-text";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    const brands = await prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    });
    return NextResponse.json({ brands });
  }

  const needle = compactSearchKey(q).replace(/%/g, "").replace(/_/g, "");
  if (!needle) {
    return NextResponse.json({ brands: [] });
  }
  const likePat = `%${needle}%`;
  const brands = await prisma.$queryRaw<Array<{ id: string; name: string }>>(
    Prisma.sql`
      SELECT "id", "name" FROM "Brand"
      WHERE replace(lower("name"), ' ', '') LIKE ${likePat}
      ORDER BY "name" ASC
      LIMIT 50
    `,
  );
  return NextResponse.json({ brands });
}

const createSchema = z.object({
  name: z.string().min(1),
});

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const name = storeUpper(parsed.data.name);
  try {
    const b = await prisma.brand.create({ data: { name } });
    return NextResponse.json({ brand: b });
  } catch {
    return NextResponse.json({ error: "A brand with this name already exists" }, { status: 409 });
  }
}
