import type { KeyboardEvent, SelectHTMLAttributes } from "react";
import { PRODUCT_GST_SLABS, snapProductGstPct } from "@/lib/product-gst-slabs";

export function PurchaseGstSelect({
  value,
  onChange,
  className,
  disabled,
  onKeyDown,
  ...rest
}: {
  value: number;
  onChange: (gstPct: number) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLSelectElement>) => void;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "onKeyDown">) {
  const slab = snapProductGstPct(value);

  return (
    <select
      {...rest}
      className={className}
      value={slab}
      disabled={disabled}
      aria-label="GST percent"
      onChange={(e) => onChange(Number(e.target.value))}
      onKeyDown={onKeyDown}
    >
      {PRODUCT_GST_SLABS.map((p) => (
        <option key={p} value={p}>
          {p}%
        </option>
      ))}
    </select>
  );
}
