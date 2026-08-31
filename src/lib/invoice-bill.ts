import { formatAppDateYmd } from "@/lib/app-timezone";

/** Normalize distributor invoice-style names like "22.72 | LANOL-ER TAB" → "LANOL-ER TAB" */
export function normalizeInvoiceProductName(raw: string): string {
  let s = raw.trim();
  const pipe = s.indexOf("|");
  if (pipe > 0) {
    const head = s.slice(0, pipe).trim();
    if (/^\d+(?:\.\d+)?$/.test(head)) {
      s = s.slice(pipe + 1).trim();
    }
  }
  return s.replace(/^\d+(?:\.\d+)?\s*\|\s*/i, "").trim();
}

/** dd/mm/yyyy (invoice print) → yyyy-mm-dd for date inputs */
export function parseDdMmYyyyToIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const y = Number.parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** yyyy-mm-dd → mm/yy for expiry entry display */
export function isoToExpiryMmYy(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m) return "";
  return `${m[2]}/${m[1].slice(-2)}`;
}

/** yyyy-mm-dd → dd/mm/yyyy for expiry display */
export function isoToExpiryDdMmYyyy(iso: string): string {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Format partial mm/yy typing (auto-inserts slash after month digits). */
export function formatExpiryMmYyTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d/]/g, "");
  const slashIdx = cleaned.indexOf("/");
  if (slashIdx >= 0) {
    const month = cleaned.slice(0, slashIdx).slice(0, 2);
    const year = cleaned.slice(slashIdx + 1).replace(/\D/g, "").slice(0, 2);
    if (!year.length) return month.length ? `${month}/` : "";
    return `${month}/${year}`;
  }
  const digits = cleaned.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Format partial dd/mm/yyyy typing (auto-inserts slashes). */
export function formatExpiryDdMmYyyyTyping(raw: string): string {
  const cleaned = raw.replace(/[^\d/]/g, "");
  const parts = cleaned.split("/");
  if (parts.length >= 3) {
    const day = parts[0].replace(/\D/g, "").slice(0, 2);
    const month = parts[1].replace(/\D/g, "").slice(0, 2);
    const year = parts.slice(2).join("").replace(/\D/g, "").slice(0, 4);
    if (!month.length) return day.length ? `${day}/` : day;
    if (!year.length) return `${day}/${month}${month.length === 2 ? "/" : ""}`;
    return `${day}/${month}/${year}`;
  }
  if (parts.length === 2) {
    const day = parts[0].replace(/\D/g, "").slice(0, 2);
    const month = parts[1].replace(/\D/g, "").slice(0, 2);
    if (!month.length) return day.length ? `${day}/` : day;
    return `${day}/${month}`;
  }
  const digits = cleaned.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isCompleteMmYy(text: string): boolean {
  return /^\d{1,2}\/\d{2}$/.test(text.trim());
}

function isCompleteDdMmYyyy(text: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text.trim());
}

function isCompleteDdMmYy(text: string): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{2}$/.test(text.trim());
}

/** dd/mm/yy → yyyy-mm-dd */
export function parseDdMmYyToIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const d = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10);
  const y = 2000 + Number.parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function expiryTypingMode(raw: string): "mmyy" | "dmy" {
  const cleaned = raw.replace(/[^\d/]/g, "");
  const slashCount = (cleaned.match(/\//g) ?? []).length;
  if (slashCount >= 2) return "dmy";
  if (slashCount === 1) {
    const [, after = ""] = cleaned.split("/");
    if (after.length <= 2 && cleaned.length <= 5) return "mmyy";
    return "dmy";
  }
  return cleaned.replace(/\D/g, "").length <= 4 ? "mmyy" : "dmy";
}

/** True when yyyy-mm-dd is today or later (IST calendar). */
export function isExpiryIsoOnOrAfterToday(iso: string, todayYmd = formatAppDateYmd()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= todayYmd;
}

/** Parse mm/yy (last day of month), dd/mm/yy, or dd/mm/yyyy expiry text → yyyy-mm-dd */
export function parseExpiryInputToIso(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let iso: string | null = null;
  if (isCompleteMmYy(trimmed)) iso = expiryMmYyToIso(trimmed);
  else if (isCompleteDdMmYyyy(trimmed)) iso = parseDdMmYyyyToIso(trimmed);
  else if (isCompleteDdMmYy(trimmed)) iso = parseDdMmYyToIso(trimmed);
  if (!iso || !isExpiryIsoOnOrAfterToday(iso)) return null;
  return iso;
}

/** mm/yy → yyyy-mm-dd (last calendar day of that month) */
export function expiryMmYyToIso(mmYy: string): string | null {
  const m = mmYy.trim().match(/^(\d{1,2})\/(\d{2})$/);
  if (!m) return null;
  const calMonth = Number.parseInt(m[1], 10);
  const y = 2000 + Number.parseInt(m[2], 10);
  if (calMonth < 1 || calMonth > 12 || Number.isNaN(y)) return null;
  const d = new Date(y, calMonth, 0);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${day}`;
}

/**
 * Invoice/CSV pack label → numeric units per billable pack (matches Product.packSize intent).
 * - Strip style `10'S`, `30'S`, `10S` → that count.
 * - Liquids/vials `100ML`, `2.5ML`, `GM`, metered `200MD`, etc. → 1 (single unit).
 * - Plain integer string → that value.
 */
export function parsePackValue(pack: string | undefined | null): number {
  if (pack == null) return 1;
  const s = String(pack).trim();
  if (!s) return 1;

  const compact = s.replace(/\s/g, "");

  const strip = /^(\d+)['']?S$/i.exec(compact);
  if (strip) {
    const n = Number.parseInt(strip[1], 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  // Bottle/vial/metered-dose unit (not a countable strip)
  if (/^(?:\d*\.?\d*)?(?:ML|GM|MD)$/i.test(compact)) return 1;

  const onlyDigits = /^\d+$/.exec(compact);
  if (onlyDigits) {
    const n = Number.parseInt(onlyDigits[0], 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  const first = Number.parseInt(/\d+/.exec(compact)?.[0] ?? "", 10);
  return Number.isFinite(first) && first > 0 ? first : 1;
}

export function guessPackSizeFromPack(pack: string | undefined): number {
  return parsePackValue(pack);
}

/** JSON/CSV may send pack as number or string (e.g. `10'S`). */
export function coercePackFromImport(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n > 0 ? n : 1;
  }
  if (typeof raw === "string") return parsePackValue(raw);
  return 1;
}

export type InvoiceBillJson = {
  invoice_details?: {
    invoice_number?: string;
    invoice_date?: string;
    order_date?: string;
    payment_mode?: string;
  };
  seller_details?: {
    name?: string;
    address?: string;
    gstin?: string;
    dl_no?: string;
  };
  buyer_details?: {
    name?: string;
    address?: string;
    dl_no?: string;
  };
  items?: Array<{
    product_name?: string;
    manufacturer?: string;
    /** Label or number; coerced with {@link coercePackFromImport} */
    pack?: string | number;
    quantity?: number;
    scheme_quantity?: number;
    batch?: string;
    expiry?: string;
    mrp?: number;
    trade_price?: number;
    gst_percent?: number;
    hsn_code?: string;
    value?: number;
    /** Scheme discount (Scm % / Sch % on distributor bill) */
    scheme_discount_pct?: number;
    scheme_discount_rs?: number;
    /** Purchase / trade discount (Dis %, CD %, P.Disc — not scheme) */
    purchase_discount_pct?: number;
    purchase_discount_rs?: number;
    /** @deprecated Ignored on import — set S.Disc manually after import, not from bill OCR */
    sales_discount_pct?: number;
    /** @deprecated Ignored on import */
    sales_discount_rs?: number;
  }>;
  billing_summary?: {
    gross_amount?: number;
    discount_amount?: number;
    taxable_amount?: number;
    total_gst?: number;
    cgst?: number;
    sgst?: number;
    round_off?: number;
    grand_total?: number;
  };
  bank_details?: {
    bank_name?: string;
    account_number?: string;
    branch?: string;
    ifsc?: string;
  };
};

/** Flat text saved on purchase when importing distributor JSON (audit trail). */
export function buildImportMetaNotes(data: InvoiceBillJson): string {
  const parts: string[] = [];
  const inv = data.invoice_details;
  if (inv?.order_date?.trim()) parts.push(`Order date: ${inv.order_date.trim()}`);
  if (inv?.payment_mode?.trim()) parts.push(`Payment: ${inv.payment_mode.trim()}`);
  const s = data.seller_details;
  if (s?.name?.trim()) {
    const bits = [
      s.name.trim(),
      s.address?.trim(),
      s.gstin?.trim() && `GSTIN ${s.gstin.trim()}`,
      s.dl_no?.trim() && `DL ${s.dl_no.trim()}`,
    ].filter(Boolean) as string[];
    parts.push(`Seller: ${bits.join(" · ")}`);
  }
  const b = data.buyer_details;
  if (b?.name?.trim()) {
    const bits = [
      b.name.trim(),
      b.address?.trim(),
      b.dl_no?.trim() && `DL ${b.dl_no.trim()}`,
    ].filter(Boolean) as string[];
    parts.push(`Buyer: ${bits.join(" · ")}`);
  }
  const bank = data.bank_details;
  if (bank?.bank_name?.trim()) {
    parts.push(
      `Bank: ${bank.bank_name.trim()} · A/C ${bank.account_number?.trim() ?? ""} · ${bank.branch?.trim() ?? ""} · IFSC ${bank.ifsc?.trim() ?? ""}`,
    );
  }
  return parts.join("\n");
}

/** Paste into Gemini (with bill image/PDF) for Add purchase → Import invoice JSON. */
export const INVOICE_GEMINI_EXTRACTION_PROMPT = `You are extracting data from an Indian pharmaceutical distributor tax invoice (photo or PDF).

Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:

{
  "invoice_details": {
    "invoice_number": "string",
    "invoice_date": "dd/mm/yyyy",
    "order_date": "dd/mm/yyyy or omit",
    "payment_mode": "CREDIT | CASH | etc or omit"
  },
  "seller_details": {
    "name": "distributor name from header",
    "address": "full address or omit",
    "gstin": "GST number or omit",
    "dl_no": "drug licence or omit"
  },
  "buyer_details": {
    "name": "customer/pharmacy name or omit",
    "address": "or omit",
    "dl_no": "or omit"
  },
  "items": [
    {
      "product_name": "medicine name only — strip leading codes like '22.72 | ' or rack codes",
      "manufacturer": "brand/mfr/mfac column e.g. ASTO, COLGT, CIPLA — NOT the distributor name",
      "pack": "exactly as printed e.g. 10'S, 30ML., 1'S, 100ML, 50GM",
      "quantity": number_of_packs_sold,
      "scheme_quantity": free_packs_from_F/R_or_scheme_column_or_0,
      "batch": "batch number",
      "expiry": "mm/yy",
      "mrp": mrp_per_pack_number,
      "trade_price": purchase_rate_per_pack_before_line_GST,
      "gst_percent": 0_or_5_or_18_or_40,
      "hsn_code": "string or omit",
      "value": line_value_before_tax_if_shown_or_omit,
      "scheme_discount_pct": number_or_0,
      "scheme_discount_rs": number_or_0,
      "purchase_discount_pct": number_or_0,
      "purchase_discount_rs": number_or_0
    }
  ],
  "billing_summary": {
    "gross_amount": number_or_omit,
    "discount_amount": number_or_omit,
    "taxable_amount": number_or_omit,
    "total_gst": number_or_omit,
    "cgst": number_or_omit,
    "sgst": number_or_omit,
    "round_off": number_or_omit,
    "grand_total": number_or_omit
  },
  "bank_details": {
    "bank_name": "or omit",
    "account_number": "or omit",
    "branch": "or omit",
    "ifsc": "or omit"
  }
}

CRITICAL RULES:
1. Extract EVERY product line from ALL pages. Do NOT stop after 10 rows. Do NOT summarize.
2. quantity and scheme_quantity are in PACKS (strips/bottles), NOT tablets.
3. trade_price = S.Rate / Trade Price / billing rate PER PACK.
4. mrp = MRP per pack.
5. expiry always mm/yy; invoice_date always dd/mm/yyyy.
6. manufacturer = product brand (Mfr/Mfac/Mkt), NOT the distributor name.
7. Do NOT extract sales discount (S.Disc / retail discount / MRP vs sale rate). Omit any sales-discount fields — we set those manually in the app.
8. scheme_discount_pct / scheme_discount_rs = scheme columns only (Scm %, Sch %, Scheme %, Scheme disc). Free qty goes in scheme_quantity, not here.
9. purchase_discount_pct / purchase_discount_rs = purchase/trade discount only (Dis %, CD %, P.Disc, Trade disc, cash discount). Do NOT put Scm % here.
10. If the bill shows BOTH scheme and purchase discounts on a line, fill both fields separately — do not merge into one.
11. If only one discount column exists: Scm/Sch/Scheme label → scheme_discount_*; Dis/CD/Trade/P.Disc label → purchase_discount_*.
12. One JSON row per bill line; separate rows for different batches.
13. Omit fields you cannot read; numbers only (no ₹, commas).
14. product_name: remove distributor prefixes, HSN, and numeric pipe prefixes.
15. gst_percent must be 0, 5, 18, or 40 only. If the bill prints 12% (legacy medicine rate), use 5.

Extract from the attached invoice now.`;
