import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { StaffDeleteButton } from "./staff-delete-button";

export default async function StaffPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return <p className="text-zinc-600 dark:text-zinc-400">Only managers can manage staff for this store.</p>;
  }

  const rows = await prisma.storeUser.findMany({
    where: { storeId: ctx.activeStoreId },
    include: { user: { select: { email: true, name: true, active: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Staff ({ctx.membership.store.name})</h1>
        <Link href="/dashboard/staff/new" className="text-sm font-medium text-brand-blue-light hover:underline">
          Add staff →
        </Link>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 font-medium">{r.user.name}</div>
              <span className="flex shrink-0 items-center gap-3">
                <Link
                  href={`/dashboard/staff/${r.id}/edit`}
                  className="text-sm font-medium text-brand-blue-light hover:underline"
                >
                  Edit
                </Link>
                {r.userId !== ctx.user.id ? (
                  <StaffDeleteButton
                    storeId={ctx.activeStoreId}
                    storeUserId={r.id}
                    name={r.user.name}
                  />
                ) : null}
              </span>
            </div>
            <div className="text-sm text-zinc-500">
              {r.user.email} · {r.role} {!r.user.active ? "(inactive)" : ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
