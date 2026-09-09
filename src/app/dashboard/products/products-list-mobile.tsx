"use client";

import Link from "next/link";
import { gstPctNumber } from "@/lib/product-gst-slabs";
import { displayDrugCode } from "@/lib/drug-code";
import { productCategoryLabel } from "@/lib/product-categories";
import { productTypeLabel } from "@/lib/product-types";
import { productScheduleLabel } from "@/lib/product-schedules";
import type { ProductListRow } from "./products-table";

function stockCellClass(stockQty: number, reorderMin: number): string {
  if (stockQty <= 0) return "text-rose-700 dark:text-rose-300";
  if (reorderMin > 0 && stockQty <= reorderMin) return "text-amber-800 dark:text-amber-200";
  return "text-zinc-800 dark:text-zinc-200";
}

export function ProductsListMobile({
  products,
  isManager,
  onEdit,
  addStockHref,
}: {
  products: ProductListRow[];
  isManager: boolean;
  onEdit: (row: ProductListRow) => void;
  addStockHref: (productId: string, productName: string) => string;
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        No products match these filters.
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {products.map((p) => {
        const gst = gstPctNumber(p.gstPct);
        return (
          <article
            key={p.productId}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{p.name}</p>
                {displayDrugCode(p.sku, p.productCategory) ? (
                  <p className="mt-1 font-mono text-xs text-zinc-500">
                    {displayDrugCode(p.sku, p.productCategory)}
                  </p>
                ) : null}
              </div>
              <p className={`shrink-0 text-lg font-semibold tabular-nums ${stockCellClass(p.stockQty, p.reorderMin)}`}>
                {p.stockQty}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">Brand</dt>
                <dd className="truncate">{p.brandName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Generic</dt>
                <dd className="truncate">{p.genericName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Category</dt>
                <dd>{productCategoryLabel(p.productCategory)}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Type</dt>
                <dd>{productTypeLabel(p.productType)}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Schedule</dt>
                <dd>
                  {p.productSchedule && p.productSchedule !== "NONE"
                    ? productScheduleLabel(p.productSchedule)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Pack</dt>
                <dd className="tabular-nums">{p.packSize}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">GST</dt>
                <dd className="tabular-nums">{gst}%</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Reorder min</dt>
                <dd className="tabular-nums">{p.reorderMin}</dd>
              </div>
              {p.suppliers ? (
                <div className="col-span-2">
                  <dt className="text-xs text-zinc-500">Supplier</dt>
                  <dd className="truncate text-zinc-600 dark:text-zinc-400">{p.suppliers}</dd>
                </div>
              ) : null}
            </dl>
            {isManager ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="touch-manipulation rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-brand-blue-light dark:bg-zinc-800"
                  onClick={() => onEdit(p)}
                >
                  Edit
                </button>
                <Link
                  href={addStockHref(p.productId, p.name)}
                  className="touch-manipulation rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                  Add stock
                </Link>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
