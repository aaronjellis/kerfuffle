/**
 * Splitting the pieces across material sheets. A laser's bed is often bigger than the sheet of
 * wood on it, so the pieces are packed onto as many sheets as they need, each the material's size.
 *
 * Each sheet is packed skyline-fashion, as Kerfuffle packs its one sheet: every piece drops to the
 * lowest spot across the sheet it fits, leftmost on a tie; a piece that would run off the bottom
 * waits for the next sheet. Of the orders tried, the one that puts the most wood on the sheet wins.
 */
import type { BoxPanel2D, GeneratedBoxModel, SheetRegion } from './types';

export interface Sheet {
  /** The pieces on this sheet, `sheetX`/`sheetY` measured on it. */
  panels: BoxPanel2D[];
  widthMm: number;
  heightMm: number;
}

export interface SheetLayout {
  sheets: Sheet[];
  /** Pieces bigger than the sheet, each on a sheet of its own that's grown to hold it. */
  tooBig: BoxPanel2D[];
}

const EPS = 1e-6;

/** Packs as many of `panels` (in `order`) as fit on one sheet; returns the placed ones. */
function packOne(panels: BoxPanel2D[], order: number[], w: number, h: number, margin: number, gap: number): Map<number, BoxPanel2D> {
  const left = margin;
  const right = w - margin;
  const bottom = h - margin;
  let sky: { x: number; w: number; y: number }[] = [{ x: left, w: right - left, y: margin }];
  const placed = new Map<number, BoxPanel2D>();
  for (const i of order) {
    const p = panels[i];
    let bestX = left;
    let bestY = Infinity;
    for (let s = 0; s < sky.length; s++) {
      const x = sky[s].x;
      if (x + p.widthMm > right + EPS) break;
      let y = 0;
      for (let t = s; t < sky.length && sky[t].x < x + p.widthMm - EPS; t++) y = Math.max(y, sky[t].y);
      if (y < bestY - EPS) {
        bestY = y;
        bestX = x;
      }
    }
    // Off the bottom (or wider than the sheet): it waits for the next sheet.
    if (bestY === Infinity || bestY + p.heightMm > bottom + EPS) continue;
    placed.set(i, { ...p, sheetX: bestX, sheetY: bestY });

    // Raise the skyline under the piece and its gap, then merge level neighbours.
    const x0 = bestX;
    const x1 = Math.min(right, bestX + p.widthMm + gap);
    const top = bestY + p.heightMm + gap;
    const next: typeof sky = [];
    for (const seg of sky) {
      const a = seg.x;
      const b = seg.x + seg.w;
      if (b <= x0 + EPS || a >= x1 - EPS) {
        next.push(seg);
        continue;
      }
      if (a < x0) next.push({ x: a, w: x0 - a, y: seg.y });
      if (b > x1) next.push({ x: x1, w: b - x1, y: seg.y });
    }
    next.push({ x: x0, w: x1 - x0, y: top });
    next.sort((a, b) => a.x - b.x);
    sky = next.reduce<typeof sky>((acc, seg) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last.y - seg.y) < EPS && Math.abs(last.x + last.w - seg.x) < EPS) last.w += seg.w;
      else acc.push({ ...seg });
      return acc;
    }, []);
  }
  return placed;
}

/** The pieces packed onto sheets of `widthMm` × `heightMm`, as few as the packing manages. */
export function packSheets(panels: BoxPanel2D[], widthMm: number, heightMm: number, marginMm: number, gapMm: number): SheetLayout {
  const area = (p: BoxPanel2D) => p.widthMm * p.heightMm;
  const fitsAlone = (p: BoxPanel2D) => p.widthMm <= widthMm - 2 * marginMm + EPS && p.heightMm <= heightMm - 2 * marginMm + EPS;
  const tooBig = panels.filter((p) => !fitsAlone(p));
  let remaining = panels.map((_, i) => i).filter((i) => fitsAlone(panels[i]));
  const sheets: Sheet[] = [];

  while (remaining.length > 0) {
    const orders = [
      [...remaining].sort((a, b) => panels[b].heightMm - panels[a].heightMm || panels[b].widthMm - panels[a].widthMm),
      [...remaining].sort((a, b) => area(panels[b]) - area(panels[a])),
      [...remaining].sort((a, b) => panels[b].widthMm - panels[a].widthMm || panels[b].heightMm - panels[a].heightMm),
      remaining,
    ];
    let best = new Map<number, BoxPanel2D>();
    let bestArea = -1;
    for (const order of orders) {
      const placed = packOne(panels, order, widthMm, heightMm, marginMm, gapMm);
      const a = [...placed.values()].reduce((s, p) => s + area(p), 0);
      if (a > bestArea + EPS) {
        best = placed;
        bestArea = a;
      }
    }
    // Every piece here fits an empty sheet alone, so each sheet takes at least one.
    sheets.push({ panels: [...best.keys()].sort((a, b) => a - b).map((i) => best.get(i)!), widthMm, heightMm });
    remaining = remaining.filter((i) => !best.has(i));
  }

  for (const p of tooBig) {
    sheets.push({
      panels: [{ ...p, sheetX: marginMm, sheetY: marginMm }],
      widthMm: Math.max(widthMm, p.widthMm + 2 * marginMm),
      heightMm: Math.max(heightMm, p.heightMm + 2 * marginMm),
    });
  }
  return { sheets, tooBig };
}

/** Space between sheets where they're laid out together, in mm. */
export const SHEET_GAP_MM = 20;

/**
 * The sheets laid out together in a grid, about as many across as down, `gap` apart: the pieces
 * moved to their places in it, and each sheet's place and pieces.
 */
export function arrangeSheets(sheets: Sheet[], gap = SHEET_GAP_MM): { panels: BoxPanel2D[]; regions: SheetRegion[]; widthMm: number; heightMm: number } {
  const cols = Math.ceil(Math.sqrt(sheets.length));
  const cellW = Math.max(...sheets.map((s) => s.widthMm)) + gap;
  const rowH: number[] = [];
  sheets.forEach((s, i) => {
    const r = Math.floor(i / cols);
    rowH[r] = Math.max(rowH[r] ?? 0, s.heightMm + gap);
  });
  const rowTop = rowH.map((_, r) => rowH.slice(0, r).reduce((a, b) => a + b, 0));
  const panels: BoxPanel2D[] = [];
  const regions: SheetRegion[] = sheets.map((s, i) => {
    const x = (i % cols) * cellW;
    const y = rowTop[Math.floor(i / cols)];
    for (const p of s.panels) panels.push({ ...p, sheetX: p.sheetX + x, sheetY: p.sheetY + y });
    return { x, y, widthMm: s.widthMm, heightMm: s.heightMm, panelIds: s.panels.map((p) => p.id) };
  });
  return { panels, regions, widthMm: Math.min(cols, sheets.length) * cellW - gap, heightMm: rowH.reduce((a, b) => a + b, 0) - gap };
}

/**
 * One of the model's sheets as a model of its own, its pieces moved to the sheet's corner, so any
 * exporter writes that sheet alone at the material's size.
 */
export function sheetModel(model: GeneratedBoxModel, index: number): GeneratedBoxModel {
  const region = model.sheets[index];
  const ids = new Set(region.panelIds);
  return {
    ...model,
    panels2D: model.panels2D.filter((p) => ids.has(p.id)).map((p) => ({ ...p, sheetX: p.sheetX - region.x, sheetY: p.sheetY - region.y })),
    sheetWidthMm: region.widthMm,
    sheetHeightMm: region.heightMm,
    sheets: [{ ...region, x: 0, y: 0 }],
  };
}
