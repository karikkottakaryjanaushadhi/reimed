import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { SESSION_COOKIE, STORE_COOKIE } from "./constants";
import { verifySessionToken } from "./session";

type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type AuthMembership = {
  storeId: string;
  role: string;
  store: {
    id: string;
    name: string;
    billShopName: string | null;
    phone: string | null;
    address: string | null;
    gstin: string | null;
    email: string | null;
  };
};

export type AuthContext = {
  user: AuthUser;
  memberships: AuthMembership[];
  activeStoreId: string;
  membership: AuthMembership;
};

export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let userId: string;
  try {
    const sub = await verifySessionToken(token);
    if (!sub) return null;
    userId = sub;
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId, active: true },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: {
        select: {
          storeId: true,
          role: true,
          store: {
            select: {
              id: true,
              name: true,
              billShopName: true,
              phone: true,
              address: true,
              gstin: true,
              email: true,
            },
          },
        },
      },
    },
  });
  if (!user || user.memberships.length === 0) return null;

  const cookieStore = jar.get(STORE_COOKIE)?.value;
  const activeStoreId =
    cookieStore && user.memberships.some((m) => m.storeId === cookieStore)
      ? cookieStore
      : user.memberships[0]!.storeId;

  const membership = user.memberships.find((m) => m.storeId === activeStoreId);
  if (!membership) return null;

  return {
    user,
    memberships: user.memberships,
    activeStoreId,
    membership,
  };
});

export function isManager(ctx: AuthContext) {
  return ctx.membership.role === "MANAGER";
}

export function isMemberOfStore(ctx: AuthContext, storeId: string) {
  return ctx.memberships.some((m) => m.storeId === storeId);
}

export function membershipForStore(ctx: AuthContext, storeId: string) {
  return ctx.memberships.find((m) => m.storeId === storeId) ?? null;
}

export function isManagerOfStore(ctx: AuthContext, storeId: string) {
  const m = membershipForStore(ctx, storeId);
  return m?.role === "MANAGER";
}
