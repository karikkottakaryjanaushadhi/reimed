import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { StoreEditForm } from "../../store-edit-form";

export default async function EditStorePage({ params }: { params: Promise<{ storeId: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  const { storeId } = await params;
  const m = ctx.memberships.find((x) => x.storeId === storeId && x.role === "MANAGER");
  if (!m) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">
        Only a <strong>manager</strong> of this store can edit its details. Switch store in the header or ask a manager.
      </p>
    );
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Edit shop / bill header</h1>
        <Link href="/dashboard/stores" className="text-sm font-medium text-brand-blue-light hover:underline">
          Store list →
        </Link>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        These fields appear on the dot-matrix bill print (POS). Short <strong>name</strong> stays in the app;{" "}
        <strong>bill shop name</strong> is the large printed title when set.
      </p>
      <StoreEditForm
        initial={{
          id: store.id,
          name: store.name,
          billShopName: store.billShopName,
          address: store.address,
          phone: store.phone,
          gstin: store.gstin,
          drugLicenseLine: store.drugLicenseLine,
          email: store.email,
          billTerms: store.billTerms,
        }}
      />
    </div>
  );
}
