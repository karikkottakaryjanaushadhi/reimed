/** Allowed product catalog categories (UI + DB). */
export const PRODUCT_CATEGORIES = [
  "GENERIC",
  "STATIONARY",
  "ETHICAL",
  "VETERINARY",
  "JANAUSHADHI",
  "COSMETIC",
  "SURGICAL",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const DEFAULT_PRODUCT_CATEGORY: ProductCategory = "GENERIC";

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  GENERIC: "Generic",
  STATIONARY: "Stationary",
  ETHICAL: "Ethical",
  VETERINARY: "Veterinary",
  JANAUSHADHI: "Janaushadhi",
  COSMETIC: "Cosmetic",
  SURGICAL: "Surgical",
};

export function isProductCategory(v: string): v is ProductCategory {
  return (PRODUCT_CATEGORIES as readonly string[]).includes(v);
}

export function productCategoryLabel(v: string | null | undefined): string {
  if (v && isProductCategory(v)) return PRODUCT_CATEGORY_LABELS[v];
  return PRODUCT_CATEGORY_LABELS[DEFAULT_PRODUCT_CATEGORY];
}
