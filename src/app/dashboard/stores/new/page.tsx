import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { NewStoreForm } from "../new-store-form";

export default async function NewStorePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return <p className="text-zinc-600 dark:text-zinc-400">Only managers can open new stores.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Register store</h1>
        <Link href="/dashboard/stores" className="text-sm font-medium text-brand-blue-light hover:underline">
          Store list →
        </Link>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        After creating a store, add staff from the{" "}
        <Link className="text-brand-blue-light underline" href="/dashboard/staff/new">
          Add staff
        </Link>{" "}
        page (while that store is selected).
      </p>
      <NewStoreForm />
    </div>
  );
}
