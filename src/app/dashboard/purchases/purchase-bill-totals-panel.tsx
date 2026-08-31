/**
 * Purchase bill summary — same layout as Billing (POS) totals (`dl` under the line table, not table rows).
 */
export function PurchaseBillTotalsPanel({
  netTotal,
  schemeDiscountTotal,
  purchaseDiscountTotal,
  gstTotal,
  roundOff,
  grandTotal,
}: {
  netTotal: number;
  schemeDiscountTotal: number;
  purchaseDiscountTotal: number;
  gstTotal: number;
  roundOff: number;
  grandTotal: number;
}) {
  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/90">
      <dl className="ml-auto max-w-xs space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
        <div className="flex justify-between gap-10 tabular-nums">
          <dt className="font-medium text-zinc-600 dark:text-zinc-400">Net Total:</dt>
          <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{netTotal.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-10 tabular-nums">
          <dt className="font-medium text-zinc-600 dark:text-zinc-400">Purchase Discount:</dt>
          <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{purchaseDiscountTotal.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-10 tabular-nums">
          <dt className="font-medium text-zinc-600 dark:text-zinc-400">Scheme Discount:</dt>
          <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{schemeDiscountTotal.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-10 tabular-nums">
          <dt className="font-medium text-zinc-600 dark:text-zinc-400">Total GST:</dt>
          <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{gstTotal.toFixed(2)}</dd>
        </div>
        {roundOff !== 0 ? (
          <div className="flex justify-between gap-10 tabular-nums">
            <dt className="font-medium text-zinc-600 dark:text-zinc-400">Round off:</dt>
            <dd className="text-right text-zinc-900 dark:text-zinc-50">
              {roundOff > 0 ? "+" : ""}₹{roundOff.toFixed(2)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-10 border-t border-zinc-200 pt-2 text-base font-semibold tabular-nums dark:border-zinc-600">
          <dt className="text-zinc-800 dark:text-zinc-100">Grand Total:</dt>
          <dd className="text-right text-zinc-900 dark:text-zinc-50">₹{grandTotal.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}
