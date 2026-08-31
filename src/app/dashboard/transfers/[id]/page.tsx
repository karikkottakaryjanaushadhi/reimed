import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatAppDateTime, formatAppDateShort } from "@/lib/app-timezone";
import { getAuthContext, isManager, isMemberOfStore } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

type RouteCtx = { params: Promise<{ id: string }> };

export default async function TransferDetailPage({ params }: RouteCtx) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      lines: {
        orderBy: [{ batchNo: "asc" }, { expiryDate: "asc" }],
        include: {
          product: { select: { name: true, packSize: true } },
        },
      },
    },
  });

  if (!transfer) notFound();
  if (!isMemberOfStore(ctx, transfer.fromStoreId) && !isMemberOfStore(ctx, transfer.toStoreId)) {
    notFound();
  }

  const direction =
    transfer.fromStoreId === ctx.activeStoreId
      ? "out"
      : transfer.toStoreId === ctx.activeStoreId
        ? "in"
        : null;
  const totalUnits = transfer.lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/transfers" className="text-sm font-medium text-brand-blue-light hover:underline">
          ← Transfer history
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Transfer #{transfer.transferNo}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {direction === "out" ? "Sent" : direction === "in" ? "Received" : "Viewing"} ·{" "}
          {formatAppDateTime(transfer.createdAt)}
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">From</p>
          <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">{transfer.fromStore.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">To</p>
          <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">{transfer.toStore.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recorded by</p>
          <p className="mt-1">{transfer.createdBy.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</p>
          <p className="mt-1 capitalize">{transfer.status.toLowerCase().replace("_", " ")}</p>
        </div>
        {transfer.notes ? (
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Notes</p>
            <p className="mt-1 whitespace-pre-wrap">{transfer.notes}</p>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3 text-right">Qty (units)</th>
            </tr>
          </thead>
          <tbody>
            {transfer.lines.map((l) => (
              <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3">{l.product.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{l.batchNo}</td>
                <td className="px-4 py-3">{formatAppDateShort(l.expiryDate)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{l.quantity}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-zinc-50 text-sm font-semibold dark:bg-zinc-800">
            <tr className="border-t border-zinc-200 dark:border-zinc-700">
              <td colSpan={3} className="px-4 py-3 text-right">
                Total units
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{totalUnits}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {isManager(ctx) ? (
        <Link
          href="/dashboard/transfers/new"
          className="inline-block text-sm font-medium text-brand-blue-light hover:underline"
        >
          New transfer →
        </Link>
      ) : null}
    </div>
  );
}
