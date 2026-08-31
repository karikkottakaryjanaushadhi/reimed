"use client";

import { StockBrandSelect } from "./stock-brand-select";
import { StockCategorySelect } from "./stock-category-select";
import { StockGstSelect } from "./stock-gst-select";
import { StockProductNameField } from "./stock-product-name-field";

export type StockListCardRow = {
  productId: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  productCategory: string | null;
  gstPct: number;
  supplier: string | null;
  qty: number;
  reorderMin: number;
};

export function StockListMobile({
  stock,
  brands,
  canEditBrand,
}: {
  stock: StockListCardRow[];
  brands: { id: string; name: string }[];
  canEditBrand: boolean;
}) {
  if (stock.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        No matching stock for these filters.
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {stock.map((s) => {
        const low = s.qty <= s.reorderMin && s.reorderMin > 0;
        return (
          <article
            key={s.productId}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Product</p>
                <StockProductNameField productId={s.productId} name={s.name} canEdit={canEditBrand} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Brand</p>
                  <StockBrandSelect
                    productId={s.productId}
                    brandId={s.brandId}
                    brandName={s.brandName}
                    brands={brands}
                    canEdit={canEditBrand}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Category</p>
                  <StockCategorySelect
                    productId={s.productId}
                    productCategory={s.productCategory}
                    canEdit={canEditBrand}
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">GST %</p>
                  <StockGstSelect productId={s.productId} gstPct={s.gstPct} canEdit={canEditBrand} />
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">Supplier</dt>
                  <dd className="truncate text-zinc-700 dark:text-zinc-300">{s.supplier ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Reorder min</dt>
                  <dd className="tabular-nums text-zinc-600">{s.reorderMin}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-zinc-500">Qty on hand</dt>
                  <dd
                    className={
                      "text-2xl font-semibold tabular-nums " +
                      (low ? "text-amber-700 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-50")
                    }
                  >
                    {s.qty}
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        );
      })}
    </div>
  );
}
