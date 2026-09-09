"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buildSimpleListUrl } from "@/lib/list-pagination";
import { gstPctNumber } from "@/lib/product-gst-slabs";
import { productCategoryLabel } from "@/lib/product-categories";
import { productTypeLabel } from "@/lib/product-types";
import { productScheduleLabel } from "@/lib/product-schedules";
import type { ProductListRow } from "@/lib/product-list-row";
import { ProductForm, productRowToFormValues } from "./product-form";
import { ProductsListMobile } from "./products-list-mobile";

export type { ProductListRow };

function stockCellClass(stockQty: number, reorderMin: number): string {
  if (stockQty <= 0) return "text-rose-700 dark:text-rose-300";
  if (reorderMin > 0 && stockQty <= reorderMin) return "text-amber-800 dark:text-amber-200";
  return "text-zinc-800 dark:text-zinc-200";
}

function ProductEditModal({
  row,
  open,
  onClose,
  onSaved,
}: {
  row: ProductListRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(ev: Event) {
      if ((ev as globalThis.KeyboardEvent).key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-edit-title"
    >
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 max-h-[90vh] w-full max-w-7xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="product-edit-title" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Edit product
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Catalog fields only. Use Add stock for opening batches.
        </p>
        <div className="mt-3">
          <ProductForm
            productId={row.productId}
            initial={productRowToFormValues(row)}
            variant="modal"
            onCancel={onClose}
            onSaved={onSaved}
          />
        </div>
      </div>
    </div>
  );
}

export function ProductsTable({
  products,
  isManager,
  pageSize,
  sort,
  dir,
  extras,
}: {
  products: ProductListRow[];
  isManager: boolean;
  pageSize: number;
  sort: string;
  dir: string;
  extras: Record<string, string>;
}) {
  const router = useRouter();
  const [editRow, setEditRow] = useState<ProductListRow | null>(null);

  const closeEdit = useCallback(() => setEditRow(null), []);
  const onSaved = useCallback(() => {
    setEditRow(null);
    router.refresh();
  }, [router]);

  const sortHref = (col: string) =>
    buildSimpleListUrl("/dashboard/products", 1, pageSize, {
      ...extras,
      sort: col,
      dir: sort === col && dir === "asc" ? "desc" : "asc",
    });

  return (
    <>
      <ProductsListMobile
        products={products}
        isManager={isManager}
        onEdit={setEditRow}
      />

      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[17rem]" />
            <col className="w-[8.5rem]" />
            <col className="w-[13rem]" />
            <col className="w-[5rem]" />
            <col className="w-[3.75rem]" />
            <col className="w-[4.75rem]" />
            <col className="w-[12rem]" />
            <col className="w-[3.25rem]" />
            <col className="w-[3rem]" />
            <col className="w-[3.5rem]" />
            <col className="w-[4.5rem]" />
            {isManager ? <col className="w-[3.5rem]" /> : null}
          </colgroup>
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3">
                <Link href={sortHref("name")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Name {sort === "name" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link href={sortHref("brand")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Brand {sort === "brand" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link href={sortHref("generic")} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-zinc-700 hover:text-brand-blue-light dark:text-zinc-200">
                  Generic {sort === "generic" ? (dir === "asc" ? "↑" : "↓") : "↕"}
                </Link>
              </th>
              <th className="px-2 py-3">Category</th>
              <th className="px-2 py-3">Type</th>
              <th className="px-2 py-3">Schedule</th>
              <th className="px-4 py-3">Supplier</th>
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
              {isManager ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const gst = gstPctNumber(p.gstPct);
              return (
                <tr key={p.productId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="truncate px-4 py-2 font-medium" title={p.name}>
                    {p.name}
                  </td>
                  <td className="truncate px-4 py-2 text-zinc-600 dark:text-zinc-400" title={p.brandName ?? undefined}>
                    {p.brandName ?? "—"}
                  </td>
                  <td className="truncate px-4 py-2 text-zinc-600 dark:text-zinc-400" title={p.genericName ?? undefined}>
                    {p.genericName ?? "—"}
                  </td>
                  <td className="truncate px-2 py-2 text-zinc-600 dark:text-zinc-400" title={productCategoryLabel(p.productCategory)}>
                    {productCategoryLabel(p.productCategory)}
                  </td>
                  <td className="truncate px-2 py-2 text-zinc-600 dark:text-zinc-400" title={productTypeLabel(p.productType)}>
                    {productTypeLabel(p.productType)}
                  </td>
                  <td
                    className="truncate px-2 py-2 text-zinc-600 dark:text-zinc-400"
                    title={
                      p.productSchedule && p.productSchedule !== "NONE"
                        ? productScheduleLabel(p.productSchedule)
                        : undefined
                    }
                  >
                    {p.productSchedule && p.productSchedule !== "NONE"
                      ? productScheduleLabel(p.productSchedule)
                      : "—"}
                  </td>
                  <td className="truncate px-4 py-2 text-zinc-600 dark:text-zinc-400" title={p.suppliers ?? undefined}>
                    {p.suppliers ?? "—"}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${stockCellClass(p.stockQty, p.reorderMin)}`}>
                    {p.stockQty}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.packSize}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{gst}%</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.reorderMin}</td>
                  {isManager ? (
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="font-medium text-brand-blue-light hover:underline"
                        onClick={() => setEditRow(p)}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">No products match these filters.</p>
        ) : null}
      </div>

      {editRow ? (
        <ProductEditModal row={editRow} open={!!editRow} onClose={closeEdit} onSaved={onSaved} />
      ) : null}
    </>
  );
}
