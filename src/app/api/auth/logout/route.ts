import { NextResponse } from "next/server";
import { SESSION_COOKIE, STORE_COOKIE } from "@/lib/constants";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(STORE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
