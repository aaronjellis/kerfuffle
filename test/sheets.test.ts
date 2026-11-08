import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { packSheets, sheetModel } from '../src/engine/sheets';
import type { BoxPanel2D, BoxParameters, FaceArtwork } from '../src/engine/types';
import { footprint, placeSvgPath, toSheet } from '../src/engine/placement';
import { resolveSheetArtworks, svgPathToPolylines } from '../src/engine/exporters';

const model = (p: Partial<BoxParameters>) =>
  generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger', templateId: 'finger-basic', ...p });

describe('material sheets', () => {
  it('keeps one sheet over the whole layout when the pieces fit the bed', () => {
    const m = model({});
    expect(m.sheets).toHaveLength(1);
    expect(m.sheetSize).toBeUndefined();
  });

  it('splits onto material sheets, every piece on one, each inside its sheet', () => {
    const m = model({ materialSheet: true, materialWidthMm: 300, materialHeightMm: 200 });
    expect(m.sheets.length).toBeGreaterThan(1);
    expect(m.sheets.flatMap((s) => s.panelIds).sort()).toEqual(m.panels2D.map((p) => p.id).sort());
    for (const s of m.sheets)
      for (const id of s.panelIds) {
        const q0 = m.panels2D.find((q) => q.id === id)!;
        const p = { ...q0, ...footprint(q0) };
        expect(p.sheetX).toBeGreaterThanOrEqual(s.x);
        expect(p.sheetY).toBeGreaterThanOrEqual(s.y);
        expect(p.sheetX + p.widthMm).toBeLessThanOrEqual(s.x + s.widthMm + 1e-6);
        expect(p.sheetY + p.heightMm).toBeLessThanOrEqual(s.y + s.heightMm + 1e-6);
      }
  });

  it('splits a box too big for the bed onto bed-sized sheets', () => {
    const m = model({ widthMm: 300, depthMm: 250, heightMm: 200 });
    expect(m.fitsOnBed).toBe(false);
    expect(m.sheets.length).toBeGreaterThan(1);
    expect(m.sheetSize?.widthMm).toBe(385);
  });

  it('cuts one sheet out as a model of its own, at the material size', () => {
    const m = model({ materialSheet: true, materialWidthMm: 300, materialHeightMm: 200 });
    const one = sheetModel(m, 1);
    expect(one.sheetWidthMm).toBe(300);
    expect(one.panels2D.map((p) => p.id)).toEqual(m.sheets[1].panelIds);
    expect(Math.min(...one.panels2D.map((p) => p.sheetX))).toBeLessThan(300);
  });

  it('trims a material sheet bigger than the bed to the bed', () => {
    const m = model({ materialSheet: true, materialWidthMm: 1000, materialHeightMm: 1000 });
    expect(m.sheetSize).toMatchObject({ widthMm: 385, heightMm: 300, trimmed: true });
  });
});

describe('quarter turns', () => {
  const piece = (id: string, w: number, h: number, d?: string): BoxPanel2D => ({
    id,
    name: id,
    faceLabel: id,
    widthMm: w,
    heightMm: h,
    safeRect: { x: 0, y: 0, width: w, height: h },
    sheetX: 0,
    sheetY: 0,
    paths: [{ id: `${id}-outline`, layer: 'cut', d: d ?? `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`, closed: true }],
  });

  it('turns a piece a quarter turn to share a sheet it would otherwise miss', () => {
    // A tall lid leaves a 110 mm column beside it: a 160 × 100 wall fits there only on its side.
    const { sheets } = packSheets([piece('lid', 160, 280), piece('wall', 160, 100)], 300, 300, 5, 5);
    expect(sheets).toHaveLength(1);
    const wall = sheets[0].panels.find((p) => p.id === 'wall')!;
    expect(wall.quarterTurn).toBe(true);
    expect(footprint(wall)).toEqual({ widthMm: 100, heightMm: 160 });
  });

  it('leaves a piece as drawn when it fits that way', () => {
    const { sheets } = packSheets([piece('a', 200, 100)], 300, 300, 5, 5);
    expect(sheets[0].panels[0].quarterTurn).toBeFalsy();
  });

  it('places a turned piece’s paths, arcs and all, inside its footprint', () => {
    // A 40 × 20 slot with round ends, turned at (10, 10): it should span 20 across and 40 down.
    const slot = piece('slot', 40, 20, 'M 10 0 L 30 0 A 10 10 0 0 1 30 20 L 10 20 A 10 10 0 0 1 10 0 Z');
    const p = { ...slot, sheetX: 10, sheetY: 10, quarterTurn: true };
    const pts = svgPathToPolylines(placeSvgPath(slot.paths[0].d, p), 0, 0).flatMap((l) => l.points);
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    expect(Math.min(...xs)).toBeCloseTo(10, 1);
    expect(Math.max(...xs)).toBeCloseTo(30, 1);
    expect(Math.min(...ys)).toBeCloseTo(10, 1);
    expect(Math.max(...ys)).toBeCloseTo(50, 1);
    // The piece's top left corner lands at its footprint's top right.
    expect(toSheet(p, { x: 0, y: 0 })).toEqual({ x: 30, y: 10 });
  });

  it('turns a piece’s artwork with it', () => {
    const p = { ...piece('wall', 160, 100), sheetX: 10, sheetY: 10, quarterTurn: true };
    const art = { id: 'a', faceId: 'wall', xMm: 20, yMm: 0, rotationDeg: 0 } as FaceArtwork;
    const [placed] = resolveSheetArtworks([p], [art]);
    expect(placed.artwork.rotationDeg).toBe(90);
    expect(placed.quarterTurn).toBe(true);
    // 20 mm right of the centre in the piece's frame is 20 mm down on the sheet.
    expect(placed.sheetCenterX).toBeCloseTo(10 + 50);
    expect(placed.sheetCenterY).toBeCloseTo(10 + 80 + 20);
  });
});
