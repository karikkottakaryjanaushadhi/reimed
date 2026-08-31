import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { StaffForm, type StaffFormInitial } from "../../staff-form";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) redirect("/dashboard/staff");

  const { id } = await params;
  const row = await prisma.storeUser.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    include: { user: { select: { email: true, name: true, active: true } } },
  });
  if (!row) notFound();

  const initial: StaffFormInitial = {
    storeUserId: row.id,
    email: row.user.email,
    name: row.user.name,
    role: row.role as "MANAGER" | "CASHIER",
    active: row.user.active,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Edit staff ({ctx.membership.store.name})
        </h1>
        <Link href="/dashboard/staff" className="text-sm font-medium text-brand-blue-light hover:underline">
          Staff list →
        </Link>
      </div>
      <StaffForm storeId={ctx.activeStoreId} initial={initial} />
    </div>
  );
}
