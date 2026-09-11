import { isSameAppDay } from "@/lib/app-timezone";

/** Same IST calendar-day semantics as sales list filters. */
export function saleCreatedOnLocalDay(createdAt: Date, day: Date = new Date()): boolean {
  return isSameAppDay(createdAt, day);
}

/** Temporary: allow editing bills from previous days. Set false to restore the same-day lock. */
export const ALLOW_EDIT_OLD_SALES = true;

export function canEditSale(input: { createdAt: Date; returnCount: number }): boolean {
  const sameDayOk = ALLOW_EDIT_OLD_SALES || saleCreatedOnLocalDay(input.createdAt);
  return sameDayOk && input.returnCount === 0;
}
