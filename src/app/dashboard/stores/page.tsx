import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { StoreDeleteButton } from "./store-delete-button";

export default async function StoresPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return <p className="text-zinc-600 dark:text-zinc-400">Only managers can open new stores.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Stores</h1>
        <Link href="/dashboard/stores/new" className="text-sm font-medium text-brand-blue-light hover:underline">
          Register store →
        </Link>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Switch branches from the header. After creating a store, add staff from the{" "}
        <Link className="text-brand-blue-light underline" href="/dashboard/staff/new">
          Add staff
        </Link>{" "}
        page (while that store is selected).
      </p>
      <ul className="space-y-2">
        {ctx.memberships.map((m) => (
          <li
            key={m.storeId}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{m.store.name}</div>
                <div className="text-xs text-zinc-500">
                  {m.role}
                  {m.storeId === ctx.activeStoreId ? " · current" : ""}
                </div>
              </div>
              {m.role === "MANAGER" ? (
                <span className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/dashboard/stores/${m.storeId}/edit`}
                    className="text-sm font-medium text-brand-blue-light hover:underline"
                  >
                    Edit
                  </Link>
                  <StoreDeleteButton storeId={m.storeId} storeName={m.store.name} />
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
