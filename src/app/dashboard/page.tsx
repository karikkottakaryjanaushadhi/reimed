import { startOfDay } from "date-fns";
import { formatAppDateYmd, parseAppYmdStart } from "@/lib/app-timezone";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { getDashboardInventoryStats } from "@/lib/dashboard-home-stats";
import { EXPIRY_SOON_DAYS } from "@/lib/inventory-expiry-filter";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function DashboardHome() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const storeId = ctx.activeStoreId;
  const today = parseAppYmdStart(formatAppDateYmd()) ?? startOfDay(new Date());

  const [todaySales, todayReturns, inventoryStats] = await Promise.all([
    prisma.sale.aggregate({
      where: { storeId, createdAt: { gte: today } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.saleReturn.aggregate({
      where: { storeId, createdAt: { gte: today } },
      _sum: { total: true },
      _count: true,
    }),
    getDashboardInventoryStats(storeId, today),
  ]);

  const { expiringSoon, expired, lowSku } = inventoryStats;

  const grossToday = Number(todaySales._sum.total ?? 0);
  const returnsToday = Number(todayReturns._sum.total ?? 0);
  const netToday = Math.round((grossToday - returnsToday) * 100) / 100;
  const todayYmd = formatAppDateYmd();
  const salesTodayHref = `/dashboard/sales?from=${todayYmd}&to=${todayYmd}`;
  const returnCountToday = todayReturns._count;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Hello, {ctx.user.name}</h1>
        <p className="text-zinc-500">
          {ctx.membership.store.name} · you are signed in as <span className="font-medium">{ctx.membership.role}</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's net sales"
          value={`₹ ${netToday.toFixed(2)}`}
          sub={`${todaySales._count} bills · gross ₹${grossToday.toFixed(2)}${returnsToday > 0 ? ` · returns −₹${returnsToday.toFixed(2)} (${returnCountToday})` : ""}`}
          href={salesTodayHref}
        />
        <StatCard
          title={`Expiring (${EXPIRY_SOON_DAYS}d)`}
          value={String(expiringSoon)}
          sub="lots with stock"
          href="/dashboard/inventory/batches?expiry=soon"
        />
        <StatCard
          title="Expired lots"
          value={String(expired)}
          sub="need write-off"
          href="/dashboard/inventory/batches?expiry=expired"
        />
        <StatCard
          title="Low stock"
          value={String(lowSku)}
          sub="at or below reorder"
          href="/dashboard/inventory/stock?lowStock=1"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/pos"
          className="rounded-xl bg-gradient-to-r from-brand-blue to-brand-green px-5 py-2.5 font-medium text-white shadow-lg shadow-brand-blue/25 hover:brightness-110"
        >
          New bill (POS)
        </Link>
        <Link
          href="/dashboard/purchases/new"
          className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Record purchase
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  href,
}: {
  title: string;
  value: string;
  sub: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{sub}</p>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block transition hover:opacity-90">
        {inner}
      </Link>
    );
  }
  return inner;
}
