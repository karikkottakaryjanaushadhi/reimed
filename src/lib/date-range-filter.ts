import { Prisma } from "@prisma/client";
import { parseAppYmdEnd, parseAppYmdStart } from "@/lib/app-timezone";

function parseAppDateTime(raw: string): Date | undefined {
  const value = raw.trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}(:[0-9]{2})?)?$/.test(value)) {
    return undefined;
  }
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    return parseAppYmdStart(value);
  }
  const withSeconds = value.length === 16 ? `${value}:00+05:30` : `${value}+05:30`;
  const date = new Date(withSeconds);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Parse yyyy-mm-dd or yyyy-mm-ddTHH:MM as IST for `createdAt` search. */
export function createdAtDatetimeRange(
  fromRaw: unknown,
  toRaw: unknown,
): Prisma.DateTimeFilter | undefined {
  const from = typeof fromRaw === "string" ? parseAppDateTime(fromRaw) : undefined;
  let to = typeof toRaw === "string" ? parseAppDateTime(toRaw) : undefined;
  if (typeof toRaw === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(toRaw.trim())) {
    to = parseAppYmdEnd(toRaw.trim());
  }
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return filter;
}

/** Parse yyyy-mm-dd as IST day boundaries for `createdAt` filters. */
export function createdAtDayRange(
  fromRaw: unknown,
  toRaw: unknown,
): Prisma.DateTimeFilter | undefined {
  const from = typeof fromRaw === "string" ? parseAppYmdStart(fromRaw) : undefined;
  const to = typeof toRaw === "string" ? parseAppYmdEnd(toRaw) : undefined;
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = from;
  if (to) filter.lte = to;
  return filter;
}

export function trimDateParam(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

/** Equality fragments for a Prisma datetime filter (no leading AND). */
export function sqlDateTimeRangeParts(column: Prisma.Sql, range?: Prisma.DateTimeFilter): Prisma.Sql[] {
  if (!range) return [];
  const parts: Prisma.Sql[] = [];
  if (range.gte) parts.push(Prisma.sql`${column} >= ${range.gte}`);
  if (range.lte) parts.push(Prisma.sql`${column} <= ${range.lte}`);
  return parts;
}

/** `AND col >= from AND col <= to` from a Prisma datetime filter, or empty. */
export function sqlAndDateTimeRange(column: Prisma.Sql, range?: Prisma.DateTimeFilter): Prisma.Sql {
  const parts = sqlDateTimeRangeParts(column, range);
  if (parts.length === 0) return Prisma.empty;
  return Prisma.sql`AND ${Prisma.join(parts, " AND ")}`;
}

export function sqlIlikePattern(raw: string): string {
  return `%${raw.trim()}%`;
}
