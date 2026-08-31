import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { PurchaseForm } from "../purchase-form";

export default async function NewPurchasePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">Purchases are available to store managers only.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">New purchase</h1>
        <Link
          href="/dashboard/purchases"
          className="text-sm font-medium text-brand-blue-light hover:underline"
        >
          Purchase list →
        </Link>
      </div>
      <PurchaseForm storeId={ctx.activeStoreId} />
    </div>
  );
}
