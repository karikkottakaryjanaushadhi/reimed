import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createdAtDayRange } from "@/lib/date-range-filter";
import { getAuthContext, isManager } from "@/lib/auth-context";
import { drugCodeFromUserInput, janaushadhiDrugCodeValidationError, resolveProductSkuFromDrugCode } from "@/lib/drug-code";
import { generatedProductSku } from "@/lib/generated-sku";
import { prisma } from "@/lib/prisma";
import { isProductGstSlab, snapProductGstPct } from "@/lib/product-gst-slabs";
import { isProductCategory } from "@/lib/product-categories";
import { normalizeInventoryLotExpiryDate } from "@/lib/inventory-lot-expiry";
import { lotSalePricingFromPurchaseLine } from "@/lib/inventory-lot-pricing";
import { upsertInventoryLotStockFromPurchase } from "@/lib/inventory-lot-upsert";
import { storeUpper, storeUpperNull, storeUpperOpt } from "@/lib/store-text";

function purchaseApiErrorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.message;
  if (err instanceof Prisma.PrismaClientValidationError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not save purchase";
}

const newProductSchema = z.object({
  name: z.string().min(1),
  /** Upsert brand by free-text name when brandId not sent */
  brand: z.string().optional(),
  /** Prefer existing brand row when client picked from search */
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
  gstPct: z.number().refine((n) => isProductGstSlab(n), { message: "GST % must be 0, 5, 18, or 40" }).optional(),
  drugCode: z.string().optional(),
}).superRefine((val, ctx) => {
  const err = janaushadhiDrugCodeValidationError(val.productCategory, val.drugCode);
  if (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ["drugCode"] });
  }
});

const lineSchema = z
  .object({
    productId: z.string().min(1).optional(),
    newProduct: newProductSchema.optional(),
    batchNo: z.string().min(1),
    expiryDate: z.string().min(1),
    quantity: z.number().int().positive(),
    costPrice: z.number().nonnegative(),
    mrp: z.number().nonnegative(),
    /** Units per billable pack (e.g. 10 for 10'S); omit or 1 for bottles (ML/GM/MD). */
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

const bodySchema = z.object({
  supplierId: z.string().min(1),
  invoiceRef: z.string().optional(),
  /** yyyy-mm-dd (required) */
  invoiceDate: z.string().refine((s) => s.trim().length > 0, { message: "Invoice date is required" }),
  notes: z.string().optional(),
  /** When true, purchase is finalized immediately (view only on detail page). Default false (still editing). */
  complete: z.boolean().optional(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.min(Number(searchParams.get("take") ?? "40"), 100);
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const dateFilter = createdAtDayRange(from || undefined, to || undefined);

  const purchases = await prisma.purchase.findMany({
    where: {
      storeId: ctx.activeStoreId,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      lines: { include: { product: { select: { name: true } } } },
    },
  });
  return NextResponse.json({ purchases });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(ctx)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const invDateStr = parsed.data.invoiceDate.trim();
  const invoiceDateVal = new Date(invDateStr);
  if (Number.isNaN(invoiceDateVal.getTime())) {
    return NextResponse.json({ error: "Invalid invoice date" }, { status: 400 });
  }

  const storeId = ctx.activeStoreId;

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const resolvedLines: Array<{
        productId: string;
        batchNo: string;
        expiryDate: Date;
        quantity: number;
        costPrice: number;
        mrp: number;
        pack: number;
        purchaseDiscountPct: number;
        purchaseDiscountRs: number;
        schemeDiscountPct: number;
        schemeDiscountRs: number;
        salesDiscountPct: number;
        salesDiscountRs: number;
        freeQty: number;
        gstPct: number;
      }> = [];

      for (const l of parsed.data.lines) {
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
          if (!productId) throw new Error("Could not create product (SKU collision)");
        }
        if (!productId) throw new Error("Missing product");

        resolvedLines.push({
          productId,
          batchNo: storeUpper(l.batchNo),
          expiryDate: normalizeInventoryLotExpiryDate(l.expiryDate),
          quantity: l.quantity,
          costPrice: l.costPrice,
          mrp: l.mrp,
          pack: l.pack ?? 1,
          purchaseDiscountPct: l.purchaseDiscountPct ?? 0,
          purchaseDiscountRs: l.purchaseDiscountRs ?? 0,
          schemeDiscountPct: l.schemeDiscountPct ?? 0,
          schemeDiscountRs: l.schemeDiscountRs ?? 0,
          salesDiscountPct: l.salesDiscountPct ?? 0,
          salesDiscountRs: l.salesDiscountRs ?? 0,
          freeQty: l.freeQty ?? 0,
          gstPct: snapProductGstPct(l.gstPct ?? 0),
        });
      }

      const settings = await tx.storeSettings.findUnique({ where: { storeId } });
      if (!settings) throw new Error("no settings");

      const purchaseNo = settings.nextPurchaseNo;
      await tx.storeSettings.update({
        where: { storeId },
        data: { nextPurchaseNo: { increment: 1 } },
      });

      const p = await tx.purchase.create({
        data: {
          storeId,
          purchaseNo,
          supplierId: parsed.data.supplierId,
          invoiceRef: storeUpperOpt(parsed.data.invoiceRef),
          invoiceDate: invoiceDateVal,
          notes: storeUpperOpt(parsed.data.notes),
          complete: parsed.data.complete ?? false,
          createdById: ctx.user.id,
          lines: {
            create: resolvedLines.map((row) => ({
              productId: row.productId,
              batchNo: row.batchNo,
              expiryDate: row.expiryDate,
              quantity: row.quantity,
              costPrice: row.costPrice,
              mrp: row.mrp,
              pack: row.pack,
              purchaseDiscountPct: row.purchaseDiscountPct,
              purchaseDiscountRs: row.purchaseDiscountRs,
              schemeDiscountPct: row.schemeDiscountPct,
              schemeDiscountRs: row.schemeDiscountRs,
              salesDiscountPct: row.salesDiscountPct,
              salesDiscountRs: row.salesDiscountRs,
              freeQty: row.freeQty,
              gstPct: row.gstPct,
            })),
          },
        },
        include: {
          lines: {
            select: {
              productId: true,
              batchNo: true,
              expiryDate: true,
              quantity: true,
              freeQty: true,
              costPrice: true,
              mrp: true,
              salesDiscountPct: true,
              salesDiscountRs: true,
            },
          },
        },
      });

      for (const line of p.lines) {
        const stockIn = line.quantity + line.freeQty;
        const saleFields = lotSalePricingFromPurchaseLine({
          mrpPerPack: Number(line.mrp),
          salesDiscountPct: Number(line.salesDiscountPct),
          salesDiscountRs: Number(line.salesDiscountRs),
        });
        await upsertInventoryLotStockFromPurchase(tx, {
          storeId,
          productId: line.productId,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          supplierId: parsed.data.supplierId,
          stockIn,
          pricing: {
            costPrice: line.costPrice,
            mrp: line.mrp,
            saleRate: new Prisma.Decimal(saleFields.saleRate),
            salesDiscountPct: new Prisma.Decimal(saleFields.salesDiscountPct),
            salesDiscountRs: new Prisma.Decimal(saleFields.salesDiscountRs),
          },
        });
      }

      // Keep Product.packSize and gstPct aligned with purchase line (POS / Batches read product master).
      for (const row of resolvedLines) {
        await tx.product.update({
          where: { id: row.productId },
          data: {
            packSize: Math.max(1, row.pack),
            gstPct: snapProductGstPct(row.gstPct),
          },
        });
      }

      return p;
    }, { maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({ purchase: { id: purchase.id, purchaseNo: purchase.purchaseNo } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: purchaseApiErrorMessage(e) }, { status: 400 });
  }
}
