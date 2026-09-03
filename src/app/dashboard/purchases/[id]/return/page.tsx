import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { PurchaseReturnForm } from "./PurchaseReturnForm";

export default async function PurchaseReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">Purchase returns are available to store managers only.</p>
    );
  }

  const { id } = await params;
  const exists = await prisma.purchase.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    select: { id: true },
  });
  if (!exists) notFound();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            href="/dashboard/purchases"
            className="text-sm font-medium text-brand-blue-light hover:underline"
          >
            ← Purchase list
          </Link>
          <Link
            href={`/dashboard/purchases/${id}`}
            className="text-sm font-medium text-brand-blue-light hover:underline"
          >
            View purchase
          </Link>
        </div>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Purchase return</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stock is reduced from the same batch. Credit follows the original line payable (trade qty only;
          free qty is not returned here). Optional supplier credit note number and date can be recorded.
        </p>
      </div>
      <PurchaseReturnForm purchaseId={id} />
    </div>
  );
}
