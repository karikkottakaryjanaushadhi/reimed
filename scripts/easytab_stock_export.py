#!/usr/bin/env python3
"""
Parse SSMS-generated EasyTab script.sql (UTF-16 T-SQL) and export all parseable stockmaster rows
(including quantity 0). Outputs CSV with product name, stock, prices, batch, expiry, invoice,
distributor, brand (from manucomp via product.manucode).

Usage:
  python scripts/easytab_stock_export.py [path/to/script.sql] [output.csv]
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path


_MEDSEB_GST_SLABS = (0.0, 5.0, 18.0, 40.0)


def migrate_easytab_gst_pct(rate: float) -> float:
    """Map legacy EasyTab rates to MedSeb GST slabs (0, 5, 18, 40)."""
    try:
        x = float(rate)
    except (TypeError, ValueError):
        return 0.0
    if abs(x - 12.0) < 1e-6:
        return 5.0
    if abs(x - 28.0) < 1e-6:
        return 18.0
    for slab in _MEDSEB_GST_SLABS:
        if abs(x - slab) < 1e-6:
            return slab
    return min(_MEDSEB_GST_SLABS, key=lambda s: abs(s - x))


def parse_sql_values_list(inner: str) -> list[str]:
    """
    Split a T-SQL value list by commas at parenthesis depth 0 (outside strings).
    Handles N'...', '...', doubled quotes, and CAST(...) / nested parens.
    """
    parts: list[str] = []
    n = len(inner)
    i = 0
    start = 0
    depth = 0
    in_str = False

    def flush(end: int) -> None:
        t = inner[start:end].strip()
        if t:
            parts.append(t)

    while i < n:
        c = inner[i]
        if in_str:
            if c == "'":
                if i + 1 < n and inner[i + 1] == "'":
                    i += 2
                    continue
                in_str = False
            i += 1
            continue

        if c == "N" and i + 1 < n and inner[i + 1] == "'":
            in_str = True
            i += 2
            continue
        if c == "'":
            in_str = True
            i += 1
            continue
        if c == "(":
            depth += 1
            i += 1
            continue
        if c == ")":
            depth = max(0, depth - 1)
            i += 1
            continue
        if c == "," and depth == 0:
            flush(i)
            i += 1
            start = i
            continue
        i += 1

    flush(n)
    return parts


def sql_token_to_python(tok: str):
    tok = tok.strip()
    if tok.upper() == "NULL":
        return None
    m = re.match(r"^N'(.*)'$", tok, re.DOTALL)
    if m:
        return m.group(1).replace("''", "'")
    m = re.match(r"^'(.*)'$", tok, re.DOTALL)
    if m:
        return m.group(1).replace("''", "'")
    m = re.match(r"^CAST\s*\(\s*N'(.*)'\s+AS\s+Date\s*\)$", tok, re.I | re.DOTALL)
    if m:
        return m.group(1).replace("''", "'")
    m = re.match(
        r"^CAST\s*\(\s*([-0-9.]+)\s+AS\s+Decimal\s*\([^)]+\)\s*\)$", tok, re.I
    )
    if m:
        return float(m.group(1))
    try:
        if "." in tok:
            return float(tok)
        return int(tok)
    except ValueError:
        return tok


def extract_values_tuple(line: str) -> list | None:
    """Single-line INSERT ... VALUES (...);"""
    idx = line.upper().find("VALUES")
    if idx < 0:
        return None
    rest = line[idx + 6 :].strip()
    if not rest.startswith("("):
        return None
    depth = 0
    end = -1
    for j, c in enumerate(rest):
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                end = j
                break
    if end < 0:
        return None
    inner = rest[1:end]
    raw_parts = parse_sql_values_list(inner)
    return [sql_token_to_python(p) for p in raw_parts]


def load_script(path: Path) -> str:
    raw = path.read_bytes()
    if raw[:2] == b"\xff\xfe":
        return raw.decode("utf-16-le")
    if raw[:2] == b"\xfe\xff":
        return raw.decode("utf-16-be")
    return raw.decode("utf-8-sig", errors="replace")


def _junk_addr(s: str) -> bool:
    t = (s or "").strip()
    return t in {"", "0", "A", "-"}


def main() -> int:
    base = Path(__file__).resolve().parents[1]
    script_path = Path(sys.argv[1]) if len(sys.argv) > 1 else base / "script.sql"
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else base / "easytab_stock.csv"
    stem_path = out_path.with_suffix("")

    text = load_script(script_path)
    lines = text.splitlines()

    # REC_ID -> combined GST % (EasyTab GST_MASTER.GSTRATE); joins product.GSTID in billing logic.
    gst_rates: dict[int, float] = {}
    re_gst_master = re.compile(r"^INSERT \[dbo\]\.\[GST_MASTER\]", re.I)

    # mcode -> manufacturer / brand label (EasyTab manucomp.cname)
    manufacturers: dict[int, str] = {}
    re_manu = re.compile(r"^INSERT \[dbo\]\.\[manucomp\]", re.I)
    for line in lines:
        line_stripped = line.strip()
        if not line_stripped.startswith("INSERT"):
            continue
        if re_gst_master.match(line_stripped):
            tup = extract_values_tuple(line_stripped)
            if tup is not None and len(tup) >= 4:
                try:
                    rid = int(tup[0])
                    gr = float(tup[3]) if tup[3] is not None else 0.0
                    gst_rates[rid] = migrate_easytab_gst_pct(gr)
                except (TypeError, ValueError):
                    pass
            continue

        if not re_manu.match(line_stripped):
            continue
        tup = extract_values_tuple(line_stripped)
        if tup is None or len(tup) < 2:
            continue
        try:
            mi = int(tup[0])
        except (TypeError, ValueError):
            continue
        cname = str(tup[1] or "").strip()
        if cname and cname not in ("0", "-"):
            manufacturers[mi] = cname[:200]

    # pcode -> name, master pack (strip/tablet count), unit label, hsn, brand_name
    products: dict[int, dict] = {}
    purchases: dict[tuple[str, int], tuple[str, str]] = {}
    suppliers: dict[int, dict] = {}

    stock_rows: list[dict] = []

    # Typical EasyTab slabs if GST_MASTER block missing from dump (12% → 5% for MedSeb)
    if not gst_rates:
        gst_rates.update({1: 0.0, 2: 5.0, 3: 5.0, 4: 18.0, 5: 18.0})

    re_stock = re.compile(
        r"^INSERT \[dbo\]\.\[stockmaster\]", re.I
    )
    re_product = re.compile(r"^INSERT \[dbo\]\.\[product\]", re.I)
    re_ph = re.compile(r"^INSERT \[dbo\]\.\[purchaseHead\]", re.I)
    re_sup = re.compile(r"^INSERT \[dbo\]\.\[supplier\]", re.I)

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped.startswith("INSERT"):
            continue
        tup = extract_values_tuple(line_stripped)
        if tup is None:
            continue

        if re_stock.match(line_stripped):
            # slno, purno, pcode, batchno, expd, rate, brate, mrp, ... stock @14, scode @19
            if len(tup) < 32:
                continue
            stock_qty = tup[14]
            try:
                sq = int(float(stock_qty)) if stock_qty is not None else 0
            except (TypeError, ValueError):
                sq = 0
            purno = tup[1]
            pcode_raw = tup[2]
            scode = tup[19]
            try:
                scode_i = int(scode) if scode is not None else 0
            except (TypeError, ValueError):
                scode_i = 0
            try:
                pcode_i = int(str(pcode_raw).strip()) if pcode_raw not in (None, "") else None
            except ValueError:
                pcode_i = None

            stock_rows.append(
                {
                    "pcode": pcode_raw,
                    "pcode_int": pcode_i,
                    "purno": str(purno).strip() if purno else "",
                    "scode": scode_i,
                    "batchno": tup[3],
                    "expd": tup[4],
                    "rate": tup[5],
                    "mrp": tup[7],
                    "stock": sq,
                    "wspacking": tup[12],
                }
            )
            continue

        if re_product.match(line_stripped):
            # Explicit INSERT column order in SSMS dumps includes GSTID @20 (after discper).
            # HSNCODE @6, manucode @9, packing @17, GSTID @20, unit @27
            if len(tup) < 3:
                continue
            pcode = tup[0]
            pname = tup[1]
            hsn_raw = tup[6] if len(tup) > 6 else None
            manu_raw = tup[9] if len(tup) > 9 else None
            packing = tup[17] if len(tup) > 17 else None
            gst_id_raw = tup[20] if len(tup) > 20 else None
            unit_raw = tup[27] if len(tup) > 27 else None
            unit_s = (
                str(unit_raw).strip()
                if unit_raw is not None and str(unit_raw).strip()
                else ""
            )
            hsn_s = (
                str(hsn_raw).strip()
                if hsn_raw is not None and str(hsn_raw).strip() and str(hsn_raw) != "0"
                else ""
            )
            try:
                pi = int(pcode)
            except (TypeError, ValueError):
                continue
            manu_i: int | None = None
            if manu_raw not in (None, "", 0):
                try:
                    manu_i = int(manu_raw)
                except (TypeError, ValueError):
                    manu_i = None
            brand_name = manufacturers.get(manu_i) if manu_i else None
            gst_i: int | None = None
            if gst_id_raw not in (None, ""):
                try:
                    gst_i = int(gst_id_raw)
                except (TypeError, ValueError):
                    gst_i = None
            raw_gst = float(gst_rates.get(gst_i, 0.0)) if gst_i is not None else 0.0
            gst_pct = migrate_easytab_gst_pct(raw_gst)

            products[pi] = {
                "pname": pname if isinstance(pname, str) else str(pname or ""),
                "packing": packing,
                "unit": unit_s,
                "hsn": hsn_s,
                "brand_name": brand_name,
                "gst_pct": gst_pct,
            }
            continue

        if re_ph.match(line_stripped):
            # purno, invoiceno, indate, endate, scode, ...
            if len(tup) < 5:
                continue
            purno, invoiceno = tup[0], tup[1]
            scode = tup[4]
            indate = tup[2]
            try:
                si = int(scode)
            except (TypeError, ValueError):
                continue
            key = (str(purno).strip(), si)
            purchases[key] = (
                str(invoiceno).strip() if invoiceno else "",
                str(indate).strip() if indate else "",
            )
            continue

        if re_sup.match(line_stripped):
            # scode, sname, addr1, addr2, addr3, dl1, dl2, tin, con1, con2, cperson, company, ...
            if len(tup) < 12:
                continue
            scode = tup[0]
            try:
                si = int(scode)
            except (TypeError, ValueError):
                continue
            sname = str(tup[1] or "").strip()
            a1, a2, a3 = str(tup[2] or ""), str(tup[3] or ""), str(tup[4] or "")
            addr_parts = [p.strip() for p in (a1, a2, a3) if not _junk_addr(p)]
            address = ", ".join(addr_parts) if addr_parts else None
            dl1 = str(tup[5] or "").strip()
            dl2 = str(tup[6] or "").strip()
            tin = str(tup[7] or "").strip()
            con1 = str(tup[8] or "").strip()
            con2 = str(tup[9] or "").strip()
            cperson = str(tup[10] or "").strip()
            company = str(tup[11] or "").strip()
            suppliers[si] = {
                "legacySupplierCode": si,
                "name": sname or company or f"Supplier {si}",
                "company": company if company and company not in ("0", "-") else None,
                "address": address,
                "gstin": tin if tin and tin not in ("0",) else None,
                "phone": con1 if con1 and con1 not in ("0",) else None,
                "phoneAlt": con2 if con2 and con2 not in ("0",) else None,
                "contactPerson": cperson if cperson and cperson != "-" else None,
                "drugLicense1": dl1 if dl1 and dl1 not in ("0",) else None,
                "drugLicense2": dl2 if dl2 and dl2 not in ("0",) else None,
            }
            continue

    for row in stock_rows:
        si = row.get("scode")
        if not isinstance(si, int) or si <= 0:
            continue
        if si not in suppliers:
            suppliers[si] = {
                "legacySupplierCode": si,
                "name": f"EasyTab scode {si}",
                "company": None,
                "address": None,
                "gstin": None,
                "phone": None,
                "phoneAlt": None,
                "contactPerson": None,
                "drugLicense1": None,
                "drugLicense2": None,
            }

    fieldnames = [
        "product_code",
        "product_name",
        "stock_qty",
        "rate",
        "mrp",
        "batch_no",
        "expiry_date",
        "strip_size",
        "pack_number",
        "unit_label",
        "invoice_number",
        "purchase_date",
        "purchase_bill_no",
        "supplier_code",
        "distributor_name",
        "distributor_address",
        "drug_license_1",
        "gstin",
        "phone",
        "brand_name",
    ]

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for row in stock_rows:
            pi = row["pcode_int"]
            pd = products.get(pi) if pi is not None else None
            pname = pd.get("pname", "") if isinstance(pd, dict) else ""
            master_pack = pd.get("packing") if isinstance(pd, dict) else None
            unit_label = pd.get("unit", "") if isinstance(pd, dict) else ""
            brand_nm = (pd.get("brand_name") or "") if isinstance(pd, dict) else ""
            # strip_size: product.packing (units per strip/pack); else unit text if set
            if master_pack not in (None, ""):
                strip_size = master_pack
            elif unit_label:
                strip_size = unit_label
            else:
                strip_size = ""
            pack_number = row.get("wspacking")
            key = (row["purno"], row["scode"])
            inv, indate = purchases.get(key, ("", ""))
            dist = suppliers.get(row["scode"])
            w.writerow(
                {
                    "product_code": row["pcode"],
                    "product_name": pname,
                    "stock_qty": row["stock"],
                    "rate": row["rate"],
                    "mrp": row["mrp"],
                    "batch_no": row["batchno"],
                    "expiry_date": row["expd"],
                    "strip_size": strip_size,
                    "pack_number": pack_number,
                    "unit_label": unit_label,
                    "invoice_number": inv,
                    "purchase_date": indate,
                    "purchase_bill_no": row["purno"],
                    "supplier_code": row["scode"],
                    "distributor_name": (dist or {}).get("name") or "",
                    "distributor_address": (dist or {}).get("address") or "",
                    "drug_license_1": (dist or {}).get("drugLicense1") or "",
                    "gstin": (dist or {}).get("gstin") or "",
                    "phone": (dist or {}).get("phone") or "",
                    "brand_name": brand_nm,
                }
            )

    # JSON for TypeScript importer (same folder / stem as CSV)
    suppliers_path = Path(str(stem_path) + "_suppliers.json")
    stock_json_path = Path(str(stem_path) + "_stock.json")
    brands_path = Path(str(stem_path) + "_brands.json")
    brand_names = sorted(
        {
            str(v).strip()[:200]
            for v in manufacturers.values()
            if v and str(v).strip() not in ("0", "-")
        }
    )
    with brands_path.open("w", encoding="utf-8") as f:
        json.dump([{"name": n} for n in brand_names], f, ensure_ascii=False, indent=0)

    enriched_stock: list[dict] = []
    for row in stock_rows:
        pi = row["pcode_int"]
        pd = products.get(pi) if pi is not None else None
        pname = pd.get("pname", "") if isinstance(pd, dict) else ""
        master_pack = pd.get("packing") if isinstance(pd, dict) else None
        unit_label = pd.get("unit", "") if isinstance(pd, dict) else ""
        hsn = pd.get("hsn", "") if isinstance(pd, dict) else ""
        gst_pct = (
            migrate_easytab_gst_pct(float(pd.get("gst_pct", 0)))
            if isinstance(pd, dict)
            else 0.0
        )
        brand_name = pd.get("brand_name") if isinstance(pd, dict) else None
        if master_pack not in (None, ""):
            strip_size = master_pack
        elif unit_label:
            strip_size = unit_label
        else:
            strip_size = ""
        key = (row["purno"], row["scode"])
        inv, indate = purchases.get(key, ("", ""))
        dist = suppliers.get(row["scode"])
        enriched_stock.append(
            {
                **row,
                "product_name": pname,
                "strip_size": strip_size,
                "unit_label": unit_label,
                "hsn": hsn or None,
                "gstPct": gst_pct,
                "invoice_number": inv or None,
                "purchase_date": indate or None,
                "distributor": dist,
                "brand_name": brand_name,
            }
        )

    with suppliers_path.open("w", encoding="utf-8") as f:
        json.dump(list(suppliers.values()), f, ensure_ascii=False, indent=0)

    with stock_json_path.open("w", encoding="utf-8") as f:
        json.dump(enriched_stock, f, ensure_ascii=False, indent=0)

    print(
        f"Wrote {len(stock_rows)} stock rows to {out_path}, "
        f"{len(suppliers)} suppliers to {suppliers_path}, "
        f"{len(brand_names)} brands to {brands_path}, "
        f"{len(enriched_stock)} stock JSON rows to {stock_json_path}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
