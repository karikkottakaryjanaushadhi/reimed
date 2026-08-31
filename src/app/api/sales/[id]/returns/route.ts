import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { returnLineRefundInclusive } from "@/lib/sale-return";

const bodySchema = z.object({
  note: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        saleLineId: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: saleId } = await params;
  const storeId = ctx.activeStoreId;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const linesInput = parsed.data.lines.filter((l) => l.qty > 0);
  if (linesInput.length === 0) {
    return NextResponse.json({ error: "At least one line with qty is required" }, { status: 400 });
  }

  const byLineId = new Map<string, number>();
  for (const l of linesInput) {
    byLineId.set(l.saleLineId, (byLineId.get(l.saleLineId) ?? 0) + l.qty);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, storeId },
        include: {
          lines: {
            include: {
              lot: { select: { id: true, storeId: true } },
            },
          },
        },
      });
      if (!sale) throw new Error("not_found");

      const returnedAgg = await tx.saleReturnLine.groupBy({
        by: ["saleLineId"],
        where: { saleReturn: { saleId, storeId } },
        _sum: { qty: true },
      });
      const alreadyReturned = new Map<string, number>();
      for (const row of returnedAgg) {
        alreadyReturned.set(row.saleLineId, row._sum.qty ?? 0);
      }

      type Resolved = {
        saleLineId: string;
        lotId: string;
        qty: number;
        refundTotal: number;
      };
      const resolved: Resolved[] = [];

      for (const [saleLineId, qty] of byLineId) {
        const line = sale.lines.find((sl) => sl.id === saleLineId);
        if (!line) throw new Error("bad_line");
        if (line.lot.storeId !== storeId) throw new Error("bad_lot");

        const prev = alreadyReturned.get(saleLineId) ?? 0;
        const maxReturn = line.qty - prev;
        if (qty > maxReturn) throw new Error("qty_exceeded");

        const refundTotal = returnLineRefundInclusive(
          line.qty,
          qty,
          Number(line.amount),
          Number(line.discountAmount),
        );
        resolved.push({ saleLineId, lotId: line.lotId, qty, refundTotal });
      }

      const totalNum = Math.round(resolved.reduce((s, r) => s + r.refundTotal, 0) * 100) / 100;
      if (totalNum <= 0) throw new Error("zero_total");

      const saleReturn = await tx.saleReturn.create({
        data: {
          storeId,
          saleId,
          createdById: ctx.user.id,
          note: parsed.data.note?.trim() || null,
          total: new Prisma.Decimal(totalNum.toFixed(2)),
          lines: {
            create: resolved.map((r) => ({
              saleLineId: r.saleLineId,
              qty: r.qty,
              refundTotal: new Prisma.Decimal(r.refundTotal.toFixed(2)),
            })),
          },
        },
      });

      for (const r of resolved) {
        await tx.inventoryLot.update({
          where: { id: r.lotId },
          data: { quantity: { increment: r.qty } },
        });
      }

      return saleReturn;
    });

    return NextResponse.json({
      saleReturn: { id: result.id, total: Number(result.total), createdAt: result.createdAt.toISOString() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (msg === "bad_line") return NextResponse.json({ error: "Line does not belong to this bill" }, { status: 400 });
    if (msg === "bad_lot") return NextResponse.json({ error: "Invalid batch for this store" }, { status: 400 });
    if (msg === "qty_exceeded") {
      return NextResponse.json({ error: "Return quantity exceeds what is left on one or more lines" }, { status: 400 });
    }
    if (msg === "zero_total") {
      return NextResponse.json({ error: "Computed refund total is zero" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not record return" }, { status: 400 });
  }
}
