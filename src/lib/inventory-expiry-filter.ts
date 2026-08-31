import { Prisma } from "@prisma/client";
import { isValid, parseISO } from "date-fns";

/** Lots expiring within this many calendar days (inclusive) count as "soon". */
export const EXPIRY_SOON_DAYS = 60;

export const EXPIRY_PRESET_VALUES = ["expired", "soon", "valid"] as const;
export type ExpiryPreset = (typeof EXPIRY_PRESET_VALUES)[number];

export function expiryTintFromDays(daysToExpiry: number): "expired" | "soon" | "ok" {
  if (daysToExpiry < 0) return "expired";
  if (daysToExpiry <= EXPIRY_SOON_DAYS) return "soon";
  return "ok";
}

export const EXPIRY_SOON_LABEL = `Expiring ${EXPIRY_SOON_DAYS}d`;

export function parseExpiryPreset(raw: string): ExpiryPreset | "" {
  return EXPIRY_PRESET_VALUES.includes(raw as ExpiryPreset) ? (raw as ExpiryPreset) : "";
}

export function parseExpiryOnYmd(raw: string): string {
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  const d = parseISO(`${t}T12:00:00`);
  return isValid(d) ? t : "";
}

export function resolveExpiryFilter(
  expiryParam: string,
  expiryOnParam?: string,
): { preset: ExpiryPreset | ""; expiryOnYmd: string } {
  const onFromField = parseExpiryOnYmd(expiryOnParam ?? "");
  if (onFromField) return { preset: "", expiryOnYmd: onFromField };

  const raw = expiryParam.trim();
  const preset = parseExpiryPreset(raw);
  if (preset) return { preset, expiryOnYmd: "" };

  const onFromExpiry = parseExpiryOnYmd(raw);
  return { preset: "", expiryOnYmd: onFromExpiry };
}

export function inventoryLotExpiryAndClause(opts: {
  preset: ExpiryPreset | "";
  expiryOnYmd: string;
}): Prisma.Sql {
  const on = parseExpiryOnYmd(opts.expiryOnYmd);
  if (on) {
    return Prisma.sql`AND il."expiryDate"::date <= CAST(${on} AS date)`;
  }
  switch (opts.preset) {
    case "expired":
      return Prisma.sql`AND il."expiryDate" < CURRENT_DATE AND il."quantity" > 0`;
    case "soon":
      return Prisma.sql`AND il."expiryDate" >= CURRENT_DATE AND il."expiryDate" <= CURRENT_DATE + ${EXPIRY_SOON_DAYS} * INTERVAL '1 day' AND il."quantity" > 0`;
    case "valid":
      return Prisma.sql`AND il."expiryDate" >= CURRENT_DATE`;
    default:
      return Prisma.sql``;
  }
}

export function hasActiveExpiryFilter(preset: string, expiryOnYmd: string): boolean {
  return Boolean(parseExpiryOnYmd(expiryOnYmd) || parseExpiryPreset(preset));
}
