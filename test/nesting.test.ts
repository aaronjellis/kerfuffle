import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { BOX_TEMPLATES, DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters } from '../src/engine/types';

const sizes = [
  { widthMm: 110, depthMm: 80, heightMm: 55 },
  { widthMm: 100, depthMm: 100, heightMm: 50 },
  { widthMm: 200, depthMm: 150, heightMm: 90 },
  { widthMm: 60, depthMm: 40, heightMm: 30 },
];

describe('sheet layout', () => {
  it('fits a 100 mm living-hinge box on the xTool M2 bed, lid in a column beside the rest', () => {
    const m = generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, templateId: 'finger-living-hinge', ...sizes[1] });
    expect(m.sheetWidthMm).toBeLessThanOrEqual(385);
    expect(m.sheetHeightMm).toBeLessThanOrEqual(300);
    expect(m.fitsOnBed).toBe(true);
  });

  for (const template of BOX_TEMPLATES) {
    it.each(sizes)(`lays out ${template.id} at $widthMm × $depthMm × $heightMm with no piece overlapping another`, (size) => {
      const params: BoxParameters = { ...DEFAULT_BOX_PARAMETERS, category: template.category, templateId: template.id, ...size };
      const m = generateBoxModel(params);
      const gap = params.partSpacingMm - 1e-6;
      const ps = m.panels2D;
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i];
        // Inside the sheet, clear of its margin.
        expect(a.sheetX).toBeGreaterThanOrEqual(params.sheetMarginMm - 1e-6);
        expect(a.sheetY).toBeGreaterThanOrEqual(params.sheetMarginMm - 1e-6);
        expect(a.sheetX + a.widthMm).toBeLessThanOrEqual(m.sheetWidthMm - params.sheetMarginMm + 1e-6);
        expect(a.sheetY + a.heightMm).toBeLessThanOrEqual(m.sheetHeightMm - params.sheetMarginMm + 1e-6);
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j];
          const apart =
            a.sheetX + a.widthMm + gap <= b.sheetX ||
            b.sheetX + b.widthMm + gap <= a.sheetX ||
            a.sheetY + a.heightMm + gap <= b.sheetY ||
            b.sheetY + b.heightMm + gap <= a.sheetY;
          expect(apart, `${a.id} and ${b.id}`).toBe(true);
        }
      }
    });
  }
});
