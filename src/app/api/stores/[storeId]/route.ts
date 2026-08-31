import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { normalizeStoreEmail, storeBillTermsNull, storeUpper, storeUpperNull } from "@/lib/store-text";

const patchSchema = z.object({
  name: z.string().min(1),
  billShopName: z.string(),
  address: z.string(),
  phone: z.string(),
  gstin: z.string(),
  drugLicenseLine: z.string(),
  email: z.string(),
  billTerms: z.string(),
});

function managerMembership(ctx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>, storeId: string) {
  return ctx.memberships.find((m) => m.storeId === storeId && m.role === "MANAGER") ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId } = await params;
  if (!managerMembership(ctx, storeId)) {
    return NextResponse.json({ error: "Managers only for this store" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const d = parsed.data;
  const data: Prisma.StoreUpdateInput = {
    name: storeUpper(d.name),
    billShopName: storeUpperNull(d.billShopName),
    address: storeUpperNull(d.address),
    phone: storeUpperNull(d.phone),
    gstin: storeUpperNull(d.gstin),
    drugLicenseLine: storeUpperNull(d.drugLicenseLine),
    email: normalizeStoreEmail(d.email) ?? null,
    billTerms: storeBillTermsNull(d.billTerms),
  };

  const store = await prisma.store.update({
    where: { id: storeId },
    data,
  });

  return NextResponse.json({ store: { id: store.id, name: store.name } });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { storeId } = await params;
  if (!managerMembership(ctx, storeId)) {
    return NextResponse.json({ error: "Managers only for this store" }, { status: 403 });
  }

  const existing = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      _count: { select: { sales: true, purchases: true, lots: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing._count.sales > 0 || existing._count.purchases > 0 || existing._count.lots > 0) {
    return NextResponse.json(
      { error: "This store has sales, purchases, or stock and cannot be deleted." },
      { status: 409 },
    );
  }

  if (ctx.memberships.length === 1 && ctx.memberships[0]!.storeId === storeId) {
    return NextResponse.json({ error: "Cannot delete your only store." }, { status: 409 });
  }

  await prisma.store.delete({ where: { id: storeId } });
  return NextResponse.json({ ok: true });
}
