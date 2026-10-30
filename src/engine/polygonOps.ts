/**
 * Boolean operations on simple panel outlines, in millimetres, via Clipper2 on a 1 µm grid.
 */
import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import type { Point2D } from './types';

const UNITS = 1000;

const toPaths = (poly: Point2D[]): Paths64 => {
  const path = new Path64();
  for (const p of poly) path.push(new Point64(Math.round(p.x * UNITS), Math.round(p.y * UNITS)));
  const paths = new Paths64();
  paths.push(path);
  return paths;
};

/** The largest outline of a result, back in millimetres, collinear points trimmed. */
function largest(paths: Paths64): Point2D[] {
  const best = paths
    .map((p) => Clipper.trimCollinear(p))
    .filter((p) => p.length >= 3)
    .sort((a, b) => Math.abs(Clipper.area(b)) - Math.abs(Clipper.area(a)))[0];
  return best ? best.map((q) => ({ x: q.x / UNITS, y: q.y / UNITS })) : [];
}

/** The outline of two overlapping or touching polygons together. */
export const polygonUnion = (a: Point2D[], b: Point2D[]): Point2D[] =>
  largest(Clipper.Union(toPaths(a), toPaths(b), FillRule.NonZero));

/** `a` with `b` cut away; for a notch that opens onto `a`'s edge. */
export const polygonDifference = (a: Point2D[], b: Point2D[]): Point2D[] =>
  largest(Clipper.Difference(toPaths(a), toPaths(b), FillRule.NonZero));

/** Twice the signed area, positive when the outline runs clockwise on screen (y down). */
const signedArea = (poly: Point2D[]) =>
  poly.reduce((sum, p, i) => {
    const q = poly[(i + 1) % poly.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);

/**
 * The outline turned clockwise on screen and started at its corner nearest (x, y): for a panel
 * whose top edge is to be replaced, start at the top-right corner, run down the right edge, and the
 * outline ends at the top-left corner.
 */
export function startAtTopRight(poly: Point2D[], x: number, y: number): Point2D[] {
  const cw = signedArea(poly) < 0 ? [...poly].reverse() : poly;
  let at = 0;
  cw.forEach((p, i) => {
    if (Math.hypot(p.x - x, p.y - y) < Math.hypot(cw[at].x - x, cw[at].y - y)) at = i;
  });
  return [...cw.slice(at), ...cw.slice(0, at)];
}
