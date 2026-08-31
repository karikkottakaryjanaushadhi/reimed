import { APP_LOCALE, APP_TIMEZONE, formatAppDateDmy } from "@/lib/app-timezone";
import { saleBillRoundOff, salePayableFromLineAmounts } from "@/lib/bill-round";

/** Fixed-width bill for 6" dot-matrix output (68 cols incl. inter-column spaces). */
export const DOTMATRIX_RECEIPT_COLS = 68;
const LINE_W = DOTMATRIX_RECEIPT_COLS;

/** One line per item: Sr | Product | Batch | Pack | Exp | Qty | MRP | Rate | Disc | Amt(Rs.) */
const COL_SR = 2;
const COL_PROD = 13;
const COL_BATCH = 6;
const COL_PACK = 4;
const COL_EXP = 5;
const COL_QTY = 3;
const COL_MRP = 6;
const COL_RATE = 6;
const COL_DISC = 5;
const COL_AMT = 9;

/** Placeholder in store settings (`billTerms` is not printed on dot-matrix bills). */
export const BILL_TERMS_PLACEHOLDER =
  "Not printed on bills. Receipt footer is always “Get well soon” and “Pharmacist Sign” (see sample bill).";

const FOOTER_GET_WELL = "****GET WELL SOON****";
const FOOTER_PHARM_SIGN = "Pharmacist Sign";
/** Blank lines after net-amount divider — room for handwritten pharmacist sign. */
const PHARMACIST_SIGN_GAP_LINES = 4;

function pharmacistSignGapLines(): string[] {
  return Array.from({ length: PHARMACIST_SIGN_GAP_LINES }, () => "");
}

function pad(s: string, w: number, align: "left" | "right" | "center" = "left") {
  const t = s.slice(0, w);
  if (align === "right") return t.padStart(w, " ");
  if (align === "center") {
    const padL = Math.max(0, Math.floor((w - t.length) / 2));
    return " ".repeat(padL) + t + " ".repeat(w - padL - t.length);
  }
  return t.padEnd(w, " ");
}

function line(ch = "-", w = LINE_W) {
  return ch.repeat(w).slice(0, w);
}

function fillLine(left: string, right: string, w = LINE_W, rightMin = 0) {
  const r = right.slice(0, w);
  const reserve = Math.max(rightMin, r.length);
  const maxLeft = Math.max(0, w - reserve - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  const gap = w - l.length - r.length;
  if (gap < 1) return `${l.slice(0, w - r.length - 1)} ${r}`;
  return `${l}${" ".repeat(gap)}${r}`;
}

/** Spaces between summary label and amount (e.g. `Gross:`  `123.45`). */
const SUMMARY_LABEL_VALUE_GAP = "  ";

/** Summary — label+amount grouped on the right. */
function fillSummaryLineRight(label: string, amount: string, w = LINE_W) {
  return pad(`${label}${SUMMARY_LABEL_VALUE_GAP}${amount}`.slice(0, w), w, "right");
}

function fillSummaryDualRight(
  leftLabel: string,
  leftAmount: string,
  rightLabel: string,
  rightAmount: string,
  w = LINE_W,
) {
  const leftSeg = `${leftLabel}${SUMMARY_LABEL_VALUE_GAP}${leftAmount}`;
  if (!rightLabel && !rightAmount) return fillSummaryLineRight(leftLabel, leftAmount, w);
  const rightSeg = `${rightLabel}${SUMMARY_LABEL_VALUE_GAP}${rightAmount}`;
  return pad(`${leftSeg}   ${rightSeg}`.slice(0, w), w, "right");
}

function num(n: number, decimals: number) {
  return n.toFixed(decimals);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Word-wrap to max `w` columns (greedy); long tokens split across lines. */
function wrapWords(text: string, w: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length === 0 || (words.length === 1 && words[0] === "")) return [""];
  const lines: string[] = [];
  let buf = "";
  for (const word of words) {
    if (word.length > w) {
      if (buf) {
        lines.push(buf);
        buf = "";
      }
      for (let i = 0; i < word.length; i += w) {
        lines.push(word.slice(i, i + w));
      }
      continue;
    }
    const next = buf ? `${buf} ${word}` : word;
    if (next.length <= w) buf = next;
    else {
      if (buf) lines.push(buf);
      buf = word;
    }
  }
  if (buf) lines.push(buf);
  return lines;
}

/** Centered header lines — one column shy of full width to avoid edge clip in browser print. */
const HEADER_W = LINE_W - 1;

function pushCentered(rows: string[], text: string, w = HEADER_W) {
  for (const ln of wrapWords(text, w)) {
    rows.push(pad(ln, LINE_W, "center"));
  }
}

/** Shop name — left-aligned; inset avoids bold 11pt clipping at paper edges. */
const SHOP_TITLE_LEFT_MARGIN = 4;
const SHOP_TITLE_WRAP_W = LINE_W - SHOP_TITLE_LEFT_MARGIN - 1;

function pushLeftShopTitle(rows: string[], text: string) {
  const prefix = " ".repeat(SHOP_TITLE_LEFT_MARGIN);
  for (const ln of wrapWords(text, SHOP_TITLE_WRAP_W)) {
    rows.push(prefix + ln);
  }
}

const SHOP_ADDRESS_LEFT_MARGIN = 6;

/** One bill line — comma-joins multiline store address, no word wrap. */
function formatStoreAddressLine(address: string | null): string {
  if (!address?.trim()) return "";
  return address
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function pushLeftAddress(rows: string[], text: string, html = false) {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return;
  const prefix = html ? "" : " ".repeat(SHOP_ADDRESS_LEFT_MARGIN);
  rows.push(prefix + line);
}

function pushWrapped(rows: string[], text: string, w = LINE_W) {
  for (const ln of wrapWords(text, w)) {
    rows.push(ln);
  }
}

/** Centered message with right-aligned text on one line (jan-bill footer style). */
function pushCenterAndRight(rows: string[], center: string, right: string, w = LINE_W) {
  const c = center.slice(0, w);
  const r = right.slice(0, w);
  if (c.length + r.length + 1 >= w) {
    rows.push(pad(c, w, "center"));
    rows.push(pad(r, w, "right"));
    return;
  }
  const gap = w - c.length - r.length;
  const padL = Math.max(0, Math.floor(gap / 2));
  rows.push(" ".repeat(padL) + c + " ".repeat(gap - padL) + r);
}

function truncCell(s: string, w: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= w ? t : t.slice(0, w);
}

/** Product column — up to two wrapped lines; remainder after line 2 is dropped. */
function splitProductNameTwoLines(name: string, w = COL_PROD): { line1: string; line2: string | null } {
  const t = name.replace(/\s+/g, " ").trim();
  if (t.length <= w) return { line1: t, line2: null };
  const wrapped = wrapWords(t, w);
  const line1 = wrapped[0] ?? "";
  if (wrapped.length <= 1) return { line1, line2: null };
  const rest = wrapped.slice(1).join(" ");
  return { line1, line2: rest.length <= w ? rest : rest.slice(0, w) };
}

/** Compact MM/YY expiry for narrow receipt columns. */
function formatReceiptExp(input: Date): string {
  const parts = new Intl.DateTimeFormat(APP_LOCALE, {
    timeZone: APP_TIMEZONE,
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(input);
  const mm = parts.find((p) => p.type === "month")?.value ?? "??";
  const yy = parts.find((p) => p.type === "year")?.value ?? "??";
  return `${mm}/${yy}`;
}

function itemTableHeader(): string {
  return [
    pad("Sr", COL_SR),
    pad("Product", COL_PROD),
    pad("Batch", COL_BATCH),
    pad("Pack", COL_PACK, "right"),
    pad("Exp", COL_EXP, "right"),
    pad("Qty", COL_QTY, "right"),
    pad("MRP", COL_MRP, "right"),
    pad("Rate", COL_RATE, "right"),
    pad("Disc", COL_DISC, "right"),
    pad("Amt(Rs.)", COL_AMT, "right"),
  ].join(" ");
}

function itemTableRowCells(
  sr: string,
  product: string,
  batchNo: string,
  packSize: number | null,
  expiryDate: Date | null,
  qty: number | null,
  mrp: number | null,
  rate: number | null,
  disc: number | null,
  amtIncl: number | null,
): string {
  return [
    pad(sr, COL_SR),
    pad(product, COL_PROD),
    pad(batchNo, COL_BATCH),
    pad(packSize == null ? "" : String(Math.max(1, Math.trunc(packSize) || 1)), COL_PACK, "right"),
    pad(expiryDate ? formatReceiptExp(expiryDate) : "", COL_EXP, "right"),
    pad(qty == null ? "" : String(qty), COL_QTY, "right"),
    pad(mrp == null ? "" : num(mrp, 2), COL_MRP, "right"),
    pad(rate == null ? "" : num(rate, 2), COL_RATE, "right"),
    pad(disc == null ? "" : num(disc, 2), COL_DISC, "right"),
    pad(amtIncl == null ? "" : num(amtIncl, 2), COL_AMT, "right"),
  ].join(" ");
}

function itemTableRows(
  sr: number,
  productUpper: string,
  batchNo: string,
  packSize: number,
  expiryDate: Date,
  qty: number,
  mrp: number,
  rate: number,
  disc: number,
  amtIncl: number,
): string[] {
  const { line1, line2 } = splitProductNameTwoLines(productUpper);
  const batch = truncCell(batchNo, COL_BATCH);
  const rows = [
    itemTableRowCells(
      String(sr),
      line1,
      batch,
      packSize,
      expiryDate,
      qty,
      mrp,
      rate,
      disc,
      amtIncl,
    ),
  ];
  if (line2) {
    rows.push(itemTableRowCells("", line2, "", null, null, null, null, null, null, null));
  }
  return rows;
}

export type DotmatrixReceiptSale = {
  billNo: number;
  createdAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  doctorName: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  store: {
    name: string;
    billShopName: string | null;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    drugLicenseLine: string | null;
    email: string | null;
    billTerms: string | null;
  };
  lines: Array<{
    product: { name: string; brandName: string | null; genericName: string | null; packSize: number };
    lot: { batchNo: string; expiryDate: Date; mrp: number };
    qty: number;
    rate: number;
    amount: number;
    discountAmount: number;
    gstAmount: number;
    gstPct: number;
  }>;
};

/**
 * PM-JAY / retail style fixed-width 6" bill layout (Epson LX-310 class).
 */
export function buildDotmatrixReceiptText(sale: DotmatrixReceiptSale): string {
  const rows: string[] = [];
  const W = LINE_W;

  const headerTitle = (sale.store.billShopName?.trim() || sale.store.name).toUpperCase();
  pushLeftShopTitle(rows, headerTitle);
  const addressLine = formatStoreAddressLine(sale.store.address);
  if (addressLine) pushLeftAddress(rows, addressLine);

  const dlRaw = sale.store.drugLicenseLine?.trim() ?? "";
  const phRaw = sale.store.phone?.trim() ?? "";
  const emRaw = sale.store.email?.trim() ?? "";

  const metaParts = [
    dlRaw ? `DL No:${dlRaw}` : "DL No:-",
    phRaw ? `Contact No:${phRaw}` : "Contact No:-",
    emRaw ? `Email ID: ${emRaw}` : "",
  ].filter(Boolean);
  if (metaParts.length > 0) {
    pushWrapped(rows, metaParts.join(", "));
  }

  rows.push("");
  rows.push("");
  rows.push("");
  rows.push(pad("Bill of Supply", W, "center"));
  rows.push(line("-", W));

  const cust = sale.customerName?.trim() || "-";
  const mob = sale.customerPhone?.trim() || "";
  const doc = sale.doctorName?.trim() || "-";
  const inv = String(sale.billNo);
  const dateStr = formatAppDateDmy(sale.createdAt);

  rows.push(fillLine(`Patient : ${cust}`, `Mobile : ${mob || "-"}`, W));
  rows.push(fillLine(`Doctor : ${doc}`, `Invoice No.: ${inv}`, W));
  rows.push(fillLine("", `Date : ${dateStr}`, W));

  rows.push("");
  rows.push(line("-", W));
  rows.push(itemTableHeader());
  rows.push(line("-", W));

  let idx = 0;
  for (const l of sale.lines) {
    idx += 1;
    const lineIncl = round2(l.amount - l.discountAmount);
    const lineRate = round2(l.rate);
    const batch = l.lot.batchNo.replace(/\s+/g, " ").trim();
    const mrpPack = round2(l.lot.mrp);
    const discAmt = round2(l.discountAmount);
    rows.push(
      ...itemTableRows(
        idx,
        l.product.name.toUpperCase(),
        batch,
        l.product.packSize,
        l.lot.expiryDate,
        l.qty,
        mrpPack,
        lineRate,
        discAmt,
        lineIncl,
      ),
    );
  }

  rows.push(line("-", W));

  const totalTax = round2(sale.tax);
  const cgst = round2(totalTax / 2);
  const sgst = round2(totalTax - cgst);
  const gross = round2(sale.subtotal);
  const discTotal = round2(sale.discount);
  const payable = salePayableFromLineAmounts(sale.lines);
  const roundOff = saleBillRoundOff(payable, Number(sale.total));
  const net = round2(sale.total);

  rows.push(fillSummaryDualRight("CGST :", num(cgst, 2), "SGST :", num(sgst, 2), W));
  rows.push(fillSummaryLineRight("IGST :", num(0, 2), W));
  rows.push(fillSummaryLineRight("Gross:", num(gross, 2), W));
  rows.push(fillSummaryLineRight("Total Discount:", num(discTotal, 2), W));
  rows.push(fillSummaryLineRight("Total Tax:", num(totalTax, 2), W));
  if (roundOff !== 0) {
    const sign = roundOff > 0 ? "+" : "";
    rows.push(fillSummaryLineRight("Round Off:", `${sign}${num(roundOff, 2)}`, W));
  }
  rows.push(fillSummaryLineRight("Net Amount:", num(net, 2), W));
  rows.push(line("-", W));
  for (const gapLine of pharmacistSignGapLines()) rows.push(gapLine);
  pushCenterAndRight(rows, FOOTER_GET_WELL, FOOTER_PHARM_SIGN, W);

  return rows.join("\r\n");
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlMetaLine(dl: string, phone: string, email: string | null): string {
  const parts = [
    `DL No:${escHtml(dl)}`,
    `, Contact No:<span class="contact-no">${escHtml(phone)}</span>`,
    ...(email ? [`, Email ID: ${escHtml(email)}`] : []),
  ];
  return parts.join("");
}

function htmlPreBlock(className: string, lines: string[], html = false): string {
  if (lines.length === 0) return "";
  const body = html ? lines.join("\n") : escHtml(lines.join("\n"));
  return `<pre class="mono ${className}">${body}</pre>`;
}

function htmlLabelValue(label: string, value: string, valueClass = "val") {
  if (!label) {
    return `<span class="${valueClass}">${escHtml(value)}</span>`;
  }
  return `<span class="lbl">${escHtml(label)}</span> <span class="${valueClass}">${escHtml(value)}</span>`;
}

/** Patient / doctor block — bold labels, normal values. */
function htmlInfoLine(
  leftLabel: string,
  leftValue: string,
  rightLabel: string,
  rightValue: string,
  w = LINE_W,
): string {
  const leftPlain = leftLabel ? `${leftLabel} ${leftValue}` : "";
  const rightPlain = rightLabel ? `${rightLabel} ${rightValue}` : "";
  const plain = fillLine(leftPlain, rightPlain, w);
  const leftHtml = leftLabel ? htmlLabelValue(leftLabel, leftValue) : "";
  const rightHtml = rightLabel ? htmlLabelValue(rightLabel, rightValue) : "";
  if (!leftHtml) {
    const gap = plain.length - rightPlain.length;
    return `${" ".repeat(Math.max(0, gap))}${rightHtml}`;
  }
  if (!rightHtml) return leftHtml;
  const gap = plain.length - leftPlain.length - rightPlain.length;
  return `${leftHtml}${" ".repeat(Math.max(1, gap))}${rightHtml}`;
}

/** Summary row — label+value right-aligned; optional bold amount (discount / net). */
function htmlSummaryLine(label: string, amount: string, w = LINE_W, boldAmount = false): string {
  const segment = `${label}${SUMMARY_LABEL_VALUE_GAP}${amount}`;
  const spaces = Math.max(0, w - segment.length);
  const valueClass = boldAmount ? "val val-em" : "val";
  return `${" ".repeat(spaces)}<span class="lbl">${escHtml(label)}</span>${SUMMARY_LABEL_VALUE_GAP}<span class="${valueClass}">${escHtml(amount)}</span>`;
}

function htmlSummaryDual(
  leftLabel: string,
  leftAmount: string,
  rightLabel: string,
  rightAmount: string,
  w = LINE_W,
): string {
  const leftSeg = `${leftLabel}${SUMMARY_LABEL_VALUE_GAP}${leftAmount}`;
  const rightSeg = rightLabel || rightAmount ? `${rightLabel}${SUMMARY_LABEL_VALUE_GAP}${rightAmount}` : "";
  if (!rightSeg) return htmlSummaryLine(leftLabel, leftAmount, w);
  const combined = `${leftSeg}   ${rightSeg}`;
  const spaces = Math.max(0, w - combined.length);
  const leftHtml = `<span class="lbl">${escHtml(leftLabel)}</span>${SUMMARY_LABEL_VALUE_GAP}<span class="val">${escHtml(leftAmount)}</span>`;
  const rightHtml = `<span class="lbl">${escHtml(rightLabel)}</span>${SUMMARY_LABEL_VALUE_GAP}<span class="val">${escHtml(rightAmount)}</span>`;
  return `${" ".repeat(spaces)}${leftHtml}   ${rightHtml}`;
}

/** HTML bill for browser print (jan-bill typography: large bold title, small address, bold labels). */
export function buildDotmatrixReceiptHtml(sale: DotmatrixReceiptSale): string {
  const W = LINE_W;
  const headerTitle = (sale.store.billShopName?.trim() || sale.store.name).toUpperCase();

  const parts: string[] = [];

  const titleLines: string[] = [];
  pushLeftShopTitle(titleLines, headerTitle);
  parts.push(htmlPreBlock("shop-title", titleLines));

  const addrLines: string[] = [];
  const addressLine = formatStoreAddressLine(sale.store.address);
  if (addressLine) pushLeftAddress(addrLines, addressLine, true);
  if (addrLines.length > 0) parts.push(htmlPreBlock("shop-address", addrLines));

  const dlRaw = sale.store.drugLicenseLine?.trim() ?? "";
  const phRaw = sale.store.phone?.trim() ?? "";
  const emRaw = sale.store.email?.trim() ?? "";
  const metaHtml = htmlMetaLine(dlRaw || "-", phRaw || "-", emRaw || null);
  if (metaHtml) parts.push(`<pre class="mono meta">${metaHtml}</pre>`);

  parts.push(htmlPreBlock("bill-spacer", ["", "", ""]));
  parts.push(htmlPreBlock("bill-type", [pad("Bill of Supply", W, "center")]));
  parts.push(htmlPreBlock("divider", [line("-", W)]));

  const cust = sale.customerName?.trim() || "-";
  const mob = sale.customerPhone?.trim() || "";
  const doc = sale.doctorName?.trim() || "-";
  const inv = String(sale.billNo);
  const dateStr = formatAppDateDmy(sale.createdAt);

  parts.push(
    htmlPreBlock(
      "info",
      [
        htmlInfoLine("Patient :", cust, "Mobile :", mob || "-", W),
        htmlInfoLine("Doctor :", doc, "Invoice No.:", inv, W),
        htmlInfoLine("", "", "Date :", dateStr, W),
      ],
      true,
    ),
  );

  const tableLines: string[] = [];
  tableLines.push(line("-", W));
  tableLines.push(itemTableHeader());
  tableLines.push(line("-", W));

  let idx = 0;
  for (const l of sale.lines) {
    idx += 1;
    const lineIncl = round2(l.amount - l.discountAmount);
    const lineRate = round2(l.rate);
    const batch = l.lot.batchNo.replace(/\s+/g, " ").trim();
    const mrpPack = round2(l.lot.mrp);
    const discAmt = round2(l.discountAmount);
    tableLines.push(
      ...itemTableRows(
        idx,
        l.product.name.toUpperCase(),
        batch,
        l.product.packSize,
        l.lot.expiryDate,
        l.qty,
        mrpPack,
        lineRate,
        discAmt,
        lineIncl,
      ),
    );
  }
  tableLines.push(line("-", W));

  parts.push(`<pre class="mono">${escHtml(tableLines[0]!)}</pre>`);
  parts.push(`<pre class="mono table-head">${escHtml(tableLines[1]!)}</pre>`);
  parts.push(`<pre class="mono">${escHtml(tableLines.slice(2).join("\n"))}</pre>`);

  const totalTax = round2(sale.tax);
  const cgst = round2(totalTax / 2);
  const sgst = round2(totalTax - cgst);
  const gross = round2(sale.subtotal);
  const discTotal = round2(sale.discount);
  const payable = salePayableFromLineAmounts(sale.lines);
  const roundOff = saleBillRoundOff(payable, Number(sale.total));
  const net = round2(sale.total);

  const summaryRows = [
    htmlSummaryDual("CGST :", num(cgst, 2), "SGST :", num(sgst, 2), W),
    htmlSummaryDual("IGST :", num(0, 2), "", "", W),
    htmlSummaryLine("Gross:", num(gross, 2), W),
    htmlSummaryLine("Total Discount:", num(discTotal, 2), W),
    htmlSummaryLine("Total Tax:", num(totalTax, 2), W),
  ];
  if (roundOff !== 0) {
    const sign = roundOff > 0 ? "+" : "";
    summaryRows.push(htmlSummaryLine("Round Off:", `${sign}${num(roundOff, 2)}`, W));
  }
  summaryRows.push(htmlSummaryLine("Net Amount:", num(net, 2), W, true));

  parts.push(htmlPreBlock("summary", summaryRows, true));

  parts.push(htmlPreBlock("divider", [line("-", W)]));
  parts.push(htmlPreBlock("footer-gap", pharmacistSignGapLines()));

  const footerRows: string[] = [];
  pushCenterAndRight(footerRows, FOOTER_GET_WELL, FOOTER_PHARM_SIGN, W);
  parts.push(htmlPreBlock("footer", footerRows));

  return `<div class="receipt">${parts.join("")}</div>`;
}
