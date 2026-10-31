import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';

const m = generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger', templateId: 'finger-organizer', dividerCols: 3, dividerRows: 2 });
const T = m.params.materialThicknessMm;
const innerH = m.innerDims.heightMm;
const points = (id: string) => m.panels3D.find((p) => p.id === id)!.outlinePoints!;

describe('organizer divider slots', () => {
  it('cuts each wall slot open from the top edge, half the wall deep, with no closed holes', () => {
    for (const [wall, n] of [['front', 2], ['back', 2], ['left', 1], ['right', 1]] as const) {
      const spec = m.panels3D.find((p) => p.id === wall)!;
      expect(spec.holeContours ?? []).toHaveLength(0);
      // Notch floors: points half the wall down, in pairs, two per notch.
      const floors = points(wall).filter((p) => Math.abs(p.y - (T + innerH / 2)) < 1e-6);
      expect(floors).toHaveLength(2 * n);
      // Each floor is reached straight down from the top edge.
      for (const f of floors) expect(points(wall).some((p) => Math.abs(p.x - f.x) < 1e-6 && Math.abs(p.y - T) < 1e-6)).toBe(true);
    }
  });

  it('gives each divider an end tab in its top half that reaches the wall’s outside', () => {
    const pts = points('divider-x-1');
    const L = m.innerDims.depthMm + 2 * T;
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(L, 6);
    // At the very ends the divider is only as tall as the tab.
    const ends = pts.filter((p) => p.x < 1e-6 || p.x > L - 1e-6);
    expect(Math.max(...ends.map((p) => p.y))).toBeCloseTo(innerH / 2, 6);
  });

  it('stands the dividers flush with the walls’ tops', () => {
    expect(m.panels3D.find((p) => p.id === 'divider-y-1')!.heightMm).toBeCloseTo(innerH, 6);
  });
});
