import { redirect } from "next/navigation";

/** Legacy URL: send users to batches (lot-level work). */
export default async function InventoryIndexPage() {
  redirect("/dashboard/inventory/batches");
}
