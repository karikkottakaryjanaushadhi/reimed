/** Allowed product dosage/form types (UI + DB). */
export const PRODUCT_TYPES = [
  "CAPSULES",
  "CREAMS",
  "DIAPER",
  "DROPS",
  "FILMS",
  "GEL",
  "GRANULES",
  "INHALERS",
  "INJECTION",
  "INSULIN",
  "IV_FLUIDS",
  "LOTIONS",
  "NAPKINS",
  "NEBULIZERS",
  "POWDER",
  "SOLUTIONS",
  "SPRAY",
  "SUPPOSITORIES",
  "SUSPENSIONS",
  "SYRUPS",
  "TABLETS",
  "EQUIPMENT",
  "OTHER",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const DEFAULT_PRODUCT_TYPE: ProductType = "TABLETS";

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  CAPSULES: "Capsules",
  CREAMS: "Creams",
  DIAPER: "Diaper",
  DROPS: "Drops",
  FILMS: "Films",
  GEL: "Gel",
  GRANULES: "Granules",
  INHALERS: "Inhalers",
  INJECTION: "Injection",
  INSULIN: "Insulin",
  IV_FLUIDS: "IV Fluids",
  LOTIONS: "Lotions",
  NAPKINS: "Napkins",
  NEBULIZERS: "Nebulizers",
  POWDER: "Powder",
  SOLUTIONS: "Solutions",
  SPRAY: "Spray",
  SUPPOSITORIES: "Suppositories",
  SUSPENSIONS: "Suspensions",
  SYRUPS: "Syrups",
  TABLETS: "Tablets",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
};

export function isProductType(v: string): v is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(v);
}

export function productTypeLabel(v: string | null | undefined): string {
  if (v && isProductType(v)) return PRODUCT_TYPE_LABELS[v];
  return PRODUCT_TYPE_LABELS[DEFAULT_PRODUCT_TYPE];
}
