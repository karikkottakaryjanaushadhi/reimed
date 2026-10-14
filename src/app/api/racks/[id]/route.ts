import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import {
  DUPLICATE_RACK_CODE_ERROR,
  INVALID_RACK_CODE_ERROR,
  isRackCode,
  normalizeRackCode,
} from "@/lib/product-racks";

const updateSchema = z.object({
  code: z.string().min(1),
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

  const existing = await prisma.rack.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const code = normalizeRackCode(parsed.data.code);
  if (!isRackCode(code)) {
    return NextResponse.json({ error: INVALID_RACK_CODE_ERROR }, { status: 400 });
  }

  try {
    const rack = await prisma.rack.update({ where: { id }, data: { code } });
    return NextResponse.json({ rack });
  } catch {
    return NextResponse.json({ error: DUPLICATE_RACK_CODE_ERROR }, { status: 409 });
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
  const existing = await prisma.rack.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.rack.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
