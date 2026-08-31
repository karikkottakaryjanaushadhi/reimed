import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { storeUpper } from "@/lib/store-text";

const addSchema = z.object({
  /** Store login id (e.g. admin@22370) — stored in User.email, not strict RFC email. */
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(["MANAGER", "CASHIER"]),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId } = await params;
  if (storeId !== ctx.activeStoreId) {
    return NextResponse.json({ error: "Switch store first" }, { status: 400 });
  }
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const rows = await prisma.storeUser.findMany({
    where: { storeId },
    include: { user: { select: { id: true, email: true, name: true, active: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    staff: rows.map((r) => ({
      id: r.id,
      role: r.role,
      user: r.user,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId } = await params;
  if (storeId !== ctx.activeStoreId) {
    return NextResponse.json({ error: "Switch store first" }, { status: 400 });
  }
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const email = parsed.data.username.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);

  const displayName = storeUpper(parsed.data.name);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name: displayName, active: true },
    create: { email, passwordHash, name: displayName },
  });

  await prisma.storeUser.upsert({
    where: { userId_storeId: { userId: user.id, storeId } },
    update: { role: parsed.data.role },
    create: { userId: user.id, storeId, role: parsed.data.role },
  });

  return NextResponse.json({ ok: true, userId: user.id });
}
