import { saleLinePackSize } from "@/lib/inventory-lot-pack-size";
import { prisma } from "@/lib/prisma";
import { buildDotmatrixReceiptHtml, buildDotmatrixReceiptText, type DotmatrixReceiptSale } from "@/lib/dotmatrix-receipt";

export async function getDotmatrixReceiptForSale(saleId: string, storeId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, storeId },
    select: {
      billNo: true,
      createdAt: true,
      customerName: true,
      customerPhone: true,
      doctorName: true,
      subtotal: true,
      discount: true,
      tax: true,
      total: true,
      store: {
        select: {
          name: true,
          billShopName: true,
          address: true,
          phone: true,
          gstin: true,
          drugLicenseLine: true,
          email: true,
          billTerms: true,
        },
      },
      lines: {
        select: {
          qty: true,
          rate: true,
          amount: true,
          discountAmount: true,
          gstAmount: true,
          gstPct: true,
          packSize: true,
          product: {
            select: {
              name: true,
              genericName: true,
              packSize: true,
              brand: { select: { name: true } },
            },
          },
          lot: { select: { batchNo: true, expiryDate: true, mrp: true } },
        },
      },
    },
  });
  if (!sale) return null;

  const payload: DotmatrixReceiptSale = {
    billNo: sale.billNo,
    createdAt: sale.createdAt,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    doctorName: sale.doctorName,
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    tax: Number(sale.tax),
    total: Number(sale.total),
    store: {
      name: sale.store.name,
      billShopName: sale.store.billShopName,
      address: sale.store.address,
      phone: sale.store.phone,
      gstin: sale.store.gstin,
      drugLicenseLine: sale.store.drugLicenseLine,
      email: sale.store.email,
      billTerms: sale.store.billTerms,
    },
    lines: sale.lines.map((l) => ({
      product: {
        name: l.product.name,
        brandName: l.product.brand?.name ?? null,
        genericName: l.product.genericName,
        packSize: saleLinePackSize(l),
      },
      lot: {
        batchNo: l.lot.batchNo,
        expiryDate: l.lot.expiryDate,
        mrp: Number(l.lot.mrp),
      },
      qty: l.qty,
      rate: Number(l.rate),
      amount: Number(l.amount),
      discountAmount: Number(l.discountAmount),
      gstAmount: Number(l.gstAmount),
      gstPct: Number(l.gstPct),
    })),
  };

  return {
    text: buildDotmatrixReceiptText(payload),
    html: buildDotmatrixReceiptHtml(payload),
    billNo: sale.billNo,
  };
}
