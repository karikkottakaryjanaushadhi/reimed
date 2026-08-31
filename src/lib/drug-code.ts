import { generatedProductSku } from "@/lib/generated-sku";
import { compactSearchKey } from "@/lib/search-normalize";
import { storeUpper } from "@/lib/store-text";

export const JANAUSHADHI_DRUG_CODE_PREFIX = "JAN";

/** Auto-generated internal SKU when no drug code is set. */
export function isInternalProductSku(sku: string): boolean {
  return /^AUTO-/i.test(sku.trim());
}

export function isJanaushadhiDrugSku(sku: string): boolean {
  return new RegExp(`^${JANAUSHADHI_DRUG_CODE_PREFIX}`, "i").test(sku.trim());
}

/** True when searching by numeric Janaushadhi drug code (digits only, no JAN prefix). */
export function isDrugCodeSearchQuery(query: string): boolean {
  const compact = compactSearchKey(query);
  if (!compact || compact.startsWith(JANAUSHADHI_DRUG_CODE_PREFIX.toLowerCase())) return false;
  return /^\d+$/.test(compact);
}

/** SQL LIKE pattern for stored sku JAN1234 when user searches 1234. */
export function drugCodeSearchLikePattern(query: string): string | null {
  if (!isDrugCodeSearchQuery(query)) return null;
  const needle = compactSearchKey(query).replace(/%/g, "").replace(/_/g, "");
  if (!needle) return null;
  return `${JANAUSHADHI_DRUG_CODE_PREFIX.toLowerCase()}${needle}%`;
}

/** Shown in lists/POS — numeric code only (JAN1001 → 1001). */
export function displayDrugCode(sku: string, productCategory?: string | null): string {
  if (productCategory && productCategory !== "JANAUSHADHI") return "";
  if (!isJanaushadhiDrugSku(sku)) return "";
  return drugCodeFormValue(sku);
}

/** Form field value without the JAN prefix (e.g. JAN1001 → 1001). */
export function drugCodeFormValue(sku: string): string {
  const m = new RegExp(`^${JANAUSHADHI_DRUG_CODE_PREFIX}(.+)$`, "i").exec(sku.trim());
  if (!m) return "";
  return m[1]!;
}

export function drugCodeFromUserInput(
  input: string | undefined | null,
  productCategory?: string | null,
): string | undefined {
  if (productCategory !== "JANAUSHADHI") return undefined;
  const t = input?.trim();
  if (!t) return undefined;
  const compact = storeUpper(t.replace(/\s+/g, ""));
  if (isJanaushadhiDrugSku(compact)) return compact;
  return `${JANAUSHADHI_DRUG_CODE_PREFIX}${compact}`;
}

export function resolveProductSkuFromDrugCode(
  drugCode?: string | null,
  productCategory?: string | null,
): {
  sku: string;
  explicit: boolean;
} {
  const normalized = drugCodeFromUserInput(drugCode, productCategory);
  if (normalized) return { sku: normalized, explicit: true };
  return { sku: generatedProductSku(), explicit: false };
}

export function drugCodeMatchesQuery(sku: string, query: string): boolean {
  if (!isDrugCodeSearchQuery(query)) return false;
  if (!isJanaushadhiDrugSku(sku)) return false;
  const needle = compactSearchKey(query);
  const code = compactSearchKey(drugCodeFormValue(sku));
  if (!code) return false;
  return code.startsWith(needle);
}

export const JANAUSHADHI_DRUG_CODE_REQUIRED_ERROR =
  "Drug code is required for Janaushadhi products.";

export function janaushadhiDrugCodeValidationError(
  productCategory: string | null | undefined,
  drugCodeInput: string | undefined | null,
): string | null {
  if (productCategory !== "JANAUSHADHI") return null;
  if (!drugCodeFromUserInput(drugCodeInput, productCategory)) {
    return JANAUSHADHI_DRUG_CODE_REQUIRED_ERROR;
  }
  return null;
}
