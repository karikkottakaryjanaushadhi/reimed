import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/** Brand id/name list for inventory inline editors (cached to avoid repeated full-table reads). */
export const getBrandOptions = unstable_cache(
  async () =>
    prisma.brand.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ["brand-options"],
  { revalidate: 300 },
);
