/**
 * Arrow / Enter navigation between cells marked with
 * `data-purchase-line` and `data-purchase-field`.
 */
export function navigatePurchaseTable(
  rowIds: readonly string[],
  fields: readonly string[],
  currentRowId: string,
  currentField: string,
  dRow: number,
  dField: number,
): void {
  const rowI = rowIds.indexOf(currentRowId);
  const fI = fields.indexOf(currentField);
  if (rowI < 0 || fI < 0) return;

  let ri = rowI;
  let fi = fI;
  const nR = rowIds.length;
  const nF = fields.length;
  const maxHops = nR * nF + 8;

  function step(): boolean {
    if (dRow !== 0) {
      ri += dRow;
      return ri >= 0 && ri < nR;
    }
    fi += dField;
    if (fi >= nF) {
      ri++;
      fi = 0;
    } else if (fi < 0) {
      ri--;
      fi = nF - 1;
    }
    return ri >= 0 && ri < nR && fi >= 0 && fi < nF;
  }

  for (let h = 0; h < maxHops; h++) {
    if (!step()) return;
    const id = rowIds[ri];
    const f = fields[fi];
    const el = document.querySelector<HTMLElement>(`[data-purchase-line="${id}"][data-purchase-field="${f}"]`);
    if (!el) continue;
    if (el instanceof HTMLButtonElement) {
      if (el.disabled) continue;
    } else {
      const inp = el as HTMLInputElement;
      const sel = el as HTMLSelectElement;
      if (inp.disabled || sel.disabled) continue;
    }
    el.focus();
    if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number" || el.type === "date")) {
      try {
        (el as HTMLInputElement).select();
      } catch {
        /* ignore */
      }
    }
    return;
  }
}
