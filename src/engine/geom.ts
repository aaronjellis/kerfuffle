/**
 * Polygon sets in millimeters on Clipper2. A Poly is a list of closed contours in Clipper's
 * orientation: outer contours have positive area, holes negative. Badge coordinates have y down.
 */
import { Clipper, FillRule, Path64, Paths64 } from 'clipper2-js';

export type Pt = { x: number; y: number };
export type Poly = Pt[][];
export type Rect = { x: number; y: number; w: number; h: number };

/** Clipper works on integers: 1000 units per millimeter. */
export const UNITS_PER_MM = 1000;
/** Chord tolerance for on-screen geometry. */
export const PREVIEW_TOL_MM = 0.05;
/** Chord tolerance for exported geometry. */
export const EXPORT_TOL_MM = 0.01;

export function toPaths64(poly: Poly): Paths64 {
  const paths = new Paths64();
  for (const contour of poly) {
    const path = new Path64();
    for (const p of contour) path.push({ x: Math.round(p.x * UNITS_PER_MM), y: Math.round(p.y * UNITS_PER_MM) });
    paths.push(path);
  }
  return paths;
}

/** Converts back to mm, dropping points on a straight run and contours with fewer than three points. */
export function fromPaths64(paths: Paths64): Poly {
  return paths
    .map((path) => Clipper.trimCollinear(path))
    .filter((path) => path.length >= 3)
    .map((path) => path.map((p) => ({ x: p.x / UNITS_PER_MM, y: p.y / UNITS_PER_MM })));
}

export function union(polys: Poly[]): Poly {
  const subject = new Paths64();
  for (const poly of polys) subject.push(...toPaths64(poly));
  return fromPaths64(Clipper.Union(subject, undefined, FillRule.NonZero));
}

export function difference(a: Poly, b: Poly): Poly {
  return fromPaths64(Clipper.Difference(toPaths64(a), toPaths64(b), FillRule.NonZero));
}

export function intersect(a: Poly, b: Poly): Poly {
  return fromPaths64(Clipper.Intersect(toPaths64(a), toPaths64(b), FillRule.NonZero));
}

/** A closed integer path with positive area, so a non-zero union never cancels pieces against each other. */
function positive(points: Pt[]): Path64 {
  const path = new Path64();
  for (const p of points) path.push({ x: Math.round(p.x * UNITS_PER_MM), y: Math.round(p.y * UNITS_PER_MM) });
  return Clipper.area(path) < 0 ? (path.reverse() as Path64) : path;
}

/** A disc of radius `r` at `c` with no chord further than `tolMm` from the circle. */
function disc(c: Pt, r: number, tolMm: number): Path64 {
  const n = Math.max(8, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - tolMm / r))));
  return positive(
    Array.from({ length: n }, (_, k) => ({
      x: c.x + r * Math.cos((2 * Math.PI * k) / n),
      y: c.y + r * Math.sin((2 * Math.PI * k) / n),
    }))
  );
}

/** A rectangle `2 · d` wide along the segment `a`–`b`, or null for a zero-length segment. */
function bar(a: Pt, b: Pt, d: number): Path64 | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return null;
  const nx = (-(b.y - a.y) / len) * d;
  const ny = ((b.x - a.x) / len) * d;
  return positive([
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ]);
}

/**
 * Every point within `d` of the given paths: a bar along each edge and a disc at each vertex
 * (a closed path) or inner vertex (an open one). Built from Clipper's booleans alone, because clipper2-js 1.2.4's offsetter mis-walks
 * corners.
 */
function band(paths: Pt[][], closed: boolean, d: number, tolMm: number): Poly {
  const pieces = new Paths64();
  for (const path of paths) {
    const edges = closed ? path.length : path.length - 1;
    for (let i = 0; i < edges; i++) {
      const piece = bar(path[i], path[(i + 1) % path.length], d);
      if (piece) pieces.push(piece);
    }
    // A closed path has a vertex at every point; an open one has none at its two ends (butt ends).
    for (const v of closed ? path : path.slice(1, -1)) pieces.push(disc(v, d, tolMm));
  }
  return fromPaths64(Clipper.Union(pieces, undefined, FillRule.NonZero));
}

/** Grows (positive) or shrinks (negative) a polygon with round joins, no chord further than `tolMm` from its arc. */
export function offset(poly: Poly, deltaMm: number, tolMm: number): Poly {
  if (deltaMm > 0) return union([poly, band(poly, true, deltaMm, tolMm)]);
  if (deltaMm < 0) return difference(poly, band(poly, true, -deltaMm, tolMm));
  return poly;
}

/**
 * The same region as `offset(poly, deltaMm)` for a positive delta, built one contour's band at a time
 * and merged two at a time. One union of every bar and disc of a poly made of hundreds of slivers
 * (a thin line pulled in until it breaks up) stalls clipper2-js for minutes; this takes a fraction of a second.
 */
export function grow(poly: Poly, deltaMm: number, tolMm: number): Poly {
  if (!(deltaMm > 0)) return offset(poly, deltaMm, tolMm);
  let level: Poly[] = [poly, ...poly.map((contour) => band([contour], true, deltaMm, tolMm))];
  while (level.length > 1) {
    const next: Poly[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? union([level[i], level[i + 1]]) : level[i]);
    level = next;
  }
  return level[0];
}

/** The outline of an open path as a stroke `2 · halfWidthMm` wide, with butt ends and round joins. */
export function offsetOpen(path: Pt[], halfWidthMm: number, tolMm: number): Poly {
  return band([path], false, halfWidthMm, tolMm);
}

/** The signed area of one contour in mm²: positive for an outer contour, negative for a hole. */
function contourArea(contour: Pt[]): number {
  let a = 0;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    a += (contour[j].x + contour[i].x) * (contour[i].y - contour[j].y);
  }
  return a / 2;
}

/** The filled area in mm²: holes subtract. */
export function area(poly: Poly): number {
  return poly.reduce((sum, contour) => sum + contourArea(contour), 0);
}

export function bounds(poly: Poly): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of poly) {
    for (const p of contour) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The number of outer contours: those with positive area. */
export function outerCount(poly: Poly): number {
  return poly.filter((contour) => contourArea(contour) > 0).length;
}

/** The polygon with every hole removed. */
export function dropHoles(poly: Poly): Poly {
  return poly.filter((contour) => contourArea(contour) > 0);
}

/**
 * Bridges gaps between islands by closing: grow by `d`, then shrink by `d`. Starts at `startMm`
 * and doubles `d` until one outer contour remains or the next `d` would pass `capMm`. When
 * nothing joins, returns the original polygon and the last `d` tried; a `startMm` of zero or less
 * joins nothing.
 */
export function closeIslands(
  poly: Poly,
  startMm: number,
  capMm: number,
  tolMm: number
): { poly: Poly; bridgedMm: number; joined: boolean } {
  if (outerCount(poly) <= 1) return { poly, bridgedMm: 0, joined: true };
  // Doubling a gap of zero never reaches the cap.
  if (!(startMm > 0)) return { poly, bridgedMm: 0, joined: false };
  let d = startMm;
  for (;;) {
    const closed = offset(offset(poly, d, tolMm), -d, tolMm);
    if (outerCount(closed) <= 1) return { poly: closed, bridgedMm: d, joined: true };
    if (d * 2 > capMm) return { poly, bridgedMm: d, joined: false };
    d *= 2;
  }
}

function mapPoints(poly: Poly, f: (p: Pt) => Pt): Poly {
  return poly.map((contour) => contour.map(f));
}

export function translate(poly: Poly, dx: number, dy: number): Poly {
  return mapPoints(poly, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Rotates by `deg` degrees about (`cx`, `cy`), the origin by default. */
export function rotate(poly: Poly, deg: number, cx = 0, cy = 0): Poly {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return mapPoints(poly, (p) => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }));
}

/** Scales by `s` about (`cx`, `cy`), the origin by default. */
export function scale(poly: Poly, s: number, cx = 0, cy = 0): Poly {
  return mapPoints(poly, (p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
}

/** Whether `outer` covers `inner`: the overlap has at least 99.9% of `inner`'s area. */
export function contains(outer: Poly, inner: Poly): boolean {
  return area(intersect(outer, inner)) >= 0.999 * area(inner);
}

/** One `M…Z` subpath per contour. */
export function polyToSvgPath(poly: Poly, decimals = 3): string {
  const num = (v: number) => String(Number(v.toFixed(decimals)));
  return poly
    .map((contour) => `M${contour.map((p) => `${num(p.x)} ${num(p.y)}`).join('L')}Z`)
    .join('');
}

/** The length of a polyline in mm; a closed path includes its closing segment. */
export function pathLength(path: Pt[], closed: boolean): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  if (closed && path.length > 1) {
    length += Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y);
  }
  return length;
}
