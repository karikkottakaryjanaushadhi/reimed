/**
 * Wipes application tables and loads products + inventory from an EasyTab backup SQL export
 * (via scripts/easytab_stock_export.py). Recreates admin/cashier users and one store.
 *
 * Usage:
 *   npm run db:import-easytab [path/to/backup.sql]
 *
 * Default backup path: data/easytab-backup.sql (copy your dump there, or pass an explicit path.)
 *
 * Requires: python3, DATABASE_URL (PostgreSQL, same as Prisma).
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { normalizeInventoryLotExpiryDate } from "@/lib/inventory-lot-expiry";
import { upsertInventoryLotStockFromPurchase } from "@/lib/inventory-lot-upsert";
import { snapProductGstPct } from "@/lib/product-gst-slabs";
import { storeUpper, storeUpperOpt } from "@/lib/store-text";

const prisma = new PrismaClient();

type SupplierRow = {
  legacySupplierCode: number;
  name: string;
  company?: string | null;
  address?: string | null;
  gstin?: string | null;
  phone?: string | null;
  phoneAlt?: string | null;
  contactPerson?: string | null;
  drugLicense1?: string | null;
  drugLicense2?: string | null;
};

type StockRow = {
  pcode: string;
  pcode_int: number | null;
  batchno: string | null;
  expd: string | null;
  rate: number | null;
  mrp: number | null;
  stock: number;
  wspacking?: number | null;
  product_name: string;
  strip_size: number | string | null;
  unit_label?: string | null;
  hsn?: string | null;
  /** Manufacturer / brand from EasyTab manucomp (product.manucode). */
  brand_name?: string | null;
  /** Combined GST % from GST_MASTER.GSTRATE via product.GSTID (easytab_stock_export.py). */
  gstPct?: number | null;
  /** EasyTab stockmaster.scode → Supplier.legacySupplierCode */
  scode?: number | null;
};

function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function parseExpiry(raw: string | null | undefined): Date {
  if (!raw || typeof raw !== "string") return normalizeInventoryLotExpiryDate("2099-12-31");
  try {
    return normalizeInventoryLotExpiryDate(raw);
  } catch {
    const d = new Date(raw.trim());
    return Number.isNaN(d.getTime())
      ? normalizeInventoryLotExpiryDate("2099-12-31")
      : normalizeInventoryLotExpiryDate(d);
  }
}

function packSizeFromStrip(strip: number | string | null | undefined): number {
  if (strip === null || strip === undefined || strip === "") return 1;
  const n = typeof strip === "number" ? strip : parseFloat(String(strip).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n));
}

function unitFromRow(row: StockRow): string {
  const u = (row.unit_label || "").trim();
  if (u) return u.slice(0, 50);
  return "unit";
}

function toDecimal(n: number | null | undefined): Prisma.Decimal {
  const v = n === null || n === undefined || Number.isNaN(Number(n)) ? 0 : Number(n);
  return new Prisma.Decimal(v);
}

async function wipe() {
  await prisma.saleReturnLine.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.saleLine.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.purchaseLine.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.inventoryLot.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.storeSettings.deleteMany();
  await prisma.storeUser.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  const root = repoRoot();
  const scriptSql = path.resolve(process.argv[2] || path.join(root, "data", "easytab-backup.sql"));
  if (!fs.existsSync(scriptSql)) {
    console.error(`Missing script: ${scriptSql}`);
    process.exit(1);
  }

  const tmpCsv = path.join(os.tmpdir(), `reimed_easytab_${Date.now()}.csv`);
  const py = path.join(root, "scripts", "easytab_stock_export.py");
  execFileSync("python3", [py, scriptSql, tmpCsv], { stdio: "inherit", cwd: root });

  const stem = tmpCsv.replace(/\.csv$/i, "");
  const suppliersPath = `${stem}_suppliers.json`;
  const stockPath = `${stem}_stock.json`;
  const brandsPath = `${stem}_brands.json`;
  const suppliers: SupplierRow[] = JSON.parse(fs.readFileSync(suppliersPath, "utf-8")) as SupplierRow[];
  const stock: StockRow[] = JSON.parse(fs.readFileSync(stockPath, "utf-8")) as StockRow[];

  await wipe();

  const passwordHash = await bcrypt.hash("19233", 12);
  const admin = await prisma.user.create({
    data: {
      email: "admin@19233",
      passwordHash,
      name: storeUpper("Store Admin"),
    },
  });
  const cashier = await prisma.user.create({
    data: {
      email: "cashier@19233",
      passwordHash,
      name: storeUpper("Front Cashier"),
    },
  });

  const store = await prisma.store.create({
    data: {
      name: storeUpper("Chelimparamba"),
      billShopName: storeUpper("PRADHANMANTRI BHARTIYA JANAUSHADHI KENDRA"),
      address: storeUpper(
        "10/417,Chelimparamba, Eruvessy, Taliparamba, Kannur, Kerala, India - 670632",
      ),
      phone: "8281182828, 9633058038",
      email: "janaushadhichelimparamba@gmail.com",
      drugLicenseLine: storeUpper("RLF20KL2025002347, RLF21KL2025002336"),
      settings: { create: { nextBillNo: 1001, nextPurchaseNo: 1 } },
    },
  });

  await prisma.storeUser.create({
    data: { userId: admin.id, storeId: store.id, role: "MANAGER" },
  });
  await prisma.storeUser.create({
    data: { userId: cashier.id, storeId: store.id, role: "CASHIER" },
  });

  const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  for (const part of chunk(suppliers, 80)) {
    await prisma.supplier.createMany({
      data: part.map((s) => ({
        name: storeUpper(s.name).slice(0, 500),
        company: storeUpperOpt(s.company)?.slice(0, 500),
        address: storeUpperOpt(s.address)?.slice(0, 2000),
        gstin: storeUpperOpt(s.gstin)?.slice(0, 32),
        phone: storeUpperOpt(s.phone)?.slice(0, 64),
        phoneAlt: storeUpperOpt(s.phoneAlt)?.slice(0, 64),
        contactPerson: storeUpperOpt(s.contactPerson)?.slice(0, 200),
        drugLicense1: storeUpperOpt(s.drugLicense1)?.slice(0, 120),
        drugLicense2: storeUpperOpt(s.drugLicense2)?.slice(0, 120),
        legacySupplierCode: s.legacySupplierCode,
      })),
    });
  }

  const supplierRows = await prisma.supplier.findMany({
    where: { legacySupplierCode: { not: null } },
    select: { id: true, legacySupplierCode: true },
  });
  const supplierIdByScode = new Map<number, string>();
  for (const s of supplierRows) {
    if (s.legacySupplierCode != null) supplierIdByScode.set(s.legacySupplierCode, s.id);
  }

  const pcodeKey = (row: StockRow): string => {
    if (row.pcode_int != null) return String(row.pcode_int);
    return String(row.pcode ?? "").trim() || "unknown";
  };

  const productByPcode = new Map<string, { id: string }>();
  const uniqueProducts = new Map<string, StockRow>();
  for (const row of stock) {
    const k = pcodeKey(row);
    if (!uniqueProducts.has(k)) uniqueProducts.set(k, row);
  }

  const brandNames = new Set<string>();
  if (fs.existsSync(brandsPath)) {
    const fromFile = JSON.parse(fs.readFileSync(brandsPath, "utf-8")) as { name?: string }[];
    for (const b of fromFile) {
      const n = typeof b?.name === "string" ? b.name.trim() : "";
      if (n) brandNames.add(storeUpper(n).slice(0, 200));
    }
  }
  for (const row of uniqueProducts.values()) {
    const n = row.brand_name?.trim();
    if (n) brandNames.add(storeUpper(n).slice(0, 200));
  }
  for (const nm of brandNames) {
    await prisma.brand.upsert({
      where: { name: nm },
      create: { name: nm },
      update: {},
    });
  }
  const allBrands = await prisma.brand.findMany({ select: { id: true, name: true } });
  const brandIdByName = new Map(allBrands.map((b) => [b.name, b.id]));

  for (const part of chunk([...uniqueProducts.values()], 100)) {
    await prisma.$transaction(
      part.map((row) => {
        const k = pcodeKey(row);
        const sku = storeUpper(`P${k}`).slice(0, 120);
        const name = storeUpper(row.product_name || `Product ${k}`).slice(0, 500);
        const bn = row.brand_name?.trim() ? storeUpper(row.brand_name.trim()).slice(0, 200) : undefined;
        const brandId = bn ? brandIdByName.get(bn) : undefined;
        const hsnStored = storeUpperOpt(row.hsn)?.slice(0, 32);
        const gstPct = new Prisma.Decimal(snapProductGstPct(row.gstPct));
        return prisma.product.create({
          data: {
            sku,
            name,
            brandId: brandId ?? undefined,
            packSize: packSizeFromStrip(row.strip_size),
            unit: storeUpper(unitFromRow(row)).slice(0, 50),
            hsn: hsnStored,
            gstPct,
          },
        });
      }),
    );
  }

  const allProducts = await prisma.product.findMany({ select: { id: true, sku: true } });
  for (const p of allProducts) {
    const m = /^P(.+)$/.exec(p.sku);
    if (m) productByPcode.set(m[1], { id: p.id });
  }

  for (const part of chunk(stock, 150)) {
    await prisma.$transaction(async (tx) => {
      for (const row of part) {
        const k = pcodeKey(row);
        const prod = productByPcode.get(k);
        if (!prod) throw new Error(`Missing product for pcode ${k}`);
        const batch = storeUpper(String(row.batchno ?? "").trim() || "—").slice(0, 80);
        const mrpD = toDecimal(row.mrp);
        const sc =
          typeof row.scode === "number" && row.scode > 0 ? supplierIdByScode.get(row.scode) : undefined;
        const stockIn = Math.max(0, Math.floor(row.stock));
        if (stockIn <= 0) continue;
        await upsertInventoryLotStockFromPurchase(tx, {
          storeId: store.id,
          productId: prod.id,
          batchNo: batch.slice(0, 80),
          expiryDate: parseExpiry(row.expd ?? null),
          supplierId: sc ?? null,
          stockIn,
          pricing: {
            costPrice: toDecimal(row.rate),
            mrp: mrpD,
            saleRate: mrpD,
            salesDiscountPct: new Prisma.Decimal(0),
            salesDiscountRs: new Prisma.Decimal(0),
          },
        });
      }
    });
  }

  try {
    fs.unlinkSync(tmpCsv);
    fs.unlinkSync(suppliersPath);
    fs.unlinkSync(stockPath);
    if (fs.existsSync(brandsPath)) fs.unlinkSync(brandsPath);
  } catch {
    /* ignore */
  }

  const nProd = await prisma.product.count();
  const nLot = await prisma.inventoryLot.count();
  const nSup = await prisma.supplier.count();
  const nBrand = await prisma.brand.count();
  console.log(
    `Import OK. Suppliers: ${nSup}, brands: ${nBrand}, products: ${nProd}, lots: ${nLot}. Log in: admin@19233 / 19233`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
