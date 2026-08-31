"use client";

import { printDotmatrixReceipt } from "@/lib/dotmatrix-print";

export function DotmatrixPrintButton({ saleId }: { saleId: string }) {
  return (
    <button
      type="button"
      className="text-brand-blue-light hover:underline"
      onClick={() => void printDotmatrixReceipt(saleId)}
    >
      Print
    </button>
  );
}
