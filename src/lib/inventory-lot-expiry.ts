import { formatAppDateYmd, parseAppYmdStart } from "@/lib/app-timezone";

/** Calendar expiry yyyy-mm-dd stored at noon UTC (matches purchase invoice date convention). */
export function normalizeInventoryLotExpiryDate(input: string | Date): Date {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new Error("invalid_expiry");
    const ymd = input.toISOString().slice(0, 10);
    return new Date(`${ymd}T12:00:00.000Z`);
  }
  const trimmed = input.trim();
  const ymd = trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) throw new Error("invalid_expiry");
    return normalizeInventoryLotExpiryDate(parsed);
  }
  return new Date(`${ymd}T12:00:00.000Z`);
}

/** True when the batch is past its expiry calendar day (IST), matching inventory expiry filters. */
export function isInventoryLotExpired(expiryDate: Date, now: Date = new Date()): boolean {
  const todayStart = parseAppYmdStart(formatAppDateYmd(now));
  if (!todayStart) return false;
  return expiryDate < todayStart;
}

/** Client/API ISO expiry strings (from InventoryLot). */
export function isInventoryLotExpiryIsoExpired(expiryIso: string, now: Date = new Date()): boolean {
  const d = new Date(expiryIso);
  if (Number.isNaN(d.getTime())) return false;
  return isInventoryLotExpired(d, now);
}
