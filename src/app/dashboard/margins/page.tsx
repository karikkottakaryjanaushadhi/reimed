import { redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { isAdminPasswordConfigured } from "@/lib/admin-access";
import type { MarginsQuery } from "@/lib/margins-report";
import { MarginsClient } from "./margins-client";

export default async function MarginsPage({
  searchParams,
}: {
  searchParams: Promise<MarginsQuery>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">Margin details are available to store managers only.</p>
    );
  }

  const query = await searchParams;

  return <MarginsClient query={query} configured={isAdminPasswordConfigured()} />;
}
