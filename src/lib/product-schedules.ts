/** Drug & Cosmetics Act schedules for catalog products (UI + DB). */
export const PRODUCT_SCHEDULES = [
  "NONE",
  "G",
  "H",
  "H1",
  "X",
  "C",
  "C1",
  "K",
  "J",
  "M",
  "N",
  "P",
] as const;

export type ProductSchedule = (typeof PRODUCT_SCHEDULES)[number];

export const DEFAULT_PRODUCT_SCHEDULE: ProductSchedule = "NONE";

export const PRODUCT_SCHEDULE_LABELS: Record<ProductSchedule, string> = {
  NONE: "None",
  G: "Schedule G",
  H: "Schedule H",
  H1: "Schedule H1",
  X: "Schedule X",
  C: "Schedule C",
  C1: "Schedule C(1)",
  K: "Schedule K",
  J: "Schedule J",
  M: "Schedule M",
  N: "Schedule N",
  P: "Schedule P",
};

export function isProductSchedule(v: string): v is ProductSchedule {
  return (PRODUCT_SCHEDULES as readonly string[]).includes(v);
}

export function productScheduleLabel(v: string | null | undefined): string {
  if (v && isProductSchedule(v)) return PRODUCT_SCHEDULE_LABELS[v];
  return PRODUCT_SCHEDULE_LABELS[DEFAULT_PRODUCT_SCHEDULE];
}
