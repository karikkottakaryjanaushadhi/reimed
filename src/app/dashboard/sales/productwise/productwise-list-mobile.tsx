"use client";

export type ProductwiseCardRow = {
  productId: string;
  productName: string;
  quantity: number;
  returnQty: number;
  billCount: number;
  gross: number;
  discount: number;
  returnCredits: number;
  netRevenue: number;
  tax: number;
  cost: number;
};

export function ProductwiseListMobile({
  items,
  totals,
}: {
  items: ProductwiseCardRow[];
  totals: {
    quantity: number;
    gross: number;
    discount: number;
    returnCredits: number;
    netRevenue: number;
    tax: number;
    cost: number;
  } | null;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
        No product sales match this filter.
      </p>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {items.map((item) => (
        <article
          key={item.productId}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-semibold text-zinc-900 dark:text-zinc-50">{item.productName}</p>
            <p className="shrink-0 text-right text-lg font-semibold tabular-nums">₹{item.netRevenue.toFixed(2)}</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Net qty</dt>
              <dd className="tabular-nums">
                {item.quantity}
                {item.returnQty > 0 ? (
                  <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(−{item.returnQty})</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Bills</dt>
              <dd className="tabular-nums">{item.billCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Gross</dt>
              <dd className="tabular-nums">₹{item.gross.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Returns</dt>
              <dd className="tabular-nums text-amber-800 dark:text-amber-200">
                {item.returnCredits > 0 ? `₹${item.returnCredits.toFixed(2)}` : "—"}
              </dd>
            </div>
          </dl>
        </article>
      ))}
      {totals ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Totals (all products)</p>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <dt className="text-xs text-zinc-500">Qty</dt>
              <dd className="font-semibold tabular-nums">{totals.quantity}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Net ₹</dt>
              <dd className="font-semibold tabular-nums">₹{totals.netRevenue.toFixed(2)}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
