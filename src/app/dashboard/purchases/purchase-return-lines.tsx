"use client";

import { returnLinePurchaseCreditInclusive } from "@/lib/purchase-return";

export type PurchaseReturnLineApi = {
  id: string;
  sku: string;
  name: string;
  batchNo: string;
  qty: number;
  freeQty: number;
  returnedQty: number;
  returnableQty: number;
  linePayable: number;
};

const RETURN_QTY_INPUT_CLASS =
  "w-full rounded-lg border px-3 py-2 text-base tabular-nums touch-manipulation dark:bg-zinc-950 md:w-20 md:rounded-md md:px-2 md:py-1 md:text-sm";

function lineReturnState(line: PurchaseReturnLineApi, raw: string) {
  const q = raw === "" ? 0 : parseInt(raw, 10);
  const lineCredit =
    Number.isFinite(q) && q > 0
      ? returnLinePurchaseCreditInclusive(line.qty, q, line.linePayable)
      : 0;
  const invalid = Number.isFinite(q) && q > 0 && q > line.returnableQty;
  return { q, lineCredit, invalid };
}

function ReturnQtyInput({
  line,
  raw,
  invalid,
  onQtyChange,
}: {
  line: PurchaseReturnLineApi;
  raw: string;
  invalid: boolean;
  onQtyChange: (lineId: string, value: string) => void;
}) {
  if (line.returnableQty <= 0) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <input
      type="number"
      min={0}
      max={line.returnableQty}
      inputMode="numeric"
      className={
        RETURN_QTY_INPUT_CLASS +
        (invalid ? " border-rose-500 text-rose-700 dark:text-rose-300" : " border-zinc-200 dark:border-zinc-700")
      }
      value={raw}
      onChange={(ev) => onQtyChange(line.id, ev.target.value)}
      aria-invalid={invalid}
      aria-label={`Return qty for ${line.name}`}
    />
  );
}

export function PurchaseReturnLinesMobile({
  lines,
  qtyByLineId,
  onQtyChange,
}: {
  lines: PurchaseReturnLineApi[];
  qtyByLineId: Record<string, string>;
  onQtyChange: (lineId: string, value: string) => void;
}) {
  return (
    <div className="space-y-3 p-3 md:hidden" aria-label="Return line items">
      {lines.map((line) => {
        const raw = qtyByLineId[line.id] ?? "";
        const { lineCredit, invalid } = lineReturnState(line, raw);
        return (
          <article
            key={line.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{line.name}</p>
            <p className="mt-1 text-xs text-zinc-500">{line.sku}</p>
            <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">{line.batchNo}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">Purchased</dt>
                <dd className="tabular-nums text-zinc-800 dark:text-zinc-200">{line.qty}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Free (not returned)</dt>
                <dd className="tabular-nums text-zinc-600 dark:text-zinc-400">{line.freeQty}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Already ret.</dt>
                <dd className="tabular-nums text-zinc-600 dark:text-zinc-400">{line.returnedQty}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-zinc-500">Return qty (trade)</dt>
                <dd className="mt-1">
                  <ReturnQtyInput line={line} raw={raw} invalid={invalid} onQtyChange={onQtyChange} />
                </dd>
              </div>
              <div className="col-span-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <dt className="text-xs text-zinc-500">Line credit</dt>
                <dd className="mt-1 font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {lineCredit > 0 ? `₹${lineCredit.toFixed(2)}` : "—"}
                </dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

export function PurchaseReturnLinesTable({
  lines,
  qtyByLineId,
  onQtyChange,
}: {
  lines: PurchaseReturnLineApi[];
  qtyByLineId: Record<string, string>;
  onQtyChange: (lineId: string, value: string) => void;
}) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
          <tr>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">Batch</th>
            <th className="px-3 py-2 text-right">Purchased</th>
            <th className="px-3 py-2 text-right">Free</th>
            <th className="px-3 py-2 text-right">Already ret.</th>
            <th className="px-3 py-2 text-right">Return qty</th>
            <th className="px-3 py-2 text-right">Line credit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const raw = qtyByLineId[line.id] ?? "";
            const { lineCredit, invalid } = lineReturnState(line, raw);
            return (
              <tr key={line.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{line.name}</span>
                  <span className="block text-xs text-zinc-500">{line.sku}</span>
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{line.batchNo}</td>
                <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{line.freeQty}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{line.returnedQty}</td>
                <td className="px-3 py-2 text-right">
                  <ReturnQtyInput line={line} raw={raw} invalid={invalid} onQtyChange={onQtyChange} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {lineCredit > 0 ? `₹${lineCredit.toFixed(2)}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
