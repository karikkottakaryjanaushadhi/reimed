import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { StaffForm } from "../staff-form";

export default async function NewStaffPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return <p className="text-zinc-600 dark:text-zinc-400">Only managers can manage staff for this store.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Add staff ({ctx.membership.store.name})</h1>
        <Link href="/dashboard/staff" className="text-sm font-medium text-brand-blue-light hover:underline">
          Staff list →
        </Link>
      </div>
      <StaffForm storeId={ctx.activeStoreId} />
    </div>
  );
}
