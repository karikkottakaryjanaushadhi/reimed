import { timingSafeEqual } from "crypto";

export function getAdminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD?.trim();
  return p || null;
}

export function isAdminPasswordConfigured(): boolean {
  return getAdminPassword() !== null;
}

/** Constant-time compare against env ADMIN_PASSWORD. */
export function verifyAdminPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (!expected || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
