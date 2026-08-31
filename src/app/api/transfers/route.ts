import { NextResponse } from "next/server";
import { z } from "zod";
import { createdAtDayRange, trimDateParam } from "@/lib/date-range-filter";
import { getAuthContext, isManager, isManagerOfStore } from "@/lib/auth-context";
import { executeStockTransferInTransaction } from "@/lib/inventory-lot-transfer";
import { parseListLimitParam } from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import { storeUpperOpt } from "@/lib/store-text";

const lineSchema = z.object({
  sourceLotId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const postSchema = z.object({
  toStoreId: z.string().min(1),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

function transferApiError(err: unknown): { status: number; error: string } {
  const msg = err instanceof Error ? err.message : "";
  switch (msg) {
    case "same_store":
      return { status: 400, error: "Source and destination store must differ" };
    case "no_lines":
      return { status: 400, error: "Add at least one line" };
    case "invalid_qty":
      return { status: 400, error: "Invalid quantity" };
    case "duplicate_lot":
      return { status: 400, error: "Each batch can only appear once per transfer" };
    case "lot_not_found":
      return { status: 400, error: "Batch not found" };
    case "lot_wrong_store":
      return { status: 400, error: "Batch does not belong to this store" };
    case "expired_lot":
      return { status: 409, error: "Cannot transfer expired batches" };
    case "short_stock":
      return { status: 409, error: "Insufficient stock for one or more batches" };
    case "no_settings":
      return { status: 400, error: "Store settings missing" };
    case "dest_store_not_found":
      return { status: 400, error: "Destination store not found" };
    default:
      return { status: 400, error: "Could not complete transfer" };
  }
}

function parseDirection(raw: string | null): "in" | "out" | "all" {
  if (raw === "in" || raw === "out") return raw;
  return "all";
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const direction = parseDirection(searchParams.get("direction"));
  const from = trimDateParam(searchParams.get("from"));
  const to = trimDateParam(searchParams.get("to"));
  const dateFilter = createdAtDayRange(from, to);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = parseListLimitParam(searchParams.get("limit"));
  const skip = (page - 1) * limit;

  const storeId = ctx.activeStoreId;
  const directionWhere =
    direction === "in"
      ? { toStoreId: storeId }
      : direction === "out"
        ? { fromStoreId: storeId }
        : { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] };

  const where = {
    ...directionWhere,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const [transfers, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        fromStore: { select: { id: true, name: true } },
        toStore: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.stockTransfer.count({ where }),
  ]);

  return NextResponse.json({
    transfers: transfers.map((t) => ({
      id: t.id,
      transferNo: t.transferNo,
      fromStoreId: t.fromStoreId,
      toStoreId: t.toStoreId,
      fromStoreName: t.fromStore.name,
      toStoreName: t.toStore.name,
      notes: t.notes,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      createdByName: t.createdBy.name,
      lineCount: t._count.lines,
      direction: t.fromStoreId === storeId ? "out" : "in",
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const fromStoreId = ctx.activeStoreId;
  const { toStoreId, lines } = parsed.data;

  if (!isManagerOfStore(ctx, fromStoreId)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }

  const destStore = await prisma.store.findUnique({
    where: { id: toStoreId },
    select: { id: true },
  });
  if (!destStore) {
    return NextResponse.json({ error: "Destination store not found" }, { status: 400 });
  }
  if (toStoreId === fromStoreId) {
    return NextResponse.json({ error: "Source and destination store must differ" }, { status: 400 });
  }

  try {
    const transfer = await prisma.$transaction(
      async (tx) =>
        executeStockTransferInTransaction(tx, {
          fromStoreId,
          toStoreId,
          createdById: ctx.user.id,
          notes: storeUpperOpt(parsed.data.notes) ?? null,
          lines,
        }),
      { maxWait: 10_000, timeout: 30_000 },
    );

    return NextResponse.json({ transfer });
  } catch (e) {
    console.error(e);
    const { status, error } = transferApiError(e);
    return NextResponse.json({ error }, { status });
  }
}
