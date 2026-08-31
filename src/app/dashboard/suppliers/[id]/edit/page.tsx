import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { SupplierForm, type SupplierFormInitial } from "../../supplier-form";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) redirect("/dashboard/suppliers");

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  const initial: SupplierFormInitial = {
    id: supplier.id,
    name: supplier.name,
    company: supplier.company,
    contactPerson: supplier.contactPerson,
    phone: supplier.phone,
    phoneAlt: supplier.phoneAlt,
    email: supplier.email,
    address: supplier.address,
    gstin: supplier.gstin,
    drugLicense1: supplier.drugLicense1,
    drugLicense2: supplier.drugLicense2,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Edit supplier</h1>
        <Link href="/dashboard/suppliers" className="text-sm font-medium text-brand-blue-light hover:underline">
          Supplier list →
        </Link>
      </div>
      <SupplierForm initial={initial} />
    </div>
  );
}
