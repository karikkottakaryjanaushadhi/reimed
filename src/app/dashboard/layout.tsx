import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { AppNav } from "@/components/AppNav";
import { MarginRouteSync } from "./margin-route-sync";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const stores = ctx.memberships.map((m) => ({
    id: m.store.id,
    name: m.store.name,
    role: m.role,
  }));

  return (
    <div className="min-h-screen bg-black">
      <MarginRouteSync />
      <AppNav stores={stores} activeStoreId={ctx.activeStoreId} isManager={isManager(ctx)} />
      <main className="mx-auto w-full max-w-[1520px] px-5 py-6 sm:px-8 lg:px-10">{children}</main>
    </div>
  );
}
