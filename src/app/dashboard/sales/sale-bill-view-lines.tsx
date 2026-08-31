export type SaleBillLineView = {
  id: string;
  productName: string;
  productSku: string;
  productUnit: string;
  packSize: number;
  batchNo: string;
  expiryLabel: string;
  qty: number;
  rate: number;
  gross: number;
  discPct: number;
  disc: number;
  mrgPct: number;
  gst: number;
  lineIncl: number;
  returnedQty: number;
};

export function SaleBillLinesMobile({ lines }: { lines: SaleBillLineView[] }) {
  return (
    <div className="space-y-3 p-3 md:hidden" aria-label="Bill line items">
      {lines.map((line) => (
        <article
          key={line.id}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{line.productName}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {line.productSku} · {line.productUnit}
            {line.packSize > 1 ? ` · pack ${line.packSize}` : ""}
          </p>
          <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {line.batchNo} · Exp {line.expiryLabel}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Qty</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">{line.qty}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Rate</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">₹{line.rate.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">MRP value</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">₹{line.gross.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Disc%</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
                {line.discPct > 0 ? `${line.discPct.toFixed(2)}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Disc₹</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
                {line.disc > 0 ? `₹${line.disc.toFixed(2)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Mrg%</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">{line.mrgPct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">GST</dt>
              <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">
                {line.gst > 0 ? `₹${line.gst.toFixed(2)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Sum</dt>
              <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">₹{line.lineIncl.toFixed(2)}</dd>
            </div>
            {line.returnedQty > 0 ? (
              <div className="col-span-2">
                <dt className="text-xs text-zinc-500">Returned qty</dt>
                <dd className="tabular-nums text-zinc-600 dark:text-zinc-400">{line.returnedQty}</dd>
              </div>
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  );
}

export function SaleBillLinesTable({ lines }: { lines: SaleBillLineView[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[42rem] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
          <tr>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Batch</th>
            <th className="px-3 py-2">Expiry</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Rate</th>
            <th className="px-3 py-2 text-right">MRP value</th>
            <th className="px-3 py-2 text-right">Disc%</th>
            <th className="px-3 py-2 text-right">Disc₹</th>
            <th className="px-3 py-2 text-right">Mrg%</th>
            <th className="px-3 py-2 text-right">GST</th>
            <th className="px-3 py-2 text-right">Sum</th>
            <th className="px-3 py-2 text-right">Ret.</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="px-3 py-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{line.productName}</span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {line.productSku} · {line.productUnit}
                  {line.packSize > 1 ? ` · pack ${line.packSize}` : ""}
                </span>
              </td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{line.batchNo}</td>
              <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">{line.expiryLabel}</td>
              <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
              <td className="px-3 py-2 text-right tabular-nums">₹{line.rate.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums">₹{line.gross.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                {line.discPct > 0 ? `${line.discPct.toFixed(2)}%` : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                {line.disc > 0 ? `₹${line.disc.toFixed(2)}` : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{line.mrgPct.toFixed(1)}%</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                {line.gst > 0 ? `₹${line.gst.toFixed(2)}` : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">₹{line.lineIncl.toFixed(2)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                {line.returnedQty > 0 ? line.returnedQty : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
