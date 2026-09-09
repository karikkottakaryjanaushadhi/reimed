import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import {
  drugCodeFromUserInput,
  janaushadhiDrugCodeValidationError,
} from "@/lib/drug-code";
import { prisma } from "@/lib/prisma";
import { storeUpper, storeUpperNull } from "@/lib/store-text";
import { isProductGstSlab } from "@/lib/product-gst-slabs";
import { isProductCategory } from "@/lib/product-categories";
import { isProductType } from "@/lib/product-types";
import { isProductSchedule } from "@/lib/product-schedules";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  drugCode: z.string().optional(),
  brandId: z.union([z.string().min(1), z.null()]).optional(),
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
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id } = await params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const existing = await prisma.product.findUnique({
    where: { id },
    select: { productCategory: true, sku: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const category = parsed.data.productCategory ?? existing.productCategory;
  let nextDrugCode: string | undefined;
  if (parsed.data.drugCode !== undefined) {
    const drugErr = janaushadhiDrugCodeValidationError(category, parsed.data.drugCode);
    if (drugErr) return NextResponse.json({ error: drugErr }, { status: 400 });
    nextDrugCode = drugCodeFromUserInput(parsed.data.drugCode, category);
  }

  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(parsed.data.name != null ? { name: storeUpper(parsed.data.name) } : {}),
        ...(nextDrugCode ? { sku: nextDrugCode } : {}),
      ...(parsed.data.packSize != null ? { packSize: parsed.data.packSize } : {}),
      ...(parsed.data.hsn != null ? { hsn: storeUpperNull(parsed.data.hsn) } : {}),
      ...(parsed.data.reorderMin != null ? { reorderMin: parsed.data.reorderMin } : {}),
      ...(parsed.data.brandId !== undefined ? { brandId: parsed.data.brandId } : {}),
      ...(parsed.data.genericName !== undefined
        ? { genericName: storeUpperNull(parsed.data.genericName) }
        : {}),
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
    return NextResponse.json({ product });
  } catch (e) {
    const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
    if (dup) {
      return NextResponse.json({ error: "Drug code may already exist" }, { status: 409 });
    }
    throw e;
  }
}
