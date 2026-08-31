import { NextResponse } from "next/server";
import { getAuthContext, isMemberOfStore } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteCtx) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      lines: {
        orderBy: [{ batchNo: "asc" }, { expiryDate: "asc" }],
        include: {
          product: { select: { id: true, name: true, packSize: true } },
          sourceLot: { select: { id: true, batchNo: true } },
        },
      },
    },
  });

  if (!transfer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canView =
    isMemberOfStore(ctx, transfer.fromStoreId) || isMemberOfStore(ctx, transfer.toStoreId);
  if (!canView) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    transfer: {
      id: transfer.id,
      transferNo: transfer.transferNo,
      fromStoreId: transfer.fromStoreId,
      toStoreId: transfer.toStoreId,
      fromStoreName: transfer.fromStore.name,
      toStoreName: transfer.toStore.name,
      notes: transfer.notes,
      status: transfer.status,
      createdAt: transfer.createdAt.toISOString(),
      completedAt: transfer.completedAt?.toISOString() ?? null,
      createdBy: transfer.createdBy,
      lines: transfer.lines.map((l) => ({
        id: l.id,
        sourceLotId: l.sourceLotId,
        productId: l.productId,
        productName: l.product.name,
        packSize: l.product.packSize,
        batchNo: l.batchNo,
        expiryDate: l.expiryDate.toISOString(),
        quantity: l.quantity,
      })),
    },
  });
}
