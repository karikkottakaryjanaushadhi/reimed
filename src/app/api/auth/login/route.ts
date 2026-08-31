import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { signSessionToken } from "@/lib/session";
import { SESSION_COOKIE, STORE_COOKIE } from "@/lib/constants";

const bodySchema = z.object({
  /** Store logins (e.g. admin@19233) — not strict RFC email. */
  email: z.string().trim().min(1).max(120),
  password: z.string().min(1),
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
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { memberships: { take: 1, orderBy: { createdAt: "asc" } } },
  });
  if (!user?.active) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const defaultStoreId = user.memberships[0]?.storeId;
  if (!defaultStoreId) {
    return NextResponse.json({ error: "No store assigned" }, { status: 403 });
  }

  const token = await signSessionToken(user.id);
  const res = NextResponse.json({ ok: true, userId: user.id });
  res.cookies.set(SESSION_COOKIE, token, { ...cookieBase(), maxAge: 60 * 60 * 24 * 7 });
  res.cookies.set(STORE_COOKIE, defaultStoreId, { ...cookieBase(), maxAge: 60 * 60 * 24 * 365 });
  return res;
}
