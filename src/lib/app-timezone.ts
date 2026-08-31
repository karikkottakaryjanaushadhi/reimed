export const APP_TIMEZONE = "Asia/Kolkata";
export const APP_LOCALE = "en-IN";

type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input);
}

function formatParts(input: DateInput, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIMEZONE, ...options }).formatToParts(
    toDate(input),
  );
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

/** dd MMM yyyy in Indian time. */
export function formatAppDateShort(input: DateInput): string {
  const parts = formatParts(input, { day: "2-digit", month: "short", year: "numeric" });
  return `${partValue(parts, "day")} ${partValue(parts, "month")} ${partValue(parts, "year")}`;
}

/** h:mm am/pm in Indian time. */
export function formatAppTime(input: DateInput): string {
  const parts = formatParts(input, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const period = partValue(parts, "dayPeriod");
  return `${partValue(parts, "hour")}:${partValue(parts, "minute")}${period ? ` ${period}` : ""}`;
}

/** yyyy-mm-dd in Indian time (for filters and "today" defaults). */
export function formatAppDateYmd(input: DateInput = new Date()): string {
  const parts = formatParts(input, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${partValue(parts, "year")}-${partValue(parts, "month")}-${partValue(parts, "day")}`;
}

/** First day of the IST calendar month (yyyy-mm-dd). */
export function formatAppMonthStartYmd(input: DateInput = new Date()): string {
  return `${formatAppDateYmd(input).slice(0, 8)}01`;
}

/** Last day of the IST calendar month (yyyy-mm-dd). */
export function formatAppMonthEndYmd(input: DateInput = new Date()): string {
  const ymd = formatAppDateYmd(input);
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${ymd.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;
}

/** dd MMM yyyy, h:mm am/pm in Indian time. */
export function formatAppDateTime(input: DateInput): string {
  return `${formatAppDateShort(input)} ${formatAppTime(input)}`;
}

/** dd MMM yyyy · h:mm am/pm in Indian time. */
export function formatAppDateTimeDot(input: DateInput): string {
  return `${formatAppDateShort(input)} · ${formatAppTime(input)}`;
}

/** dd-MM-yyyy in Indian time. */
export function formatAppDateDmy(input: DateInput): string {
  const parts = formatParts(input, { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${partValue(parts, "day")}-${partValue(parts, "month")}-${partValue(parts, "year")}`;
}

/** dd-MMM-yyyy in Indian time. */
export function formatAppDateShortDmy(input: DateInput): string {
  const parts = formatParts(input, { day: "2-digit", month: "short", year: "numeric" });
  return `${partValue(parts, "day")}-${partValue(parts, "month")}-${partValue(parts, "year")}`;
}

/** Start of calendar day in IST for yyyy-mm-dd. */
export function parseAppYmdStart(ymd: string): Date | undefined {
  const value = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** End of calendar day in IST for yyyy-mm-dd. */
export function parseAppYmdEnd(ymd: string): Date | undefined {
  const value = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T23:59:59.999+05:30`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Same IST calendar day as sales list filters and edit rules. */
export function isSameAppDay(a: DateInput, b: DateInput = new Date()): boolean {
  return formatAppDateYmd(a) === formatAppDateYmd(b);
}
