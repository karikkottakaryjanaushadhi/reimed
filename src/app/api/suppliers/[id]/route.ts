import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { normalizeStoreEmail, storeUpper, storeUpperOpt } from "@/lib/store-text";

const updateSchema = z.object({
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

  const existing = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;
  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      name: storeUpper(d.name),
      phone: storeUpperOpt(d.phone),
      phoneAlt: storeUpperOpt(d.phoneAlt),
      email: normalizeStoreEmail(d.email || undefined),
      address: storeUpperOpt(d.address),
      gstin: storeUpperOpt(d.gstin),
      company: storeUpperOpt(d.company),
      contactPerson: storeUpperOpt(d.contactPerson),
      drugLicense1: storeUpperOpt(d.drugLicense1),
      drugLicense2: storeUpperOpt(d.drugLicense2),
    },
  });

  return NextResponse.json({ supplier });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.supplier.findUnique({
    where: { id },
    select: { id: true, _count: { select: { purchases: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing._count.purchases > 0) {
    return NextResponse.json(
      { error: "This supplier has purchase invoices and cannot be deleted." },
      { status: 409 },
    );
  }

  await prisma.supplier.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
