import Link from "next/link";
import { redirect } from "next/navigation";
import { formatAppDateTime } from "@/lib/app-timezone";
import { SalesReturnsListMobile } from "@/app/dashboard/sales/sales-returns-list-mobile";
import { getAuthContext } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";

export default async function SalesReturnsLogPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const returns = await prisma.saleReturn.findMany({
    where: { storeId: ctx.activeStoreId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      sale: { select: { id: true, billNo: true } },
      createdBy: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });

  const returnsPageCreditTotal = returns.reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/sales" className="text-sm font-medium text-brand-blue-light hover:underline">
            ← Sales history
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Sales returns</h1>
          <p className="mt-1 text-sm text-zinc-500">Recent returns for this store (newest first).</p>
        </div>
      </div>

      <SalesReturnsListMobile
        returns={returns.map((r) => ({
          id: r.id,
          createdAtIso: r.createdAt.toISOString(),
          saleId: r.sale.id,
          billNo: r.sale.billNo,
          lineCount: r._count.lines,
          createdByName: r.createdBy.name,
          total: Number(r.total),
        }))}
        creditTotal={returnsPageCreditTotal}
      />

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Original bill</th>
              <th className="px-4 py-3">Lines</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 text-zinc-600">{formatAppDateTime(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/sales/${r.sale.id}`}
                    className="font-medium text-brand-blue-light hover:underline"
                  >
                    #{r.sale.billNo}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums">{r._count.lines}</td>
                <td className="px-4 py-3">{r.createdBy.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">₹{Number(r.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          {returns.length > 0 ? (
            <tfoot className="bg-zinc-50 text-sm font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <td colSpan={4} className="px-4 py-3 text-right">
                  Credits (this list, max 100)
                </td>
                <td className="px-4 py-3 text-right tabular-nums">₹{returnsPageCreditTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
        {returns.length === 0 ? (
          <p className="px-4 py-8 text-center text-zinc-500">No returns recorded yet.</p>
        ) : null}
      </div>
    </div>
  );
}
