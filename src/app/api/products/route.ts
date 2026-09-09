import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { drugCodeFromUserInput, drugCodeSearchLikePattern, janaushadhiDrugCodeValidationError, resolveProductSkuFromDrugCode } from "@/lib/drug-code";
import { prisma } from "@/lib/prisma";
import { compactSearchKey, sortByProductSearchRelevance } from "@/lib/search-normalize";
import { isProductGstSlab } from "@/lib/product-gst-slabs";
import { isProductCategory } from "@/lib/product-categories";
import { isProductType } from "@/lib/product-types";
import { isProductSchedule } from "@/lib/product-schedules";
import { storeUpper, storeUpperNull, storeUpperOpt } from "@/lib/store-text";

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const searchSku = searchParams.get("searchSku") !== "0";

  if (!q) {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true,
        sku: true,
        name: true,
        genericName: true,
        productCategory: true,
        productType: true,
        productSchedule: true,
        packSize: true,
        gstPct: true,
        reorderMin: true,
        brandId: true,
        brand: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ products });
  }

  const needle = compactSearchKey(q).replace(/%/g, "").replace(/_/g, "");
  if (!needle) {
    return NextResponse.json({ products: [] });
  }
  const likePat = `%${needle}%`;
  const codePat = drugCodeSearchLikePattern(q);
  const skuSearchSql =
    searchSku && codePat ? Prisma.sql`OR lower(p."sku") LIKE ${codePat}` : Prisma.empty;

  const found = await prisma.$queryRaw<
    Array<{
      id: string;
      sku: string;
      name: string;
      genericName: string | null;
      productCategory: string;
      productType: string;
      productSchedule: string;
      packSize: number;
      gstPct: unknown;
      reorderMin: number;
      brandId: string | null;
      brandIdJoin: string | null;
      brandName: string | null;
    }>
  >(
    Prisma.sql`
      SELECT p."id" AS "id",
             p."sku" AS "sku",
             p."name" AS "name",
             p."genericName" AS "genericName",
             p."productCategory" AS "productCategory",
             p."productType" AS "productType",
             p."productSchedule" AS "productSchedule",
             p."packSize" AS "packSize",
             p."gstPct" AS "gstPct",
             p."reorderMin" AS "reorderMin",
             p."brandId" AS "brandId",
             br."id" AS "brandIdJoin",
             br."name" AS "brandName"
      FROM "Product" p
      LEFT JOIN "Brand" br ON br."id" = p."brandId"
      WHERE replace(lower(p."name"), ' ', '') LIKE ${likePat}
         OR replace(lower(COALESCE(br."name", '')), ' ', '') LIKE ${likePat}
         OR replace(lower(COALESCE(p."genericName", '')), ' ', '') LIKE ${likePat}
         ${skuSearchSql}
      LIMIT 80
    `,
  );

  const mapped = found.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    genericName: p.genericName,
    productCategory: p.productCategory,
    productType: p.productType,
    productSchedule: p.productSchedule,
    packSize: p.packSize,
    gstPct: p.gstPct,
    reorderMin: p.reorderMin,
    brandId: p.brandId,
    brand: p.brandIdJoin && p.brandName ? { id: p.brandIdJoin, name: p.brandName } : null,
  }));
  const products = sortByProductSearchRelevance(mapped, q, (p) => p.name).slice(0, 50);

  return NextResponse.json({ products });
}

const createSchema = z.object({
  /** Optional drug code (stored in Product.sku). Auto-generated when omitted. */
  drugCode: z.string().optional(),
  /** @deprecated Prefer drugCode */
  sku: z.string().optional(),
  name: z.string().min(1),
  brandId: z.string().min(1).optional(),
  /** If set without brandId, upserts Brand by name and links. */
  brandName: z.string().optional(),
  genericName: z.string().optional(),
  packSize: z.number().int().min(1).optional(),
  hsn: z.string().optional(),
  reorderMin: z.number().int().min(0).optional(),
  productCategory: z
    .string()
    .refine((v) => isProductCategory(v), { message: "Invalid product category" })
    .optional(),
  productType: z
    .string()
    .refine((v) => isProductType(v), { message: "Invalid product type" })
    .optional(),
  productSchedule: z
    .string()
    .refine((v) => isProductSchedule(v), { message: "Invalid product schedule" })
    .optional(),
  gstPct: z
    .number()
    .refine((n) => isProductGstSlab(n), { message: "GST % must be 0, 5, 18, or 40" })
    .optional(),
}).superRefine((val, ctx) => {
  const err = janaushadhiDrugCodeValidationError(
    val.productCategory,
    val.drugCode ?? val.sku,
  );
  if (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ["drugCode"] });
  }
});

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const explicitDrugCode =
    drugCodeFromUserInput(parsed.data.drugCode, parsed.data.productCategory) ??
    drugCodeFromUserInput(parsed.data.sku, parsed.data.productCategory);
  const { sku: initialSku, explicit: explicitSku } = resolveProductSkuFromDrugCode(
    explicitDrugCode,
    parsed.data.productCategory,
  );
  let sku = initialSku;

  let resolvedBrandId: string | null = null;
  const bid = parsed.data.brandId?.trim();
  if (bid) {
    resolvedBrandId = bid;
  } else {
    const bn = parsed.data.brandName?.trim();
    if (bn) {
      const brandName = storeUpper(bn);
      const b = await prisma.brand.upsert({
        where: { name: brandName },
        create: { name: brandName },
        update: {},
      });
      resolvedBrandId = b.id;
    }
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const p = await prisma.product.create({
        data: {
          sku,
          name: storeUpper(parsed.data.name),
          brandId: resolvedBrandId,
          genericName: storeUpperNull(parsed.data.genericName),
          packSize: parsed.data.packSize ?? 1,
          unit: "UNIT",
          hsn: storeUpperOpt(parsed.data.hsn),
          reorderMin: parsed.data.reorderMin ?? 0,
          ...(parsed.data.productCategory !== undefined
            ? { productCategory: parsed.data.productCategory }
            : {}),
          ...(parsed.data.productType !== undefined
            ? { productType: parsed.data.productType }
            : {}),
          ...(parsed.data.productSchedule !== undefined
            ? { productSchedule: parsed.data.productSchedule }
            : {}),
          ...(parsed.data.gstPct !== undefined ? { gstPct: parsed.data.gstPct } : {}),
        },
        include: { brand: { select: { id: true, name: true } } },
      });
      return NextResponse.json({ product: p });
    } catch (e) {
      const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (dup && !explicitSku && attempt < 5) {
        sku = resolveProductSkuFromDrugCode().sku;
        continue;
      }
      if (dup && explicitSku) {
        return NextResponse.json({ error: "Drug code may already exist" }, { status: 409 });
      }
      console.error(e);
      return NextResponse.json({ error: "Could not create product" }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "Could not allocate drug code" }, { status: 409 });
}
