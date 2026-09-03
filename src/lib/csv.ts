import { NextResponse } from "next/server";

const BOM = "\uFEFF";

export type CsvCell = string | number | null | undefined;

export function csvEscapeField(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [
    headers.map(csvEscapeField).join(","),
    ...rows.map((row) => row.map(csvEscapeField).join(",")),
  ];
  return `${BOM}${lines.join("\r\n")}\r\n`;
}

export function csvFilename(name: string): string {
  const trimmed = name.trim() || "export.csv";
  const withExt = trimmed.toLowerCase().endsWith(".csv") ? trimmed : `${trimmed}.csv`;
  return withExt.replace(/[^\w.\-]+/g, "_");
}

export function csvResponse(filename: string, headers: string[], rows: CsvCell[][]): NextResponse {
  const safe = csvFilename(filename);
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}
