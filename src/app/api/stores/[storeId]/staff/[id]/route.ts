import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { storeUpper } from "@/lib/store-text";

const patchSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["MANAGER", "CASHIER"]),
  password: z.string().min(1).optional(),
  active: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ storeId: string; id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId, id } = await params;
  if (storeId !== ctx.activeStoreId) {
    return NextResponse.json({ error: "Switch store first" }, { status: 400 });
  }
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const row = await prisma.storeUser.findFirst({
    where: { id, storeId },
    select: { id: true, userId: true, role: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;
  if (row.role === "MANAGER" && d.role === "CASHIER") {
    const managerCount = await prisma.storeUser.count({
      where: { storeId, role: "MANAGER" },
    });
    if (managerCount <= 1) {
      return NextResponse.json({ error: "Cannot demote the only manager for this store." }, { status: 409 });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: row.userId },
      data: {
        name: storeUpper(d.name),
        active: d.active,
        ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}),
      },
    });
    await tx.storeUser.update({
      where: { id },
      data: { role: d.role },
    });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ storeId: string; id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId, id } = await params;
  if (storeId !== ctx.activeStoreId) {
    return NextResponse.json({ error: "Switch store first" }, { status: 400 });
  }
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const row = await prisma.storeUser.findFirst({
    where: { id, storeId },
    select: { id: true, userId: true, role: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.userId === ctx.user.id) {
    return NextResponse.json({ error: "You cannot remove yourself from this store." }, { status: 409 });
  }

  if (row.role === "MANAGER") {
    const managerCount = await prisma.storeUser.count({
      where: { storeId, role: "MANAGER" },
    });
    if (managerCount <= 1) {
      return NextResponse.json({ error: "Cannot remove the only manager for this store." }, { status: 409 });
    }
  }

  await prisma.storeUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
