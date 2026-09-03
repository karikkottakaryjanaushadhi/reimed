import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { formatAppDateTime } from "@/lib/app-timezone";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { purchaseBillTotalsFromLines } from "@/lib/purchase-line";
import { netPurchaseTotal } from "@/lib/purchase-return-aggregates";
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
  const storeId = ctx.activeStoreId;
  const purchase = await prisma.purchase.findFirst({
    where: { id, storeId },
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

  const returnedAgg = await prisma.purchaseReturnLine.groupBy({
    by: ["purchaseLineId"],
    where: { purchaseReturn: { purchaseId: id, storeId } },
    _sum: { qty: true },
  });
  const returnedByLine = new Map<string, number>();
  for (const row of returnedAgg) {
    returnedByLine.set(row.purchaseLineId, row._sum.qty ?? 0);
  }

  const [priorReturns, returnTotalsAgg] = await Promise.all([
    prisma.purchaseReturn.findMany({
      where: { purchaseId: id, storeId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.purchaseReturn.aggregate({
      where: { purchaseId: id, storeId },
      _sum: { total: true },
    }),
  ]);
  const returnCreditsTotal = Number(returnTotalsAgg._sum.total ?? 0);
  const hasReturnableQty = purchase.lines.some((line) => {
    const returned = returnedByLine.get(line.id) ?? 0;
    return line.quantity - returned > 0;
  });

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
  const netTotal = netPurchaseTotal(billTotals.grandTotal, returnCreditsTotal);

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

  const lockedByReturns = priorReturns.length > 0;
  const viewOnly = purchase.complete || lockedByReturns;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {viewOnly ? `Purchase #${purchase.purchaseNo}` : `Edit purchase #${purchase.purchaseNo}`}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {purchase.complete && hasReturnableQty ? (
            <Link
              href={`/dashboard/purchases/${purchase.id}/return`}
              className="text-sm font-medium text-brand-blue-light hover:underline"
            >
              Return to supplier
            </Link>
          ) : null}
          <Link
            href="/dashboard/purchases"
            className="text-sm font-medium text-brand-blue-light hover:underline"
          >
            Purchase list →
          </Link>
        </div>
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
          {returnCreditsTotal > 0 ? (
            <>
              <div>
                <dt className="text-zinc-500">Return credits</dt>
                <dd className="tabular-nums text-amber-800 dark:text-amber-200">
                  −₹{returnCreditsTotal.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Net after returns</dt>
                <dd className="tabular-nums font-medium">₹{netTotal.toFixed(2)}</dd>
              </div>
            </>
          ) : null}
          <div>
            <dt className="text-zinc-500">Status</dt>
            <dd className="font-medium text-zinc-900 dark:text-zinc-100">
              {viewOnly
                ? lockedByReturns && !purchase.complete
                  ? "Has returns (view only)"
                  : "Finalized (view only)"
                : "Editing allowed"}
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
            key={`purchase-edit-${purchase.id}-${viewOnly ? "1" : "0"}`}
            purchaseId={purchase.id}
            initialSupplierId={purchase.supplierId}
            initialSupplierName={purchase.supplier.name}
            initialInvoiceRef={purchase.invoiceRef}
            initialInvoiceDate={invDateStr || null}
            initialLocked={viewOnly}
            lines={lineDrafts}
          />
        </div>
      </div>

      {priorReturns.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Returns on this purchase</h2>
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {priorReturns.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">{formatAppDateTime(r.createdAt)}</span>
                  <span className="mx-2 text-zinc-300">·</span>
                  <span>{r.createdBy.name}</span>
                  {r.creditNoteNo?.trim() ? (
                    <>
                      <span className="mx-2 text-zinc-300">·</span>
                      <span className="text-zinc-600 dark:text-zinc-400">CN {r.creditNoteNo.trim()}</span>
                    </>
                  ) : null}
                  <span className="mx-2 text-zinc-300">·</span>
                  <span className="tabular-nums text-zinc-500">
                    {r._count.lines} line{r._count.lines === 1 ? "" : "s"}
                  </span>
                  {r.note?.trim() ? (
                    <p className="mt-1 text-xs text-zinc-500">{r.note.trim()}</p>
                  ) : null}
                </div>
                <span className="font-medium tabular-nums text-amber-800 dark:text-amber-200">
                  ₹{Number(r.total).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            <Link href="/dashboard/purchases/returns" className="text-brand-blue-light hover:underline">
              All purchase returns →
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
