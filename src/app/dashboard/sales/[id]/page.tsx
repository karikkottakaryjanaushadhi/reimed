import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { formatAppDateTime } from "@/lib/app-timezone";
import { DotmatrixPrintButton } from "@/components/DotmatrixPrintButton";
import { getAuthContext } from "@/lib/auth-context";
import { canEditSale } from "@/lib/sale-editable";
import { saleBillRoundOff, salePayableFromLineAmounts } from "@/lib/bill-round";
import { netSaleTotal } from "@/lib/sale-return-aggregates";
import { saleLineMarginPercent } from "@/lib/sale-line";
import { prisma } from "@/lib/prisma";
import {
  SaleBillLinesMobile,
  SaleBillLinesTable,
  type SaleBillLineView,
} from "../sale-bill-view-lines";
import { SalePaidSwitch } from "../sale-paid-switch";

export default async function SaleBillViewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");

  const { id } = await params;
  const sale = await prisma.sale.findFirst({
    where: { id, storeId: ctx.activeStoreId },
    include: {
      store: true,
      createdBy: { select: { name: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { name: true, sku: true, unit: true, packSize: true } },
          lot: { select: { batchNo: true, expiryDate: true, costPrice: true } },
        },
      },
    },
  });
  if (!sale) notFound();

  const returnedAgg = await prisma.saleReturnLine.groupBy({
    by: ["saleLineId"],
    where: { saleReturn: { saleId: id, storeId: ctx.activeStoreId } },
    _sum: { qty: true },
  });
  const returnedByLine = new Map<string, number>();
  for (const row of returnedAgg) {
    returnedByLine.set(row.saleLineId, row._sum.qty ?? 0);
  }

  const [returnRows, returnTotalsAgg, returnCountAll] = await Promise.all([
    prisma.saleReturn.findMany({
      where: { saleId: id, storeId: ctx.activeStoreId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        total: true,
        note: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.saleReturn.aggregate({
      where: { saleId: id, storeId: ctx.activeStoreId },
      _sum: { total: true },
    }),
    prisma.saleReturn.count({
      where: { saleId: id, storeId: ctx.activeStoreId },
    }),
  ]);

  const returnCreditSum = Number(returnTotalsAgg._sum.total ?? 0);
  const billGross = Number(sale.total);
  const billPayable = salePayableFromLineAmounts(
    sale.lines.map((l) => ({ amount: Number(l.amount), discountAmount: Number(l.discountAmount) })),
  );
  const billRoundOff = saleBillRoundOff(billPayable, billGross);
  const netAfterReturns = netSaleTotal(billGross, returnCreditSum);
  const editable = canEditSale({ createdAt: sale.createdAt, returnCount: returnCountAll });

  const lineViews: SaleBillLineView[] = sale.lines.map((line) => {
    const returnedQty = returnedByLine.get(line.id) ?? 0;
    const gross = Number(line.amount);
    const discPct = Number(line.discountPct);
    const disc = Number(line.discountAmount);
    const gst = Number(line.gstAmount);
    const lineIncl = Math.round((gross - disc) * 100) / 100;
    const packSize = Math.max(1, Math.trunc(Number(line.product.packSize)) || 1);
    const mrgPct = saleLineMarginPercent(
      gross,
      disc,
      gst,
      line.qty,
      Number(line.lot.costPrice),
      packSize,
    );
    return {
      id: line.id,
      productName: line.product.name,
      productSku: line.product.sku,
      productUnit: line.product.unit,
      packSize,
      batchNo: line.lot.batchNo,
      expiryLabel: format(line.lot.expiryDate, "MM/yyyy"),
      qty: line.qty,
      rate: Number(line.rate),
      gross,
      discPct,
      disc,
      mrgPct,
      gst,
      lineIncl,
      returnedQty,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/sales" className="text-sm font-medium text-brand-blue-light hover:underline">
            ← Sales history
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Bill #{sale.billNo}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatAppDateTime(sale.createdAt)} · {sale.createdBy.name} · {sale.paymentMode}
            {!sale.paid ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Unpaid
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SalePaidSwitch saleId={sale.id} initialPaid={sale.paid} />
          <DotmatrixPrintButton saleId={sale.id} />
          {editable ? (
            <Link
              href={`/dashboard/sales/${sale.id}/edit`}
              className="text-sm font-medium text-brand-blue-light hover:underline"
            >
              Edit bill
            </Link>
          ) : null}
          <Link
            href={`/dashboard/sales/${sale.id}/return`}
            className="text-sm font-medium text-brand-blue-light hover:underline"
          >
            Return stock
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Store</h2>
          <p className="mt-2 font-medium text-zinc-900 dark:text-zinc-100">{sale.store.name}</p>
          {sale.store.address ? <p className="mt-1 text-zinc-600 dark:text-zinc-400">{sale.store.address}</p> : null}
          {sale.store.phone ? <p className="mt-1 text-zinc-600 dark:text-zinc-400">Ph: {sale.store.phone}</p> : null}
          {sale.store.gstin ? <p className="mt-1 text-zinc-600 dark:text-zinc-400">GSTIN: {sale.store.gstin}</p> : null}
        </section>
        <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Patient / bill</h2>
          <dl className="mt-2 space-y-1 text-zinc-800 dark:text-zinc-200">
            <div>
              <dt className="inline text-zinc-500">Customer</dt>
              <dd className="inline font-medium"> — {sale.customerName ?? "—"}</dd>
            </div>
            {sale.customerPhone ? (
              <div>
                <dt className="inline text-zinc-500">Phone</dt>
                <dd className="inline"> — {sale.customerPhone}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-zinc-500">Doctor</dt>
              <dd className="inline"> — {sale.doctorName ?? "—"}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <SaleBillLinesMobile lines={lineViews} />
        <SaleBillLinesTable lines={lineViews} />
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm sm:flex sm:flex-wrap sm:justify-end sm:gap-8 dark:border-zinc-800 dark:bg-zinc-900/40 [&>div]:text-left sm:[&>div]:text-right">
        <div>
          <p className="text-zinc-500">Subtotal (MRP lines)</p>
          <p className="mt-1 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">₹{Number(sale.subtotal).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Discount</p>
          <p className="mt-1 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">₹{Number(sale.discount).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Tax (GST in bill)</p>
          <p className="mt-1 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">₹{Number(sale.tax).toFixed(2)}</p>
        </div>
        {billRoundOff !== 0 ? (
          <div>
            <p className="text-zinc-500">Round off</p>
            <p className="mt-1 font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {billRoundOff > 0 ? "+" : ""}₹{billRoundOff.toFixed(2)}
            </p>
          </div>
        ) : null}
        <div>
          <p className="text-zinc-500">Bill total (original)</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">₹{billGross.toFixed(2)}</p>
        </div>
        {returnCreditSum > 0 ? (
          <>
            <div>
              <p className="text-zinc-500">Return credits</p>
              <p className="mt-1 font-medium tabular-nums text-amber-800 dark:text-amber-200">−₹{returnCreditSum.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Net after returns</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">₹{netAfterReturns.toFixed(2)}</p>
            </div>
          </>
        ) : null}
      </div>

      {returnRows.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Returns on this bill</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Total credit issued: <span className="font-medium text-zinc-900 dark:text-zinc-100">₹{returnCreditSum.toFixed(2)}</span>{" "}
            across {returnCountAll} return{returnCountAll === 1 ? "" : "s"}
            {returnRows.length < returnCountAll ? ` (showing latest ${returnRows.length})` : ""}.
          </p>
          <ul className="space-y-2 text-sm">
            {returnRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <span className="text-zinc-600 dark:text-zinc-400">
                  {formatAppDateTime(r.createdAt)} · {r.createdBy.name}
                  {r.note ? <span className="block text-xs text-zinc-500">Note: {r.note}</span> : null}
                </span>
                <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">₹{Number(r.total).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
