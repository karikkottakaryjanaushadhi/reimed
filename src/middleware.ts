import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "./lib/constants";
import { getJwtSecretBytes } from "./lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/dashboard")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const u = new URL("/login", req.url);
    u.searchParams.set("from", pathname);
    return NextResponse.redirect(u);
  }

  try {
    await jwtVerify(token, getJwtSecretBytes());
    return NextResponse.next();
  } catch {
    const u = new URL("/login", req.url);
    u.searchParams.set("from", pathname);
    return NextResponse.redirect(u);
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
