import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";

/** Convenience URL: edits whichever store is currently selected in the header. */
export default async function EditActiveStoreRedirectPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  redirect(`/dashboard/stores/${ctx.activeStoreId}/edit`);
}
