import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withServerTimedCache } from "@/lib/server-timed-cache";
import { sqlIlikePattern } from "@/lib/date-range-filter";

export const POS_NAME_SUGGESTION_LIMIT = 20;
const POS_NAME_RECENT_SCAN = 150;

export type PosNameField = "doctor" | "patient";

function dedupeRecentNames(rows: Array<{ name: string | null }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= POS_NAME_SUGGESTION_LIMIT) break;
  }
  return out;
}

async function recentDoctorNames(storeId: string): Promise<string[]> {
  const rows = await prisma.sale.findMany({
    where: { storeId, doctorName: { not: null } },
    select: { doctorName: true },
    orderBy: { createdAt: "desc" },
    take: POS_NAME_RECENT_SCAN,
  });
  return dedupeRecentNames(rows.map((r) => ({ name: r.doctorName })));
}

async function recentPatientNames(storeId: string): Promise<string[]> {
  const rows = await prisma.sale.findMany({
    where: { storeId, customerName: { not: null } },
    select: { customerName: true },
    orderBy: { createdAt: "desc" },
    take: POS_NAME_RECENT_SCAN,
  });
  return dedupeRecentNames(rows.map((r) => ({ name: r.customerName })));
}

async function matchingNames(
  storeId: string,
  column: "doctorName" | "customerName",
  q: string,
): Promise<string[]> {
  const col = column === "doctorName" ? Prisma.sql`s."doctorName"` : Prisma.sql`s."customerName"`;
  const needle = q.trim();
  const rows = await prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
    SELECT t."name"
    FROM (
      SELECT DISTINCT ${col} AS "name"
      FROM "Sale" s
      WHERE s."storeId" = ${storeId}
        AND ${col} IS NOT NULL
        AND ${col} ILIKE ${sqlIlikePattern(needle)}
    ) t
    ORDER BY
      CASE
        WHEN LOWER(TRIM(t."name")) = LOWER(${needle}) THEN 0
        WHEN t."name" ILIKE ${`${needle}%`} THEN 1
        WHEN t."name" ILIKE ${`% ${needle}%`} THEN 2
        ELSE 3
      END,
      LENGTH(t."name"),
      t."name" ASC
    LIMIT ${POS_NAME_SUGGESTION_LIMIT}
  `);
  return rows.map((r) => r.name?.trim() ?? "").filter(Boolean);
}

/** Recent names, or search matches ranked exact → prefix → word-start → substring. */
export async function getPosNameSuggestions(params: {
  storeId: string;
  field: PosNameField;
  q?: string;
}): Promise<string[]> {
  const q = params.q?.trim() ?? "";
  return withServerTimedCache(
    "pos-name-suggestions",
    { storeId: params.storeId, field: params.field, q },
    20_000,
    async () => {
      if (params.field === "doctor") {
        return q ? matchingNames(params.storeId, "doctorName", q) : recentDoctorNames(params.storeId);
      }
      return q ? matchingNames(params.storeId, "customerName", q) : recentPatientNames(params.storeId);
    },
  );
}
