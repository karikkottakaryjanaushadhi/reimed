import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { SaleReturnForm } from "./SaleReturnForm";

export default async function SaleReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const exists = await prisma.sale.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    select: { id: true },
  });
  if (!exists) notFound();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/dashboard/sales" className="text-sm font-medium text-brand-blue-light hover:underline">
            ← Sales history
          </Link>
          <Link href={`/dashboard/sales/${id}`} className="text-sm font-medium text-brand-blue-light hover:underline">
            View bill
          </Link>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sales return</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stock is added back to the same batch that was billed. Credit amounts follow the original line discounts.
        </p>
      </div>
      <SaleReturnForm saleId={id} />
    </div>
  );
}
