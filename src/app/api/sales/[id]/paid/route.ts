import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  paid: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const sale = await prisma.sale.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    select: { id: true, billNo: true },
  });
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.sale.update({
    where: { id: sale.id },
    data: { paid: parsed.data.paid },
    select: { id: true, billNo: true, paid: true },
  });

  return NextResponse.json({ sale: updated });
}
