import { randomBytes } from "crypto";

/** Internal unique code for Product.sku when not provided by the user. */
export function generatedProductSku(): string {
  return `AUTO-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`.toUpperCase();
}
