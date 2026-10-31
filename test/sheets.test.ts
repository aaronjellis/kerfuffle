import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { sheetModel } from '../src/engine/sheets';
import type { BoxParameters } from '../src/engine/types';

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
        const p = m.panels2D.find((q) => q.id === id)!;
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
