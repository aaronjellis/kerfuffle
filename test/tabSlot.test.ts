import { describe, expect, it } from 'vitest';
import { slotsFor, tabCentres, tabbedEdge } from '../src/engine/tabSlot';

const centreOf = (r: { x: number; y: number }[]) => ({
  x: (Math.min(...r.map((p) => p.x)) + Math.max(...r.map((p) => p.x))) / 2,
  y: (Math.min(...r.map((p) => p.y)) + Math.max(...r.map((p) => p.y))) / 2,
});
const size = (r: { x: number; y: number }[]) => ({
  w: Math.max(...r.map((p) => p.x)) - Math.min(...r.map((p) => p.x)),
  h: Math.max(...r.map((p) => p.y)) - Math.min(...r.map((p) => p.y)),
});

describe('tab and slot', () => {
  const run = { fromMm: 0, toMm: 100, count: 2, tabMm: 12 };

  it('centres tabs evenly in their run', () => {
    expect(tabCentres(run)).toEqual([25, 75]);
  });

  it('lines every slot up with its tab', () => {
    const slots = slotsFor(run, 5, 3, 0.1, false);
    expect(slots.map((s) => centreOf(s).y)).toEqual(tabCentres(run).map((c) => expect.closeTo(c, 6)));
    for (const s of slots) expect(centreOf(s).x).toBeCloseTo(5, 6);
  });

  it('shrinks slots by the kerf so tabs friction-fit', () => {
    const [tight] = slotsFor(run, 5, 3, 0.3, true);
    expect(size(tight).w).toBeCloseTo(11.7, 6);
    expect(size(tight).h).toBeCloseTo(2.7, 6);
    const [exact] = slotsFor(run, 5, 3, 0, true);
    expect(size(exact).w).toBeCloseTo(12, 6);
    expect(size(exact).h).toBeCloseTo(3, 6);
  });

  it('keeps the edge closed and square', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 0, y: 100 };
    const pts = tabbedEdge(a, b, run, 3, 1);
    expect(pts[0]).toEqual(a);
    expect(pts[pts.length - 1]).toEqual(b);
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      // Every step runs along x or along y: square corners only.
      expect(Math.abs(dx) < 1e-9 || Math.abs(dy) < 1e-9).toBe(true);
    }
    // Two tabs, each out 3 mm and back: the furthest point is 3 mm out.
    expect(Math.max(...pts.map((p) => Math.abs(p.x)))).toBeCloseTo(3, 9);
  });
});
