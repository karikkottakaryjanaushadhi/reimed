import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { BrandDeleteButton } from "./brand-delete-button";

export default async function BrandsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Brands</h1>
        {isManager(ctx) ? (
          <Link href="/dashboard/brands/new" className="text-sm font-medium text-brand-blue-light hover:underline">
            Add brand →
          </Link>
        ) : null}
      </div>
      <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        Brands are shared labels (company / trade name). Add them here, then pick a brand when you add or edit
        catalog products—similar to suppliers for purchases.
      </p>
      <ul className="space-y-2">
        {brands.map((b) => (
          <li
            key={b.id}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 font-medium text-zinc-900 dark:text-zinc-50">{b.name}</div>
              {isManager(ctx) ? (
                <span className="flex shrink-0 items-center gap-3">
                  <Link
                    href={`/dashboard/brands/${b.id}/edit`}
                    className="text-sm font-medium text-brand-blue-light hover:underline"
                  >
                    Edit
                  </Link>
                  <BrandDeleteButton id={b.id} name={b.name} />
                </span>
              ) : null}
            </div>
            <div className="text-xs text-zinc-500">
              Added {b.createdAt.toISOString().slice(0, 10)}
            </div>
          </li>
        ))}
      </ul>
      {brands.length === 0 ? (
        <p className="text-sm text-zinc-500">No brands yet. Add one above for use on products.</p>
      ) : null}
    </div>
  );
}
