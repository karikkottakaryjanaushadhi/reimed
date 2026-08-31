import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { BrandForm } from "../brand-form";

export default async function NewBrandPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    redirect("/dashboard/brands");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Add brand</h1>
        <Link href="/dashboard/brands" className="text-sm font-medium text-brand-blue-light hover:underline">
          Brand list →
        </Link>
      </div>
      <BrandForm />
    </div>
  );
}
