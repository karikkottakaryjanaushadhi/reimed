"use client";

import { useEffect, useState } from "react";
import type { ProductListRow } from "./products-table";
import { StockBrandSelect } from "@/app/dashboard/inventory/stock-brand-select";
import { StockCategorySelect } from "@/app/dashboard/inventory/stock-category-select";
import { StockDrugCodeField } from "@/app/dashboard/inventory/stock-drug-code-field";
import { StockGenericNameField } from "@/app/dashboard/inventory/stock-generic-name-field";
import { StockGstSelect } from "@/app/dashboard/inventory/stock-gst-select";
import { StockIntField } from "@/app/dashboard/inventory/stock-int-field";
import { StockProductNameField } from "@/app/dashboard/inventory/stock-product-name-field";
import { StockScheduleSelect } from "@/app/dashboard/inventory/stock-schedule-select";
import { StockTypeSelect } from "@/app/dashboard/inventory/stock-type-select";

function stockCellClass(stockQty: number, reorderMin: number): string {
  if (stockQty <= 0) return "text-rose-700 dark:text-rose-300";
  if (reorderMin > 0 && stockQty <= reorderMin) return "text-amber-800 dark:text-amber-200";
  return "text-zinc-800 dark:text-zinc-200";
}

export function ProductsListMobile({
  products,
  isManager,
  brands,
}: {
  products: ProductListRow[];
  isManager: boolean;
  brands: { id: string; name: string }[];
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
      {products.map((p) => (
        <ProductCatalogCard key={p.productId} p={p} isManager={isManager} brands={brands} />
      ))}
    </div>
  );
}

function ProductCatalogCard({
  p,
  isManager,
  brands,
}: {
  p: ProductListRow;
  isManager: boolean;
  brands: { id: string; name: string }[];
}) {
  const [category, setCategory] = useState(p.productCategory);
  const janaushadhi = category === "JANAUSHADHI";

  useEffect(() => {
    setCategory(p.productCategory);
  }, [p.productCategory]);

  return (
        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Name</p>
            <StockProductNameField productId={p.productId} name={p.name} canEdit={isManager} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Brand</p>
              <StockBrandSelect
                productId={p.productId}
                brandId={p.brandId}
                brandName={p.brandName}
                brands={brands}
                canEdit={isManager}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Generic</p>
              <StockGenericNameField productId={p.productId} genericName={p.genericName} canEdit={isManager} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Category</p>
              <StockCategorySelect
                productId={p.productId}
                productCategory={p.productCategory}
                canEdit={isManager}
                onUpdated={setCategory}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Code</p>
              <StockDrugCodeField
                productId={p.productId}
                sku={p.sku}
                productCategory={category}
                canEdit={isManager && janaushadhi}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Type</p>
              <StockTypeSelect productId={p.productId} productType={p.productType} canEdit={isManager} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Schedule</p>
              <StockScheduleSelect
                productId={p.productId}
                productSchedule={p.productSchedule}
                canEdit={isManager}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Supplier</p>
              <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">{p.suppliers ?? "—"}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Stock</p>
              <p className={`px-2 py-1.5 text-sm font-semibold tabular-nums ${stockCellClass(p.stockQty, p.reorderMin)}`}>
                {p.stockQty}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Pack</p>
              <StockIntField
                productId={p.productId}
                field="packSize"
                value={p.packSize}
                min={1}
                canEdit={isManager}
                ariaLabel="Pack size"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">GST %</p>
              <StockGstSelect productId={p.productId} gstPct={p.gstPct} canEdit={isManager} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Reorder</p>
              <StockIntField
                productId={p.productId}
                field="reorderMin"
                value={p.reorderMin}
                min={0}
                canEdit={isManager}
                ariaLabel="Reorder minimum"
              />
            </div>
          </div>
        </article>
  );
}
