import { saleBillDiscountPct } from "@/lib/sale-return-aggregates";

export function SaleBillDiscountDisplay({
  subtotal,
  discount,
}: {
  subtotal: number;
  discount: number;
}) {
  if (discount <= 0) {
    return <span className="text-zinc-500">—</span>;
  }
  const pct = saleBillDiscountPct(subtotal, discount);
  return (
    <span className="inline-block text-right leading-snug tabular-nums text-zinc-600 dark:text-zinc-400">
      <span className="block">₹{discount.toFixed(2)}</span>
      {pct > 0 ? (
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{pct.toFixed(1)}%</span>
      ) : null}
    </span>
  );
}
