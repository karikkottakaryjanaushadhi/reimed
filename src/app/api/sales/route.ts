import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { type PaymentMode } from "@/lib/constants";
import { randomPlaceholderCustomerName, randomPlaceholderDoctorName } from "@/lib/sale-placeholders";
import { storeUpper, storeUpperOpt } from "@/lib/store-text";
import { posSaleLineInputSchema, resolvePosSaleLinesInTransaction } from "@/lib/sale-checkout-resolve";
import { netSaleTotal, returnCreditsBySaleIds } from "@/lib/sale-return-aggregates";
import { defaultSalePaid } from "@/lib/sale-paid";

const bodySchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  doctorName: z.string().optional(),
  paymentMode: z.enum(["CASH", "CARD", "UPI", "CREDIT"]).optional(),
  paid: z.boolean().optional(),
  lines: z.array(posSaleLineInputSchema).min(1),
});

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.min(Number(searchParams.get("take") ?? "30"), 100);

  const sales = await prisma.sale.findMany({
    where: { storeId: ctx.activeStoreId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      createdBy: { select: { name: true } },
      lines: { include: { product: { select: { name: true } } } },
    },
  });

  const returnCreditsBySale = await returnCreditsBySaleIds(
    ctx.activeStoreId,
    sales.map((s) => s.id),
  );

  return NextResponse.json({
    sales: sales.map((s) => {
      const gross = Number(s.total);
      const returnCredits = returnCreditsBySale.get(s.id) ?? 0;
      return {
        id: s.id,
        billNo: s.billNo,
        createdAt: s.createdAt.toISOString(),
        customerName: s.customerName,
        doctorName: s.doctorName,
        total: gross,
        returnCredits,
        netTotal: netSaleTotal(gross, returnCredits),
        paymentMode: s.paymentMode,
        paid: s.paid,
        createdByName: s.createdBy.name,
        lineCount: s.lines.length,
      };
    }),
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const storeId = ctx.activeStoreId;
  const paymentMode = (parsed.data.paymentMode ?? "CASH") as PaymentMode;
  const paid = parsed.data.paid ?? defaultSalePaid(paymentMode);

  const customerName = storeUpper(
    parsed.data.customerName?.trim() || randomPlaceholderCustomerName(),
  );
  const doctorName = storeUpper(parsed.data.doctorName?.trim() || randomPlaceholderDoctorName());

  try {
    const result = await prisma.$transaction(async (tx) => {
      const settings = await tx.storeSettings.findUnique({ where: { storeId } });
      if (!settings) throw new Error("no settings");

      const billNo = settings.nextBillNo;
      await tx.storeSettings.update({
        where: { storeId },
        data: { nextBillNo: { increment: 1 } },
      });

      const { resolved, subtotal, discount, tax, total } = await resolvePosSaleLinesInTransaction(
        tx,
        storeId,
        parsed.data.lines,
      );

      const sale = await tx.sale.create({
        data: {
          storeId,
          billNo,
          createdById: ctx.user.id,
          customerName,
          customerPhone: storeUpperOpt(parsed.data.customerPhone),
          doctorName,
          subtotal,
          discount,
          tax,
          total,
          paymentMode,
          paid,
          lines: {
            create: resolved.map((r) => ({
              productId: r.productId,
              lotId: r.lotId,
              qty: r.qty,
              rate: r.rate,
              amount: r.amount,
              discountPct: r.discountPct,
              discountAmount: r.discountAmount,
              gstPct: r.gstPct,
              gstAmount: r.gstAmount,
            })),
          },
        },
      });

      for (const r of resolved) {
        await tx.inventoryLot.update({
          where: { id: r.lotId },
          data: { quantity: { decrement: r.qty } },
        });
      }

      return sale;
    });

    return NextResponse.json({ sale: { id: result.id, billNo: result.billNo } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "short_stock") {
      return NextResponse.json({ error: "Insufficient stock for one or more lines" }, { status: 409 });
    }
    if (msg === "invalid_lot") {
      return NextResponse.json({ error: "Invalid batch line" }, { status: 400 });
    }
    if (msg === "expired_lot") {
      return NextResponse.json({ error: "Cannot bill expired batches" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not complete sale" }, { status: 400 });
  }
}
