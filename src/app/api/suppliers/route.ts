import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { compactSearchKey } from "@/lib/search-normalize";
import { normalizeStoreEmail, storeUpper, storeUpperOpt } from "@/lib/store-text";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (!q) {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
      take: 80,
      select: { id: true, name: true },
    });
    return NextResponse.json({ suppliers });
  }

  const needle = compactSearchKey(q).replace(/%/g, "").replace(/_/g, "");
  if (!needle) {
    return NextResponse.json({ suppliers: [] });
  }
  const likePat = `%${needle}%`;

  const suppliers = await prisma.$queryRaw<Array<{ id: string; name: string }>>(
    Prisma.sql`
      SELECT "id", "name" FROM "Supplier"
      WHERE replace(lower("name"), ' ', '') LIKE ${likePat}
         OR replace(lower(COALESCE("company", '')), ' ', '') LIKE ${likePat}
         OR replace(lower(COALESCE("gstin", '')), ' ', '') LIKE ${likePat}
      ORDER BY "name" ASC
      LIMIT 50
    `,
  );

  return NextResponse.json({ suppliers });
}

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  phoneAlt: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  gstin: z.string().optional(),
  company: z.string().optional(),
  contactPerson: z.string().optional(),
  drugLicense1: z.string().optional(),
  drugLicense2: z.string().optional(),
});

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const s = await prisma.supplier.create({
    data: {
      name: storeUpper(parsed.data.name),
      phone: storeUpperOpt(parsed.data.phone),
      phoneAlt: storeUpperOpt(parsed.data.phoneAlt),
      email: normalizeStoreEmail(parsed.data.email || undefined),
      address: storeUpperOpt(parsed.data.address),
      gstin: storeUpperOpt(parsed.data.gstin),
      company: storeUpperOpt(parsed.data.company),
      contactPerson: storeUpperOpt(parsed.data.contactPerson),
      drugLicense1: storeUpperOpt(parsed.data.drugLicense1),
      drugLicense2: storeUpperOpt(parsed.data.drugLicense2),
    },
  });
  return NextResponse.json({ supplier: s });
}
