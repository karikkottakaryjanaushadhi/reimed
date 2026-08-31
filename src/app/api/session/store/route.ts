import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth-context";
import { STORE_COOKIE } from "@/lib/constants";

const bodySchema = z.object({
  storeId: z.string().min(1),
});

function cookieBase() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const allowed = ctx.memberships.some((m) => m.storeId === parsed.data.storeId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const res = NextResponse.json({ ok: true, storeId: parsed.data.storeId });
  res.cookies.set(STORE_COOKIE, parsed.data.storeId, { ...cookieBase(), maxAge: 60 * 60 * 24 * 365 });
  return res;
}
