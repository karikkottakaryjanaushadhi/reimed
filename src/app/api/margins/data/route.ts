import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { isAdminPasswordConfigured, verifyAdminPassword } from "@/lib/admin-access";
import { loadMarginsReport } from "@/lib/margins-report";

const bodySchema = z.object({
  password: z.string().min(1).max(200),
  page: z.string().optional(),
  limit: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  view: z.string().optional(),
  product: z.string().optional(),
  bill: z.string().optional(),
  sort: z.string().optional(),
  dir: z.string().optional(),
});

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isManager(ctx)) {
    return NextResponse.json({ error: "Managers only" }, { status: 403 });
  }
  if (!isAdminPasswordConfigured()) {
    return NextResponse.json({ error: "Admin password is not configured on this server" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!verifyAdminPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const { password: _pw, ...query } = parsed.data;
  const report = await loadMarginsReport(ctx.activeStoreId, query);
  return NextResponse.json({ report });
}
