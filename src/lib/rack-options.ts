import { prisma } from "@/lib/prisma";
import { sortRacksByCode } from "@/lib/product-racks";

/** Rack id/code list for product filters and inline editors. */
export async function getRackOptions() {
  const racks = await prisma.rack.findMany({
    select: { id: true, code: true },
  });
  return sortRacksByCode(racks);
}
