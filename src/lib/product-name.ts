import { storeUpper } from "@/lib/store-text";

export const DUPLICATE_PRODUCT_NAME_ERROR = "A product with this name already exists";

/** Catalog name key: trim, collapse whitespace, uppercase. */
export function normalizeProductName(name: string): string {
  return storeUpper(name).replace(/\s+/g, " ");
}
