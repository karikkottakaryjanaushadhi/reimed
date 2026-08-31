import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { SESSION_COOKIE, STORE_COOKIE } from "./constants";

/** HS256 needs a sufficient secret; pad short dev values. */
export function getJwtSecretBytes() {
  const s = process.env.SESSION_SECRET || "dev-insecure-change-me-32chars!!";
  const normalized = s.length >= 32 ? s : s.padEnd(32, "x");
  return new TextEncoder().encode(normalized);
}

export async function signSessionToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretBytes());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getJwtSecretBytes());
  return typeof payload.sub === "string" ? payload.sub : null;
}

export async function setSessionCookies(userId: string, defaultStoreId: string) {
  const jar = await cookies();
  const token = await signSessionToken(userId);
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  jar.set(STORE_COOKIE, defaultStoreId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(STORE_COOKIE);
}

export async function setActiveStoreCookie(storeId: string) {
  const jar = await cookies();
  jar.set(STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
}
