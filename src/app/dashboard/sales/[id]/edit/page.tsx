"use client";

import { use } from "react";
import { PosBillingForm } from "@/app/dashboard/pos/pos-billing-form";

export default function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <PosBillingForm editSaleId={id} />;
}
