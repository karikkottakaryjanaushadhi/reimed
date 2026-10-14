import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { RackForm, type RackFormInitial } from "../../rack-form";

export default async function EditRackPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) redirect("/dashboard/racks");

  const { id } = await params;
  const rack = await prisma.rack.findUnique({ where: { id } });
  if (!rack) notFound();

  const initial: RackFormInitial = { id: rack.id, code: rack.code };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Edit rack</h1>
        <Link href="/dashboard/racks" className="text-sm font-medium text-brand-blue-light hover:underline">
          Rack list →
        </Link>
      </div>
      <RackForm initial={initial} />
    </div>
  );
}
