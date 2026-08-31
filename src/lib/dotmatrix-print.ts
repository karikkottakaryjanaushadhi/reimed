"use client";

import { DOTMATRIX_RECEIPT_COLS } from "@/lib/dotmatrix-receipt";

const PAPER_WIDTH_IN = 6;
/** Top inset — non-printable zone on LX-class printers often clips the first line */
const PRINT_PAD_TOP_IN = 0.2;
/** Side inset — kept minimal; body width is driven by receipt column count */
const PRINT_PAD_LEFT_IN = 0.1;
const PRINT_PAD_RIGHT_IN = 0.06;

const RECEIPT_PRINT_CSS = `
  @page {
    size: ${PAPER_WIDTH_IN}in auto;
    margin: ${PRINT_PAD_TOP_IN}in ${PRINT_PAD_RIGHT_IN}in 0 ${PRINT_PAD_LEFT_IN}in;
  }

  html, body {
    margin: 0;
    padding: 0;
    background-color: #fff;
    color: #000;
  }

  /* Same width as the product table (${DOTMATRIX_RECEIPT_COLS} monospace columns) */
  .receipt {
    box-sizing: border-box;
    width: ${DOTMATRIX_RECEIPT_COLS}ch;
    max-width: 100%;
    padding-top: 2px;
    font-family: "Draft", "Courier New", Courier, monospace;
    font-size: 8.5pt;
    line-height: 1.08;
    color: #000;
    overflow-x: visible;
    overflow-y: hidden;
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: grayscale;
    font-smooth: never;
  }

  .receipt .mono {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    font-family: inherit;
    font-size: inherit;
    font-weight: 400;
    line-height: inherit;
    white-space: pre;
    overflow: hidden;
    box-sizing: border-box;
  }

  .receipt .mono.shop-title {
    margin-bottom: 2px;
    padding: 2px 1ch 2px 2ch;
    font-size: 11pt;
    font-weight: 700;
    line-height: 1.3;
  }

  .receipt .mono.shop-address {
    box-sizing: border-box;
    width: 100%;
    padding-left: 6ch;
    overflow: visible;
    font-size: 6.5pt;
    line-height: 1.12;
    white-space: nowrap;
  }

  .receipt .mono.meta {
    margin-top: 2px;
    font-size: 7.5pt;
    line-height: 1.12;
  }

  .receipt .mono.bill-type {
    margin: 4px 0;
    font-size: 8.5pt;
    font-weight: 700;
  }

  .receipt .val {
    font-weight: 400;
  }

  .receipt .mono.info,
  .receipt .mono.info .lbl,
  .receipt .mono.info .val {
    font-weight: 700;
  }

  .receipt .mono.meta .contact-no {
    font-weight: 700;
  }

  .receipt .mono.summary .lbl {
    font-weight: 400;
  }

  .receipt .mono.summary .val-em {
    font-weight: 700;
  }

  .receipt .mono.table-head {
    font-weight: 700;
  }

  .receipt .mono.footer-gap {
    line-height: 1.35;
  }

  .receipt .mono.footer {
    margin-top: 2px;
    font-weight: 700;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; }
  }
`;

/** Browser print for Epson LX-310. */
export async function printDotmatrixReceipt(saleId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/sales/${saleId}/receipt?format=html`, { credentials: "include" });
    if (!res.ok) return false;
    const html = await res.text();
    return browserPrintDotmatrixReceipt(html);
  } catch (error) {
    console.error("Print failed:", error);
    return false;
  }
}

function browserPrintDotmatrixReceipt(receiptHtml: string): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>${RECEIPT_PRINT_CSS}</style>
</head>
<body>
  ${receiptHtml}
</body>
</html>`);
  doc.close();

  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 250);

  return true;
}
