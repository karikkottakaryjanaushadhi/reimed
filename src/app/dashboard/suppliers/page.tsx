import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { supplierOutstandingByStore } from "@/lib/supplier-purchase-outstanding";
import { SupplierDeleteButton } from "./supplier-delete-button";

export default async function SuppliersPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  const outstandingMap = isManager(ctx)
    ? await supplierOutstandingByStore(
        ctx.activeStoreId,
        suppliers.map((s) => s.id),
      )
    : new Map();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Suppliers</h1>
        {isManager(ctx) ? (
          <Link href="/dashboard/suppliers/new" className="text-sm font-medium text-brand-blue-light hover:underline">
            Add supplier →
          </Link>
        ) : null}
      </div>
      <ul className="space-y-2">
        {suppliers.map((s) => {
          const bal = outstandingMap.get(s.id);
          const outstanding = bal?.outstanding ?? 0;
          return (
            <li key={s.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.name}</div>
                  {isManager(ctx) && outstanding !== 0 ? (
                    <p
                      className={`mt-1 text-sm tabular-nums ${
                        outstanding > 0
                          ? "text-amber-800 dark:text-amber-200"
                          : "text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {outstanding > 0
                        ? `Outstanding ₹${outstanding.toFixed(2)}`
                        : `Credit ₹${Math.abs(outstanding).toFixed(2)}`}
                      {bal && bal.unpaidCount > 0 ? (
                        <span className="ml-2 text-xs text-zinc-500">
                          · {bal.unpaidCount} unpaid
                        </span>
                      ) : null}
                    </p>
                  ) : isManager(ctx) ? (
                    <p className="mt-1 text-xs text-zinc-500">Balance settled</p>
                  ) : null}
                </div>
                {isManager(ctx) ? (
                  <span className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/dashboard/suppliers/${s.id}/edit`}
                      className="text-sm font-medium text-brand-blue-light hover:underline"
                    >
                      Edit
                    </Link>
                    <SupplierDeleteButton id={s.id} name={s.name} />
                  </span>
                ) : null}
              </div>
              {s.company ? <div className="text-sm text-zinc-600 dark:text-zinc-400">{s.company}</div> : null}
              <div className="text-xs text-zinc-500">
                {[s.contactPerson, s.phone, s.phoneAlt, s.email, s.gstin].filter(Boolean).join(" · ")}
              </div>
              {(s.drugLicense1 || s.drugLicense2) && (
                <div className="mt-1 text-xs text-zinc-500">
                  DL: {[s.drugLicense1, s.drugLicense2].filter(Boolean).join(" · ")}
                </div>
              )}
              {s.address ? <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{s.address}</div> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
