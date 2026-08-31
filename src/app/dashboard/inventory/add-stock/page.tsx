import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { AddStockPageClient } from "./add-stock-page-client";

export default async function AddStockPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; productName?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) redirect("/dashboard/inventory/batches");

  const sp = await searchParams;
  const productId = String(sp.productId ?? "").trim();
  const productName = String(sp.productName ?? "").trim();
  const initialProduct =
    productId && productName ? { id: productId, name: productName } : productId ? { id: productId, name: "" } : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Add to stock</h1>
        <Link href="/dashboard/inventory/batches" className="text-sm font-medium text-brand-blue-light hover:underline">
          Batches & expiry →
        </Link>
      </div>
      <AddStockPageClient initialProduct={initialProduct} />
    </div>
  );
}
