import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { PosBillingForm } from "./pos-billing-form";

export default async function PosPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  return <PosBillingForm storeId={ctx.activeStoreId} />;
}
