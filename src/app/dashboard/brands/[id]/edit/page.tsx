import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { BrandForm, type BrandFormInitial } from "../../brand-form";

export default async function EditBrandPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) redirect("/dashboard/brands");

  const { id } = await params;
  const brand = await prisma.brand.findUnique({ where: { id } });
  if (!brand) notFound();

  const initial: BrandFormInitial = { id: brand.id, name: brand.name };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Edit brand</h1>
        <Link href="/dashboard/brands" className="text-sm font-medium text-brand-blue-light hover:underline">
          Brand list →
        </Link>
      </div>
      <BrandForm initial={initial} />
    </div>
  );
}
