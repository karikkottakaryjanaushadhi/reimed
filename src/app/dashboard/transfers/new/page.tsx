import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { TransferForm } from "../transfer-form";

export default async function NewTransferPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) redirect("/dashboard/transfers");

  const destinationStores = await prisma.store.findMany({
    where: { id: { not: ctx.activeStoreId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (destinationStores.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">New stock transfer</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          There is no other store to transfer to yet.{" "}
          <Link href="/dashboard/stores/new" className="font-medium text-brand-blue-light hover:underline">
            Register another store
          </Link>
          .
        </p>
        <Link href="/dashboard/transfers" className="text-sm font-medium text-brand-blue-light hover:underline">
          ← Transfer history
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/transfers" className="text-sm font-medium text-brand-blue-light hover:underline">
          ← Transfer history
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">New stock transfer</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Move batches from <strong>{ctx.membership.store.name}</strong> to any other branch. Stock updates
          immediately.
        </p>
      </div>
      <TransferForm fromStoreName={ctx.membership.store.name} destinationStores={destinationStores} />
    </div>
  );
}
