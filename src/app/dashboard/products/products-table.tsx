"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildSimpleListUrl } from "@/lib/list-pagination";
import type { ProductListRow } from "@/lib/product-list-row";
import { StockBrandSelect } from "@/app/dashboard/inventory/stock-brand-select";
import { StockCategorySelect } from "@/app/dashboard/inventory/stock-category-select";
import { StockDrugCodeField } from "@/app/dashboard/inventory/stock-drug-code-field";
import { StockGenericNameField } from "@/app/dashboard/inventory/stock-generic-name-field";
import { StockGstSelect } from "@/app/dashboard/inventory/stock-gst-select";
import { StockIntField } from "@/app/dashboard/inventory/stock-int-field";
import { StockProductNameField } from "@/app/dashboard/inventory/stock-product-name-field";
import { StockScheduleSelect } from "@/app/dashboard/inventory/stock-schedule-select";
import { StockTypeSelect } from "@/app/dashboard/inventory/stock-type-select";
import { ProductsListMobile } from "./products-list-mobile";

export type { ProductListRow };

function stockCellClass(stockQty: number, reorderMin: number): string {
  if (stockQty <= 0) return "text-rose-700 dark:text-rose-300";
  if (reorderMin > 0 && stockQty <= reorderMin) return "text-amber-800 dark:text-amber-200";
  return "text-zinc-800 dark:text-zinc-200";
}

export function ProductsTable({
  products,
  isManager,
  brands,
  pageSize,
  sort,
  dir,
  extras,
}: {
  products: ProductListRow[];
  isManager: boolean;
  brands: { id: string; name: string }[];
  pageSize: number;
  sort: string;
  dir: string;
  extras: Record<string, string>;
}) {
  const sortHref = (col: string) =>
    buildSimpleListUrl("/dashboard/products", 1, pageSize, {
      ...extras,
      sort: col,
      dir: sort === col && dir === "asc" ? "desc" : "asc",
    });

  return (
    <>
      <ProductsListMobile products={products} isManager={isManager} brands={brands} />

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[15.5rem]" />
            <col className="w-[6.75rem]" />
            <col className="w-[12.5rem]" />
            <col className="w-[5rem]" />
            <col className="w-[4.5rem]" />
            <col className="w-[5.5rem]" />
            <col className="w-[4.75rem]" />
            <col className="w-[11rem]" />
            <col className="w-[3.25rem]" />
            <col className="w-[3rem]" />
            <col className="w-[3.5rem]" />
            <col className="w-[4.5rem]" />
          </colgroup>
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-2 py-3">
                <Link href={sortHref("name")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Name {sort === "name" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3">
                <Link href={sortHref("brand")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Brand {sort === "brand" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3">
                <Link href={sortHref("generic")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Generic {sort === "generic" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3">Category</th>
              <th className="px-2 py-3">
                <Link href={sortHref("sku")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Code {sort === "sku" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3">Type</th>
              <th className="px-2 py-3">Schedule</th>
              <th className="px-2 py-3">Supplier</th>
              <th className="px-2 py-3 text-right">
                <Link href={sortHref("stock")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Stock {sort === "stock" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3 text-right">
                <Link href={sortHref("packSize")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Pack {sort === "packSize" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3 text-right">
                <Link href={sortHref("gst")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  GST % {sort === "gst" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3 text-right">
                <Link href={sortHref("reorderMin")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Reorder {sort === "reorderMin" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <ProductCatalogRow key={p.productId} p={p} isManager={isManager} brands={brands} />
            ))}
          </tbody>
        </table>
        {products.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">No products match these filters.</p>
        ) : null}
      </div>
    </>
  );
}

function ProductCatalogRow({
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
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="px-2 py-1.5 align-top">
        <StockProductNameField productId={p.productId} name={p.name} canEdit={isManager} compact />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockBrandSelect
          productId={p.productId}
          brandId={p.brandId}
          brandName={p.brandName}
          brands={brands}
          canEdit={isManager}
          compact
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockGenericNameField
          productId={p.productId}
          genericName={p.genericName}
          canEdit={isManager}
          compact
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockCategorySelect
          productId={p.productId}
          productCategory={p.productCategory}
          canEdit={isManager}
          compact
          onUpdated={setCategory}
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockDrugCodeField
          productId={p.productId}
          sku={p.sku}
          productCategory={category}
          canEdit={isManager && janaushadhi}
          compact
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockTypeSelect
          productId={p.productId}
          productType={p.productType}
          canEdit={isManager}
          compact
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockScheduleSelect
          productId={p.productId}
          productSchedule={p.productSchedule}
          canEdit={isManager}
          compact
        />
      </td>
      <td className="truncate px-2 py-1.5 text-zinc-600 dark:text-zinc-400" title={p.suppliers ?? undefined}>
        {p.suppliers ?? "—"}
      </td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${stockCellClass(p.stockQty, p.reorderMin)}`}>
        {p.stockQty}
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockIntField
          productId={p.productId}
          field="packSize"
          value={p.packSize}
          min={1}
          canEdit={isManager}
          compact
          ariaLabel="Pack size"
        />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockGstSelect productId={p.productId} gstPct={p.gstPct} canEdit={isManager} compact />
      </td>
      <td className="px-2 py-1.5 align-top">
        <StockIntField
          productId={p.productId}
          field="reorderMin"
          value={p.reorderMin}
          min={0}
          canEdit={isManager}
          compact
          ariaLabel="Reorder minimum"
        />
      </td>
    </tr>
  );
}
