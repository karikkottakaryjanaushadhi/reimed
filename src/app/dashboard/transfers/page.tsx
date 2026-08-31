import Link from "next/link";
import { redirect } from "next/navigation";
import { formatAppDateTime } from "@/lib/app-timezone";
import { ListPageSizeControls, ListPaginationNav } from "@/components/list-pagination";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { trimDateParam } from "@/lib/date-range-filter";
import {
  DEFAULT_LIST_PAGE_SIZE,
  buildSimpleListUrl,
  parseListLimitParam,
} from "@/lib/list-pagination";
import { prisma } from "@/lib/prisma";
import { createdAtDayRange } from "@/lib/date-range-filter";

function parseDirection(raw: unknown): "in" | "out" | "all" {
  if (raw === "in" || raw === "out") return raw;
  return "all";
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    from?: string;
    to?: string;
    direction?: string;
  }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const limit = parseListLimitParam(sp.limit);
  const from = trimDateParam(sp.from);
  const to = trimDateParam(sp.to);
  const direction = parseDirection(sp.direction);
  const dateFilter = createdAtDayRange(from, to);
  const skip = (page - 1) * limit;

  const storeId = ctx.activeStoreId;
  const directionWhere =
    direction === "in"
      ? { toStoreId: storeId }
      : direction === "out"
        ? { fromStoreId: storeId }
        : { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] };

  const where = {
    ...directionWhere,
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };

  const [transfers, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        fromStore: { select: { name: true } },
        toStore: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.stockTransfer.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const listExtras: Record<string, string> = {};
  if (from) listExtras.from = from;
  if (to) listExtras.to = to;
  if (direction !== "all") listExtras.direction = direction;
  if (limit !== DEFAULT_LIST_PAGE_SIZE) listExtras.limit = String(limit);

  function filterUrl(overrides: Record<string, string | undefined>) {
    const merged = { ...listExtras, ...overrides };
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v) cleaned[k] = v;
    }
    return buildSimpleListUrl("/dashboard/transfers", 1, limit, cleaned);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Stock transfers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Inter-branch stock movements for {ctx.membership.store.name}.
          </p>
        </div>
        {isManager(ctx) ? (
          <Link
            href="/dashboard/transfers/new"
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            New transfer
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <label htmlFor="direction" className="block text-xs font-medium text-zinc-500">
            Direction
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["out", "Sent out"],
                ["in", "Received"],
              ] as const
            ).map(([val, label]) => (
              <Link
                key={val}
                href={filterUrl({ direction: val === "all" ? undefined : val, page: undefined })}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  direction === val
                    ? "bg-brand-blue/20 font-medium text-brand-blue-light ring-1 ring-brand-blue/40"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3">Counterparty</th>
              <th className="px-4 py-3">Lines</th>
              <th className="px-4 py-3">By</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => {
              const isOut = t.fromStoreId === storeId;
              return (
                <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3 text-zinc-600">{formatAppDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/transfers/${t.id}`}
                      className="font-medium text-brand-blue-light hover:underline"
                    >
                      #{t.transferNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        isOut
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      {isOut ? "Out" : "In"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{isOut ? t.toStore.name : t.fromStore.name}</td>
                  <td className="px-4 py-3 tabular-nums">{t._count.lines}</td>
                  <td className="px-4 py-3">{t.createdBy.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {transfers.length === 0 ? (
          <p className="px-4 py-8 text-center text-zinc-500">No transfers yet.</p>
        ) : null}
      </div>

      <ul className="space-y-2 md:hidden">
        {transfers.map((t) => {
          const isOut = t.fromStoreId === storeId;
          return (
            <li key={t.id}>
              <Link
                href={`/dashboard/transfers/${t.id}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-brand-blue-light">#{t.transferNo}</span>
                  <span className="text-xs text-zinc-500">{formatAppDateTime(t.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm">
                  {isOut ? "To" : "From"} {isOut ? t.toStore.name : t.fromStore.name}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {isOut ? "Sent out" : "Received"} · {t._count.lines} lines · {t.createdBy.name}
                </p>
              </Link>
            </li>
          );
        })}
        {transfers.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No transfers yet.</p>
        ) : null}
      </ul>

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ListPageSizeControls
            basePath="/dashboard/transfers"
            currentLimit={limit}
            totalItems={total}
            extraHidden={listExtras}
          />
          <ListPaginationNav
            label="Transfers"
            page={page}
            totalPages={totalPages}
            totalItems={total}
            prevHref={buildSimpleListUrl("/dashboard/transfers", page - 1, limit, listExtras)}
            nextHref={buildSimpleListUrl("/dashboard/transfers", page + 1, limit, listExtras)}
            basePath="/dashboard/transfers"
            extraHidden={listExtras}
          />
        </div>
      ) : null}
    </div>
  );
}
