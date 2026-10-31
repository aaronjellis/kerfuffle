import { describe, expect, it } from 'vitest';
import { area, bounds, closeIslands, contains, difference, dropHoles, grow, offset, offsetOpen, outerCount, pathLength, polyToSvgPath, rotate, scale, translate, union } from '../src/engine/geom';
import type { Poly } from '../src/engine/geom';

const square = (s: number, cx = 0, cy = 0): Poly => [[{x:cx-s/2,y:cy-s/2},{x:cx+s/2,y:cy-s/2},{x:cx+s/2,y:cy+s/2},{x:cx-s/2,y:cy+s/2}]];

describe('geom', () => {
  it('union of two overlapping squares has one outer contour and the right area', () => {
    const u = union([square(10), square(10, 5, 0)]);
    expect(outerCount(u)).toBe(1);
    expect(area(u)).toBeCloseTo(150, 3);
  });
  it('difference leaves a hole with negative area', () => {
    const d = difference(square(10), square(4));
    expect(d).toHaveLength(2);
    expect(area(d)).toBeCloseTo(84, 3);
    expect(dropHoles(d)).toHaveLength(1);
  });
  it('offset outward by 1 with round joins adds π·1² plus the perimeter band', () => {
    const o = offset(square(10), 1, 0.01);
    expect(area(o)).toBeCloseTo(100 + 40 + Math.PI, 1);
  });
  it('offset inward past the center returns an empty polygon', () => {
    expect(offset(square(10), -6, 0.01)).toHaveLength(0);
  });
  it('closeIslands joins two squares 4 mm apart and reports the bridge', () => {
    const r = closeIslands(union([square(10, -7, 0), square(10, 7, 0)]), 1, 50, 0.01);
    expect(r.joined).toBe(true);
    expect(outerCount(r.poly)).toBe(1);
    expect(r.bridgedMm).toBeGreaterThanOrEqual(2);
  });
  it('closeIslands gives up at the cap', () => {
    const r = closeIslands(union([square(10, -40, 0), square(10, 40, 0)]), 1, 4, 0.01);
    expect(r.joined).toBe(false);
    expect(outerCount(r.poly)).toBe(2);
  });
  it('closeIslands with a start of zero returns the input instead of looping', () => {
    const two = union([square(10, -40, 0), square(10, 40, 0)]);
    for (const start of [0, -1]) {
      const r = closeIslands(two, start, 50, 0.01);
      expect(r).toEqual({ poly: two, bridgedMm: 0, joined: false });
    }
  });
  it('grow covers the same region as an outward offset, holes included', () => {
    const ring = difference(square(20), square(8));
    const pieces = union([square(4, -20, 0), square(4, 20, 0), ...[-6, -2, 2, 6].map((x) => square(1, x, 30))]);
    for (const poly of [ring, pieces]) {
      const a = offset(poly, 1, 0.01);
      const b = grow(poly, 1, 0.01);
      expect(area(b)).toBeCloseTo(area(a), 2);
      expect(area(difference(a, b)) + area(difference(b, a))).toBeLessThan(1e-3);
    }
  });
  it('rotate by 90 about the origin swaps the bounds', () => {
    const b = bounds(rotate([[{x:0,y:0},{x:4,y:0},{x:4,y:2},{x:0,y:2}]], 90))!;
    expect(b.w).toBeCloseTo(2); expect(b.h).toBeCloseTo(4);
  });
  it('polyToSvgPath closes every contour', () => {
    expect(polyToSvgPath(square(2))).toBe('M-1 -1L1 -1L1 1L-1 1Z');
  });
  it('offset inward by 1 shrinks a square by 1 on every side', () => {
    expect(area(offset(square(10), -1, 0.01))).toBeCloseTo(64, 3);
  });
  it('offset inward on a square ring keeps both contours', () => {
    const o = offset(difference(square(10), square(4)), -1, 0.01);
    expect(o).toHaveLength(2);
    // 8·8 outer minus the hole grown from 4·4 to 6·6; its four corners stay round, which gives back 4 − π.
    expect(Math.abs(area(o) - (64 - 36 + 4 - Math.PI))).toBeLessThan(0.1);
  });
  it('offsetOpen of a straight segment has butt ends and no end caps', () => {
    expect(area(offsetOpen([{x:0,y:0},{x:10,y:0}], 1, 0.01))).toBeCloseTo(20, 1);
  });
  it('offsetOpen strokes a bent path with butt ends and a round inner join', () => {
    const stroke = offsetOpen([{x:0,y:0},{x:10,y:0},{x:10,y:10}], 1, 0.01);
    expect(outerCount(stroke)).toBe(1);
    // Two 10 × 2 bars overlap in a 1 × 1 square; the disc at the bend adds its outer quarter.
    expect(area(stroke)).toBeCloseTo(20 + 20 - 1 + Math.PI / 4, 1);
    const b = bounds(stroke)!;
    expect(b.x).toBeCloseTo(0, 3);
    expect(b.w).toBeCloseTo(11, 3);
  });
  it('pathLength counts the closing segment only when closed', () => {
    const p = [{x:0,y:0},{x:3,y:0},{x:3,y:4}];
    expect(pathLength(p, false)).toBeCloseTo(7);
    expect(pathLength(p, true)).toBeCloseTo(12);
  });
  it('translate and scale move and resize about a center', () => {
    const t = bounds(translate(square(2), 5, -3))!;
    expect(t.x).toBeCloseTo(4); expect(t.y).toBeCloseTo(-4);
    const s = bounds(scale(square(2, 4, 0), 2, 4, 0))!;
    expect(s.x).toBeCloseTo(2); expect(s.w).toBeCloseTo(4);
  });
  it('contains is true for a covered shape and false for a straddling one', () => {
    expect(contains(square(10), square(4))).toBe(true);
    expect(contains(square(10), square(4, 5, 0))).toBe(false);
  });
});
