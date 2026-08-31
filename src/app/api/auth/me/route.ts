import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
    },
    activeStoreId: ctx.activeStoreId,
    role: ctx.membership.role,
    stores: ctx.memberships.map((m) => ({
      id: m.store.id,
      name: m.store.name,
      role: m.role,
    })),
  });
}
