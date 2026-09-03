import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { drugCodeFromUserInput, janaushadhiDrugCodeValidationError, resolveProductSkuFromDrugCode } from "@/lib/drug-code";
import { generatedProductSku } from "@/lib/generated-sku";
import { prisma } from "@/lib/prisma";
import { isProductGstSlab, snapProductGstPct } from "@/lib/product-gst-slabs";
import { isProductCategory } from "@/lib/product-categories";
import { isProductType } from "@/lib/product-types";
import { normalizeInventoryLotExpiryDate } from "@/lib/inventory-lot-expiry";
import { lotSalePricingFromPurchaseLine } from "@/lib/inventory-lot-pricing";
import { upsertInventoryLotStockFromPurchase } from "@/lib/inventory-lot-upsert";
import { storeUpper, storeUpperNull, storeUpperOpt } from "@/lib/store-text";

function apiErr(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.message;
  if (err instanceof Prisma.PrismaClientValidationError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not add line";
}

const newProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  brandId: z.string().optional(),
  genericName: z.string().optional(),
  packSize: z.number().int().min(1).optional(),
  unit: z.string().optional(),
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
  gstPct: z.number().refine((n) => isProductGstSlab(n), { message: "GST % must be 0, 5, 18, or 40" }).optional(),
  drugCode: z.string().optional(),
}).superRefine((val, ctx) => {
  const err = janaushadhiDrugCodeValidationError(val.productCategory, val.drugCode);
  if (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ["drugCode"] });
  }
});

const lineBodySchema = z
  .object({
    productId: z.string().min(1).optional(),
    newProduct: newProductSchema.optional(),
    batchNo: z.string().min(1),
    expiryDate: z.string().min(1),
    quantity: z.number().int().positive(),
    costPrice: z.number().nonnegative(),
    mrp: z.number().nonnegative(),
    pack: z.number().int().min(1).optional(),
    purchaseDiscountPct: z.number().nonnegative().optional(),
    purchaseDiscountRs: z.number().nonnegative().optional(),
    schemeDiscountPct: z.number().nonnegative().optional(),
    schemeDiscountRs: z.number().nonnegative().optional(),
    salesDiscountPct: z.number().nonnegative().optional(),
    salesDiscountRs: z.number().nonnegative().optional(),
    freeQty: z.number().int().nonnegative().optional(),
    gstPct: z.number().nonnegative().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasPid = !!(val.productId && val.productId.trim());
    const hasNew = !!val.newProduct;
    if (hasPid === hasNew) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each line needs exactly one of productId or newProduct",
      });
    }
  });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const { id: purchaseId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = lineBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const storeId = ctx.activeStoreId;

  try {
    const line = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, storeId },
        select: { id: true, complete: true, supplierId: true },
      });
      if (!purchase) throw new Error("not_found");
      if (purchase.complete) throw new Error("purchase_complete");
      const returnCount = await tx.purchaseReturn.count({
        where: { purchaseId, storeId },
      });
      if (returnCount > 0) throw new Error("purchase_has_returns");

      const l = parsed.data;
      let productId = l.productId?.trim();
      if (!productId && l.newProduct) {
        const np = l.newProduct;
        let brandId: string | null = null;
        const bid = np.brandId?.trim();
        if (bid) {
          const br = await tx.brand.findFirst({ where: { id: bid }, select: { id: true } });
          brandId = br?.id ?? null;
        }
        if (!brandId && np.brand?.trim()) {
          const brandName = storeUpper(np.brand);
          const b = await tx.brand.upsert({
            where: { name: brandName },
            create: { name: brandName },
            update: {},
          });
          brandId = b.id;
        }
        const { sku: initialSku, explicit: explicitSku } = resolveProductSkuFromDrugCode(
          drugCodeFromUserInput(np.drugCode, np.productCategory),
          np.productCategory,
        );
        let sku = initialSku;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const created = await tx.product.create({
              data: {
                sku,
                name: storeUpper(np.name),
                brandId,
                genericName: storeUpperNull(np.genericName),
                packSize: np.packSize ?? 1,
                unit: storeUpper(np.unit?.trim() || "UNIT"),
                hsn: storeUpperOpt(np.hsn),
                reorderMin: np.reorderMin ?? 0,
                ...(np.productCategory !== undefined ? { productCategory: np.productCategory } : {}),
                ...(np.productType !== undefined ? { productType: np.productType } : {}),
                ...(np.gstPct !== undefined ? { gstPct: np.gstPct } : {}),
              },
            });
            productId = created.id;
            break;
          } catch (e) {
            const uniqueSku =
              e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
            if (uniqueSku && !explicitSku && attempt < 4) {
              sku = generatedProductSku();
              continue;
            }
            throw e;
          }
        }
        if (!productId) throw new Error("product_create_failed");
      }
      if (!productId) throw new Error("missing_product");

      const productOk = await tx.product.findFirst({ where: { id: productId }, select: { id: true } });
      if (!productOk) throw new Error("invalid_product");

      let expiryDate: Date;
      try {
        expiryDate = normalizeInventoryLotExpiryDate(l.expiryDate);
      } catch {
        throw new Error("invalid_expiry");
      }

      const batchNo = storeUpper(l.batchNo);
      const pack = l.pack ?? 1;
      const cp = new Prisma.Decimal(l.costPrice);
      const mrp = new Prisma.Decimal(l.mrp);

      const created = await tx.purchaseLine.create({
        data: {
          purchaseId,
          productId,
          batchNo,
          expiryDate,
          quantity: l.quantity,
          freeQty: l.freeQty ?? 0,
          pack,
          costPrice: cp,
          mrp,
          purchaseDiscountPct: new Prisma.Decimal(l.purchaseDiscountPct ?? 0),
          purchaseDiscountRs: new Prisma.Decimal(l.purchaseDiscountRs ?? 0),
          schemeDiscountPct: new Prisma.Decimal(l.schemeDiscountPct ?? 0),
          schemeDiscountRs: new Prisma.Decimal(l.schemeDiscountRs ?? 0),
          salesDiscountPct: new Prisma.Decimal(l.salesDiscountPct ?? 0),
          salesDiscountRs: new Prisma.Decimal(l.salesDiscountRs ?? 0),
          gstPct: new Prisma.Decimal(snapProductGstPct(l.gstPct ?? 0)),
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });

      const stockIn = l.quantity + (l.freeQty ?? 0);
      const saleFields = lotSalePricingFromPurchaseLine({
        mrpPerPack: Number(created.mrp),
        salesDiscountPct: Number(created.salesDiscountPct),
        salesDiscountRs: Number(created.salesDiscountRs),
      });
      const lotSaleRate = new Prisma.Decimal(saleFields.saleRate);
      const lotSalesDiscPct = new Prisma.Decimal(saleFields.salesDiscountPct);
      const lotSalesDiscRs = new Prisma.Decimal(saleFields.salesDiscountRs);
      await upsertInventoryLotStockFromPurchase(tx, {
        storeId,
        productId,
        batchNo,
        expiryDate,
        supplierId: purchase.supplierId,
        stockIn,
        pricing: {
          costPrice: cp,
          mrp,
          saleRate: lotSaleRate,
          salesDiscountPct: lotSalesDiscPct,
          salesDiscountRs: lotSalesDiscRs,
        },
      });

      await tx.product.update({
        where: { id: productId },
        data: {
          packSize: Math.max(1, pack),
          gstPct: snapProductGstPct(l.gstPct ?? 0),
        },
      });

      return created;
    });

    return NextResponse.json({ line });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (msg === "purchase_complete") {
      return NextResponse.json(
        { error: "This purchase is finalized. Lines cannot be added (view only)." },
        { status: 403 },
      );
    }
    if (msg === "purchase_has_returns") {
      return NextResponse.json(
        { error: "This purchase has returns. Lines cannot be changed." },
        { status: 403 },
      );
    }
    if (msg === "invalid_product") return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    if (msg === "invalid_expiry") return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    if (msg === "missing_product" || msg === "product_create_failed") {
      return NextResponse.json({ error: "Could not resolve product for line" }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: apiErr(e) }, { status: 400 });
  }
}
