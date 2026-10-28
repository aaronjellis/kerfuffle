import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters } from '../src/engine/types';

const W = 110;
const D = 80;
const H = 55;

const box = (p: Partial<BoxParameters> = {}) =>
  generateBoxModel({
    ...DEFAULT_BOX_PARAMETERS,
    category: 'wood-finger',
    templateId: 'finger-basic',
    woodLidStyle: 'telescope-lid',
    widthMm: W,
    depthMm: D,
    heightMm: H,
    dimensionReference: 'inner',
    ...p,
  });

describe('wood box with a telescoping lid', () => {
  for (const T of [3, 6]) {
    for (const gap of [0, 0.5]) {
      describe(`T=${T}, gap ${gap}`, () => {
        const m = box({ materialThicknessMm: T, woodLidClearanceMm: gap, lidHeightMm: 20 });
        const at = (id: string) => m.panels3D.find((p) => p.id === id)!;

        it('cuts an open base and a lid tray: plate plus four skirts', () => {
          const ids = m.panels2D.map((p) => p.id);
          for (const id of ['bottom', 'front', 'back', 'left', 'right', 'top', 'lid-front', 'lid-back', 'lid-left', 'lid-right']) {
            expect(ids).toContain(id);
          }
        });

        it('rests the lid plate on the base walls', () => {
          const baseTop = at('front').closedPos[1] + at('front').heightMm / 2 - T; // nominal frame less the empty top band
          expect(at('top').closedPos[1] - T / 2).toBeCloseTo(baseTop, 6);
          expect(at('top').closedPos[1] - T / 2).toBeCloseTo(H / 2, 6);
        });

        it('clears the base by the gap on every side', () => {
          const baseOuterX = W / 2 + T;
          const baseOuterZ = D / 2 + T;
          expect(at('lid-right').closedPos[0] - T / 2 - baseOuterX).toBeCloseTo(gap, 6);
          expect(-(at('lid-left').closedPos[0] + T / 2) - baseOuterX).toBeCloseTo(gap, 6);
          expect(at('lid-front').closedPos[2] - T / 2 - baseOuterZ).toBeCloseTo(gap, 6);
          expect(-(at('lid-back').closedPos[2] + T / 2) - baseOuterZ).toBeCloseTo(gap, 6);
        });

        it('hangs the skirts the lid depth below the plate', () => {
          for (const id of ['lid-front', 'lid-back', 'lid-left', 'lid-right']) {
            const skirt = at(id);
            const plateTop = H / 2 + T;
            const skirtTop = skirt.closedPos[1] + skirt.heightMm / 2;
            const skirtBottom = skirtTop - (20 + T); // the plate's ply plus the lid depth
            expect(skirtTop).toBeCloseTo(plateTop, 6);
            const ys = skirt.outlinePoints!.map((q) => q.y);
            expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(20 + T, 6);
            expect(skirtBottom).toBeCloseTo(H / 2 - 20, 6);
          }
        });

        it('reports the outside as the lid tray across and base plus plate tall', () => {
          expect(m.outerDims.widthMm).toBeCloseTo(W + 4 * T + 2 * gap, 6);
          expect(m.outerDims.depthMm).toBeCloseTo(D + 4 * T + 2 * gap, 6);
          expect(m.outerDims.heightMm).toBeCloseTo(H + 2 * T, 6);
        });
      });
    }
  }

  it('caps the lid depth at the base’s full outside height', () => {
    const m = box({ materialThicknessMm: 3, lidHeightMm: 200 });
    const skirt = m.panels3D.find((p) => p.id === 'lid-front')!;
    const ys = skirt.outlinePoints!.map((q) => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(H + 3 + 3, 6);
  });

  it('opens a typed outside size to the matching inside', () => {
    const m = box({ materialThicknessMm: 3, dimensionReference: 'outer', widthMm: 123, depthMm: 93, heightMm: 61 });
    expect(m.outerDims.widthMm).toBeCloseTo(123, 6);
    expect(m.outerDims.depthMm).toBeCloseTo(93, 6);
    expect(m.outerDims.heightMm).toBeCloseTo(61, 6);
  });
});
