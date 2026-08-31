import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { SupplierForm } from "../supplier-form";

export default async function NewSupplierPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    redirect("/dashboard/suppliers");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Add supplier</h1>
        <Link href="/dashboard/suppliers" className="text-sm font-medium text-brand-blue-light hover:underline">
          Supplier list →
        </Link>
      </div>
      <SupplierForm />
    </div>
  );
}
