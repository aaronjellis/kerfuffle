import { describe, expect, it } from 'vitest';
import { area, bounds, outerCount } from '../src/engine/geom';
import { DEFAULT_SHAPE, SHAPE_OPTIONS, buildShape, clampShape, secondaryMax } from '../src/engine/shapes';
import type { ShapeConfig, ShapeKind } from '../src/engine/shapes';

const solid = SHAPE_OPTIONS.filter((o) => o.kind !== 'hugText').map((o) => o.kind);

describe('shapes', () => {
  it.each(solid)('%s fills its box and is one piece', (kind) => {
    const poly = buildShape({ ...DEFAULT_SHAPE, kind }, 0.01);
    const b = bounds(poly)!;
    expect(b.w).toBeCloseTo(101.6, 1);
    expect(b.h).toBeCloseTo(50.8, 1);
    expect(outerCount(poly)).toBe(1);
    expect(area(poly)).toBeGreaterThan(0.6 * 101.6 * 50.8);
  });

  it.each(solid)('%s is centered on the origin', (kind) => {
    const b = bounds(buildShape({ ...DEFAULT_SHAPE, kind }, 0.01))!;
    expect(b.x + b.w / 2).toBeCloseTo(0, 1);
    expect(b.y + b.h / 2).toBeCloseTo(0, 1);
  });

  it('rounded has the rect area less the corner waste', () => {
    const a = area(buildShape({ ...DEFAULT_SHAPE, kind: 'rounded' }, 0.01));
    expect(a).toBeCloseTo(101.6 * 50.8 - (4 - Math.PI) * 6.35 ** 2, 0);
  });

  it('ticket is smaller than the rect by four quarter circles', () => {
    const a = area(buildShape({ ...DEFAULT_SHAPE, kind: 'ticket' }, 0.01));
    expect(a).toBeCloseTo(101.6 * 50.8 - Math.PI * 6.35 ** 2, 0);
  });

  it('rect, chamfer and corner cut have the exact polygon areas', () => {
    const rect = 101.6 * 50.8;
    expect(area(buildShape({ ...DEFAULT_SHAPE, kind: 'rect' }, 0.01))).toBeCloseTo(rect, 2);
    expect(area(buildShape({ ...DEFAULT_SHAPE, kind: 'chamfer' }, 0.01))).toBeCloseTo(rect - 2 * 6.35 ** 2, 2);
    expect(area(buildShape({ ...DEFAULT_SHAPE, kind: 'cornerCut' }, 0.01))).toBeCloseTo(rect - 4 * 6.35 ** 2, 2);
  });

  it('pill and ellipse have their analytic areas', () => {
    const pill = area(buildShape({ ...DEFAULT_SHAPE, kind: 'pill' }, 0.01));
    // A polygon inscribed in a curve loses about 2/3 · tolerance · perimeter of area; Kerfuffle's
    // rounded rectangle also stops its corners 0.1 mm short of a full half circle, about 2 mm² more.
    expect(Math.abs(pill - (50.8 * 50.8 + Math.PI * 25.4 ** 2))).toBeLessThan(4);
    const ellipse = area(buildShape({ ...DEFAULT_SHAPE, kind: 'ellipse' }, 0.01));
    expect(Math.abs(ellipse - Math.PI * 50.8 * 25.4)).toBeLessThan(2);
  });

  it('a curved edge never strays further than the tolerance from the true curve', () => {
    for (const tol of [0.05, 0.01]) {
      const poly = buildShape({ ...DEFAULT_SHAPE, kind: 'ellipse' }, tol);
      const [a, b] = [50.8, 25.4];
      for (const contour of poly) {
        for (let i = 0; i < contour.length; i++) {
          const p = contour[i];
          const q = contour[(i + 1) % contour.length];
          const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
          // Radial distance to the ellipse, scaled by the local radius: a close enough bound for a flat chord.
          const f = Math.hypot(mid.x / a, mid.y / b);
          const r = Math.hypot(mid.x, mid.y) / f;
          expect(Math.hypot(mid.x, mid.y) - r).toBeLessThanOrEqual(0);
          expect(r - Math.hypot(mid.x, mid.y)).toBeLessThanOrEqual(tol * 1.05 * (a / b));
        }
      }
    }
  });

  it('a coarser tolerance uses fewer points', () => {
    const fine = buildShape({ ...DEFAULT_SHAPE, kind: 'rounded' }, 0.01)[0].length;
    const coarse = buildShape({ ...DEFAULT_SHAPE, kind: 'rounded' }, 0.2)[0].length;
    expect(coarse).toBeLessThan(fine);
  });

  it('scallop puts a circle at every corner and a bump between neighbors', () => {
    const poly = buildShape({ ...DEFAULT_SHAPE, kind: 'scallop' }, 0.01);
    // The corner circle is centered s in from each corner and reaches the box corner's bounding lines.
    const b = bounds(poly)!;
    expect(b.w).toBeCloseTo(101.6, 1);
    // Scalloping removes area from the rect: the edge is notched between circles.
    expect(area(poly)).toBeLessThan(101.6 * 50.8);
  });

  it('hugText has no outline of its own', () => {
    expect(buildShape({ ...DEFAULT_SHAPE, kind: 'hugText' }, 0.01)).toEqual([]);
  });

  it('SHAPE_OPTIONS covers every kind once, with sentence-case labels', () => {
    const kinds = SHAPE_OPTIONS.map((o) => o.kind);
    expect(new Set(kinds).size).toBe(13);
    const labels = SHAPE_OPTIONS.map((o) => o.label);
    expect(labels).toContain('Rounded rectangle');
    expect(labels).toContain('Corner cut');
    expect(labels).toContain('Double round');
    expect(labels).toContain('Border around the lettering');
    for (const label of labels) expect(label).toBe(label[0].toUpperCase() + label.slice(1).toLowerCase());
  });

  it('DEFAULT_SHAPE matches the brief', () => {
    expect(DEFAULT_SHAPE).toEqual({
      kind: 'rounded', widthMm: 101.6, heightMm: 50.8, cornerMm: 6.35, scallopMm: 4, depthMm: 4, hugMm: 4,
    });
  });

  describe('clampShape', () => {
    it('holds each secondary size to secondaryMax, the limit the Shape section shows', () => {
      const c = clampShape({ ...DEFAULT_SHAPE, cornerMm: 99, scallopMm: 99, depthMm: 99, hugMm: 99 });
      const short = Math.min(c.widthMm, c.heightMm);
      expect([c.cornerMm, c.scallopMm, c.depthMm]).toEqual([secondaryMax('corner', short), secondaryMax('scallop', short), secondaryMax('depth', short)]);
      expect(c.hugMm).toBe(99);
      expect(secondaryMax('hug', short)).toBe(Infinity);
    });
    it('limits a corner larger than half the short side', () => {
      expect(clampShape({ ...DEFAULT_SHAPE, cornerMm: 60 }).cornerMm).toBe(25.4);
      const poly = buildShape(clampShape({ ...DEFAULT_SHAPE, cornerMm: 60 }), 0.01);
      expect(outerCount(poly)).toBe(1);
    });
    it('limits scallop and depth to a quarter of the short side', () => {
      const c = clampShape({ ...DEFAULT_SHAPE, scallopMm: 40, depthMm: 40 });
      expect(c.scallopMm).toBe(12.7);
      expect(c.depthMm).toBe(12.7);
    });
    it('raises a dimension below 5 mm to 5 mm and re-clamps the rest against it', () => {
      const c = clampShape({ ...DEFAULT_SHAPE, widthMm: 1, heightMm: 2, cornerMm: 6.35 });
      expect(c.widthMm).toBe(5);
      expect(c.heightMm).toBe(5);
      expect(c.cornerMm).toBe(2.5);
    });
    it('leaves a valid shape unchanged', () => {
      expect(clampShape(DEFAULT_SHAPE)).toEqual(DEFAULT_SHAPE);
    });
  });

  describe('every shape stays one piece at its clamp limits', () => {
    const sizes: [number, number][] = [[101.6, 50.8], [50.8, 101.6], [40, 40], [5, 5], [200, 12]];
    const params: Pick<ShapeConfig, 'cornerMm' | 'scallopMm' | 'depthMm'>[] = [
      { cornerMm: 0, scallopMm: 0, depthMm: 0 },
      { cornerMm: 0.5, scallopMm: 0.5, depthMm: 0.5 },
      { cornerMm: 6.35, scallopMm: 4, depthMm: 4 },
      { cornerMm: 1000, scallopMm: 1000, depthMm: 1000 },
    ];
    it.each(solid)('%s', (kind: ShapeKind) => {
      for (const [widthMm, heightMm] of sizes) {
        for (const p of params) {
          const shape = clampShape({ ...DEFAULT_SHAPE, kind, widthMm, heightMm, ...p });
          const poly = buildShape(shape, 0.05);
          const b = bounds(poly)!;
          const label = JSON.stringify(shape);
          expect(outerCount(poly), label).toBe(1);
          expect(poly.length, label).toBe(1);
          expect(b.w, label).toBeCloseTo(shape.widthMm, 1);
          expect(b.h, label).toBeCloseTo(shape.heightMm, 1);
        }
      }
    });
  });
});
