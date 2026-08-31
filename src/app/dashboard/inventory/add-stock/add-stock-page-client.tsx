"use client";

import { useRouter } from "next/navigation";
import { AddStockForm, type AddStockInitialProduct } from "../add-stock-form";

export function AddStockPageClient({
  initialProduct,
}: {
  initialProduct: AddStockInitialProduct | null;
}) {
  const router = useRouter();

  return (
    <AddStockForm
      initialProduct={initialProduct}
      onSaved={() => router.refresh()}
      showCancel={false}
    />
  );
}
