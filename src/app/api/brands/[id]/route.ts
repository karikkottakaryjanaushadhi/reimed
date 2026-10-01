import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { DUPLICATE_BRAND_NAME_ERROR, findBrandIdByName } from "@/lib/catalog-name-unique";
import { normalizeProductName } from "@/lib/product-name";

const updateSchema = z.object({
  name: z.string().min(1),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const existing = await prisma.brand.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const name = normalizeProductName(parsed.data.name);
  if (!name) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (await findBrandIdByName(prisma, name, id)) {
    return NextResponse.json({ error: DUPLICATE_BRAND_NAME_ERROR }, { status: 409 });
  }
  try {
    const brand = await prisma.brand.update({ where: { id }, data: { name } });
    return NextResponse.json({ brand });
  } catch {
    return NextResponse.json({ error: DUPLICATE_BRAND_NAME_ERROR }, { status: 409 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.brand.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.brand.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
