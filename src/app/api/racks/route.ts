import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import {
  DUPLICATE_RACK_CODE_ERROR,
  INVALID_RACK_CODE_ERROR,
  isRackCode,
  normalizeRackCode,
  sortRacksByCode,
} from "@/lib/product-racks";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const racks = await prisma.rack.findMany({
    select: { id: true, code: true },
  });
  return NextResponse.json({ racks: sortRacksByCode(racks) });
}

const createSchema = z.object({
  code: z.string().min(1),
});

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const code = normalizeRackCode(parsed.data.code);
  if (!isRackCode(code)) {
    return NextResponse.json({ error: INVALID_RACK_CODE_ERROR }, { status: 400 });
  }

  try {
    const rack = await prisma.rack.create({ data: { code } });
    return NextResponse.json({ rack });
  } catch {
    return NextResponse.json({ error: DUPLICATE_RACK_CODE_ERROR }, { status: 409 });
  }
}
