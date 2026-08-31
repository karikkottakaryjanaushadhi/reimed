import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { normalizeStoreEmail, storeBillTermsNull, storeUpper, storeUpperOpt, storeUpperNull } from "@/lib/store-text";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    stores: ctx.memberships.map((m) => ({
      id: m.store.id,
      name: m.store.name,
      billShopName: m.store.billShopName,
      phone: m.store.phone,
      address: m.store.address,
      gstin: m.store.gstin,
      email: m.store.email,
      role: m.role,
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  billShopName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  gstin: z.string().optional(),
  drugLicenseLine: z.string().optional(),
  email: z.string().optional(),
  billTerms: z.string().optional(),
});

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }
  const canCreate = ctx.memberships.some((m) => m.role === "MANAGER");
  if (!canCreate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const store = await prisma.$transaction(async (tx) => {
    const s = await tx.store.create({
      data: {
        name: storeUpper(parsed.data.name),
        billShopName: storeUpperNull(parsed.data.billShopName),
        address: storeUpperOpt(parsed.data.address),
        phone: storeUpperOpt(parsed.data.phone),
        gstin: storeUpperOpt(parsed.data.gstin),
        drugLicenseLine: storeUpperOpt(parsed.data.drugLicenseLine),
        email: normalizeStoreEmail(parsed.data.email) ?? null,
        billTerms: storeBillTermsNull(parsed.data.billTerms),
        settings: { create: { nextBillNo: 1, nextPurchaseNo: 1 } },
      },
    });
    await tx.storeUser.create({
      data: { userId: ctx.user.id, storeId: s.id, role: "MANAGER" },
    });
    return s;
  });

  return NextResponse.json({ store: { id: store.id, name: store.name } });
}
