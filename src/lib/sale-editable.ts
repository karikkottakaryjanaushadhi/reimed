import { isSameAppDay } from "@/lib/app-timezone";

/** Same IST calendar-day semantics as sales list filters. */
export function saleCreatedOnLocalDay(createdAt: Date, day: Date = new Date()): boolean {
  return isSameAppDay(createdAt, day);
}

export function canEditSale(input: { createdAt: Date; returnCount: number }): boolean {
  return saleCreatedOnLocalDay(input.createdAt) && input.returnCount === 0;
}
