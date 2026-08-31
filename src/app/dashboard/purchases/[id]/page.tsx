import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { formatAppDateTime } from "@/lib/app-timezone";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { purchaseBillTotalsFromLines } from "@/lib/purchase-line";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import { PurchaseDetailClient } from "../purchase-detail-client";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!isManager(ctx)) {
    return (
      <p className="text-zinc-600 dark:text-zinc-400">Purchase details are available to store managers only.</p>
    );
  }

  const { id } = await params;
  const purchase = await prisma.purchase.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      lines: {
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!purchase) notFound();

  const billTotals = purchaseBillTotalsFromLines(
    purchase.lines.map((line) => ({
      quantity: line.quantity,
      costPrice: Number(line.costPrice),
      pack: line.pack,
      purchaseDiscountPct: Number(line.purchaseDiscountPct),
      purchaseDiscountRs: Number(line.purchaseDiscountRs),
      schemeDiscountPct: Number(line.schemeDiscountPct),
      schemeDiscountRs: Number(line.schemeDiscountRs),
      gstPct: snapProductGstPct(line.gstPct),
    })),
  );

  const invDateStr = purchase.invoiceDate
    ? format(purchase.invoiceDate, "yyyy-MM-dd")
    : "";

  const lineDrafts = purchase.lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    productName: line.product.name,
    productSku: line.product.sku,
    batchNo: line.batchNo,
    expiryYmd: line.expiryDate.toISOString().slice(0, 10),
    quantity: line.quantity,
    freeQty: line.freeQty,
    pack: line.pack,
    costPrice: Number(line.costPrice),
    mrp: Number(line.mrp),
    purchaseDiscountPct: Number(line.purchaseDiscountPct),
    purchaseDiscountRs: Number(line.purchaseDiscountRs),
    schemeDiscountPct: Number(line.schemeDiscountPct),
    schemeDiscountRs: Number(line.schemeDiscountRs),
    salesDiscountPct: Number(line.salesDiscountPct),
    salesDiscountRs: Number(line.salesDiscountRs),
    gstPct: snapProductGstPct(line.gstPct),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {purchase.complete ? `Purchase #${purchase.purchaseNo}` : `Edit purchase #${purchase.purchaseNo}`}
        </h1>
        <Link
          href="/dashboard/purchases"
          className="text-sm font-medium text-brand-blue-light hover:underline"
        >
          Purchase list →
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">
          Recorded {formatAppDateTime(purchase.createdAt)} · {purchase.createdBy.name}
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Supplier</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">{purchase.supplier.name}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Invoice ref</dt>
            <dd>{purchase.invoiceRef?.trim() || "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Invoice date</dt>
            <dd>{purchase.invoiceDate ? format(purchase.invoiceDate, "dd MMM yyyy") : "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Approx. total (incl. GST)</dt>
            <dd className="tabular-nums">
              ₹{billTotals.grandTotal.toFixed(2)}
              {billTotals.roundOff !== 0 ? (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  (round off {billTotals.roundOff > 0 ? "+" : ""}₹{billTotals.roundOff.toFixed(2)})
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Status</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">
              {purchase.complete ? "Finalized (view only)" : "Editing allowed"}
            </dd>
          </div>
          {purchase.notes?.trim() ? (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Notes</dt>
              <dd className="whitespace-pre-wrap">{purchase.notes.trim()}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4">
          <PurchaseDetailClient
            key={`purchase-edit-${purchase.id}-${purchase.complete ? "1" : "0"}`}
            purchaseId={purchase.id}
            initialSupplierId={purchase.supplierId}
            initialSupplierName={purchase.supplier.name}
            initialInvoiceRef={purchase.invoiceRef}
            initialInvoiceDate={invDateStr || null}
            initialLocked={purchase.complete === true}
            lines={lineDrafts}
          />
        </div>
      </div>
    </div>
  );
}
