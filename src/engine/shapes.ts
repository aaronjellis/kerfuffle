/**
 * The badge outline family. Every builder returns one polygon in mm, centered on the origin with
 * y down, flattened so no chord is further than `tolMm` from the true curve.
 */
import { area, difference, intersect, rotate, translate, union } from './geom';
import type { Poly, Pt } from './geom';
import { buildRoundedRectPoints } from './roundedRect';

export type ShapeKind =
  | 'rect' | 'rounded' | 'pill' | 'ellipse' | 'chamfer' | 'cornerCut' | 'ticket'
  | 'doubleRound' | 'scallop' | 'bracket' | 'antique' | 'wave' | 'hugText';

export interface ShapeConfig {
  kind: ShapeKind;
  widthMm: number;
  heightMm: number;
  cornerMm: number;
  scallopMm: number;
  depthMm: number;
  hugMm: number;
}

export interface ShapeOption {
  kind: ShapeKind;
  label: string;
  uses: ('corner' | 'scallop' | 'depth' | 'hug')[];
}

export const SHAPE_OPTIONS: ShapeOption[] = [
  { kind: 'rect', label: 'Rectangle', uses: [] },
  { kind: 'rounded', label: 'Rounded rectangle', uses: ['corner'] },
  { kind: 'pill', label: 'Pill', uses: [] },
  { kind: 'ellipse', label: 'Ellipse', uses: [] },
  { kind: 'chamfer', label: 'Chamfer', uses: ['corner'] },
  { kind: 'cornerCut', label: 'Corner cut', uses: ['corner'] },
  { kind: 'ticket', label: 'Ticket', uses: ['corner'] },
  { kind: 'doubleRound', label: 'Double round', uses: ['corner', 'depth'] },
  { kind: 'scallop', label: 'Scallop', uses: ['scallop'] },
  { kind: 'bracket', label: 'Bracket', uses: ['corner', 'depth'] },
  { kind: 'antique', label: 'Antique', uses: ['corner', 'depth'] },
  { kind: 'wave', label: 'Wave', uses: ['depth'] },
  { kind: 'hugText', label: 'Border around the lettering', uses: ['hug'] },
];

export const DEFAULT_SHAPE: ShapeConfig = {
  kind: 'rounded',
  widthMm: 101.6,
  heightMm: 50.8,
  cornerMm: 6.35,
  scallopMm: 4,
  depthMm: 4,
  hugMm: 4,
};

const MIN_SIDE_MM = 5;
/** Below this a feature is too small to draw, and the shape falls back to a plain rectangle. */
const MIN_FEATURE_MM = 0.05;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The largest a secondary size may be on a badge whose short side is `shortMm`: a corner half of it, a scallop or depth a quarter; the hug has no limit. */
export function secondaryMax(use: ShapeOption['uses'][number], shortMm: number): number {
  if (use === 'corner') return shortMm / 2;
  if (use === 'hug') return Infinity;
  return shortMm / 4;
}

/** Limits every size to what the shape can draw: each secondary size to its `secondaryMax`. */
export function clampShape(shape: ShapeConfig): ShapeConfig {
  const widthMm = Math.max(MIN_SIDE_MM, shape.widthMm);
  const heightMm = Math.max(MIN_SIDE_MM, shape.heightMm);
  const short = Math.min(widthMm, heightMm);
  return {
    ...shape,
    widthMm,
    heightMm,
    cornerMm: clamp(shape.cornerMm, 0, secondaryMax('corner', short)),
    scallopMm: clamp(shape.scallopMm, 0, secondaryMax('scallop', short)),
    depthMm: clamp(shape.depthMm, 0, secondaryMax('depth', short)),
    hugMm: clamp(shape.hugMm, 0, secondaryMax('hug', short)),
  };
}

/** A notch of radius `r` at each corner, kept 0.2 mm short of eating the short side so the box edges still join up. */
function notchRadius(r: number, w: number, h: number): number {
  return Math.min(r, Math.min(w, h) / 2 - 0.1);
}

/** The angle step for which a chord of radius `r` has sagitta `tolMm`. */
function arcStep(r: number, tolMm: number): number {
  return 2 * Math.acos(clamp(1 - tolMm / r, -1, 1));
}

/** Points on a circular arc from `a0` to `a1` (radians), both ends included, an even number of segments. */
function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, tolMm: number): Pt[] {
  const segments = 2 * Math.ceil(Math.abs(a1 - a0) / arcStep(r, tolMm) / 2) || 2;
  return Array.from({ length: segments + 1 }, (_, k) => {
    const a = a0 + ((a1 - a0) * k) / segments;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

/** A full circle, with a vertex every quarter turn so its extremes are exact. */
function circlePoints(cx: number, cy: number, r: number, tolMm: number): Pt[] {
  const n = 4 * Math.max(2, Math.ceil((2 * Math.PI) / arcStep(r, tolMm) / 4));
  return Array.from({ length: n }, (_, k) => ({
    x: cx + r * Math.cos((2 * Math.PI * k) / n),
    y: cy + r * Math.sin((2 * Math.PI * k) / n),
  }));
}

/** A closed contour with positive area, so unions and differences never cancel pieces against each other. */
function outer(points: Pt[]): Poly {
  return [area([points]) < 0 ? [...points].reverse() : points];
}

const rectPoly = (w: number, h: number): Poly =>
  outer([{ x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }]);

function roundedRectPoly(w: number, h: number, r: number, tolMm: number): Poly {
  const radius = Math.min(r, w / 2, h / 2);
  if (radius < MIN_FEATURE_MM) return rectPoly(w, h);
  const segments = Math.max(1, Math.ceil(Math.PI / 2 / arcStep(radius, tolMm)));
  const points = buildRoundedRectPoints(w, h, radius, segments);
  return union([outer(points.map((p) => ({ x: p.x - w / 2, y: p.y - h / 2 })))]);
}

function ellipsePoly(w: number, h: number, tolMm: number): Poly {
  const a = w / 2;
  const b = h / 2;
  const longAxis = Math.max(a, b);
  const shortAxis = Math.min(a, b);
  // The tightest curve is at the ends of the long axis, with radius shortAxis² / longAxis, and a
  // parameter step dt moves at most longAxis · dt along the curve.
  const dt = Math.sqrt((8 * tolMm * shortAxis ** 2) / longAxis) / longAxis;
  const n = 4 * Math.max(2, Math.ceil((2 * Math.PI) / dt / 4));
  return outer(Array.from({ length: n }, (_, k) => ({
    x: a * Math.cos((2 * Math.PI * k) / n),
    y: b * Math.sin((2 * Math.PI * k) / n),
  })));
}

function chamferPoly(w: number, h: number, c: number): Poly {
  const x = w / 2;
  const y = h / 2;
  return outer([
    { x: -x + c, y: -y }, { x: x - c, y: -y }, { x, y: -y + c }, { x, y: y - c },
    { x: x - c, y }, { x: -x + c, y }, { x: -x, y: y - c }, { x: -x, y: -y + c },
  ]);
}

function cornerCutPoly(w: number, h: number, c: number): Poly {
  const x = w / 2;
  const y = h / 2;
  return outer([
    { x: -x + c, y: -y }, { x: x - c, y: -y }, { x: x - c, y: -y + c }, { x, y: -y + c },
    { x, y: y - c }, { x: x - c, y: y - c }, { x: x - c, y }, { x: -x + c, y },
    { x: -x + c, y: y - c }, { x: -x, y: y - c }, { x: -x, y: -y + c }, { x: -x + c, y: -y + c },
  ]);
}

/** The rectangle with a disc of radius `r` taken from each corner. */
function ticketPoly(w: number, h: number, r: number, tolMm: number): Poly {
  const discs = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => outer(circlePoints((sx * w) / 2, (sy * h) / 2, r, tolMm))[0]));
  return difference(rectPoly(w, h), union(discs.map((d) => [d])));
}

function doubleRoundPoly(w: number, h: number, r: number, d: number, tolMm: number): Poly {
  return union([roundedRectPoly(w, h - 2 * d, r, tolMm), roundedRectPoly(w - 2 * d, h, r, tolMm)]);
}

/** The inset rectangle plus a disc of radius `s` at each corner and between corners, about 2s apart. */
function scallopPoly(w: number, h: number, s: number, tolMm: number): Poly {
  const iw = w - 2 * s;
  const ih = h - 2 * s;
  const centers: Pt[] = [];
  const along = (length: number) => Math.max(1, Math.round(length / (2 * s)));
  const nx = along(iw);
  const ny = along(ih);
  for (let i = 0; i <= nx; i++) {
    const x = -iw / 2 + (iw * i) / nx;
    centers.push({ x, y: -ih / 2 }, { x, y: ih / 2 });
  }
  for (let j = 1; j < ny; j++) {
    const y = -ih / 2 + (ih * j) / ny;
    centers.push({ x: -iw / 2, y }, { x: iw / 2, y });
  }
  return union([rectPoly(iw, ih), ...centers.map((c) => outer(circlePoints(c.x, c.y, s, tolMm)))]);
}

/**
 * A cap cut into the top edge, `chord` wide and `depth` deep, as the arc through its ends; it
 * reaches 1 mm past the edge so the cut leaves no sliver. The edge is y = 0 and the cut goes down.
 */
function biteCap(chord: number, depth: number, tolMm: number): Poly {
  const depthCap = Math.min(depth, chord / 2);
  const radius = (chord ** 2 / 4 + depthCap ** 2) / (2 * depthCap);
  const half = Math.asin(chord / 2 / radius);
  // The cap's arc around the center above the edge, seen from below: the lowest point is at angle π/2.
  const cy = depthCap - radius;
  const sweep = depthCap > chord / 2 - 1e-9 ? Math.PI / 2 : half;
  const arc = arcPoints(0, cy, radius, Math.PI / 2 + sweep, Math.PI / 2 - sweep, tolMm);
  return outer([...arc, { x: chord / 2, y: -1 }, { x: -chord / 2, y: -1 }]);
}

/** Moves a top-edge feature onto side `k` (0 top, 1 right, 2 bottom, 3 left) of a `w` × `h` box. */
function toSide(poly: Poly, k: number, w: number, h: number): Poly {
  const [dx, dy] = [[0, -h / 2], [w / 2, 0], [0, h / 2], [-w / 2, 0]][k];
  return translate(rotate(poly, 90 * k), dx, dy);
}

/** A rounded rectangle whose straight sides are scooped inward by `d`, leaving bulging corners. */
function bracketPoly(w: number, h: number, r: number, d: number, tolMm: number): Poly {
  const base = roundedRectPoly(w, h, r, tolMm);
  const bites = [0, 1, 2, 3].flatMap((k) => {
    const chord = (k % 2 === 0 ? w : h) - 2 * Math.min(r, w / 2, h / 2);
    return chord > MIN_FEATURE_MM && d > MIN_FEATURE_MM ? [toSide(biteCap(chord, d, tolMm), k, w, h)] : [];
  });
  return bites.length ? difference(base, union(bites)) : base;
}

/** A side arc of sagitta `d` across `span`, as a lens-shaped region with its tips on the box edges. */
function lens(span: number, thickness: number, d: number, tolMm: number): Poly {
  const radius = (span ** 2 / 4 + d ** 2) / (2 * d);
  const half = Math.asin(span / 2 / radius);
  // Two arcs, each bulging outward by d from the chord at ±(thickness / 2 - d), meeting at the lens tips.
  const top = arcPoints(0, -thickness / 2 + radius, radius, -Math.PI / 2 - half, -Math.PI / 2 + half, tolMm);
  const bottom = arcPoints(0, thickness / 2 - radius, radius, Math.PI / 2 - half, Math.PI / 2 + half, tolMm);
  return outer([...top, ...bottom]);
}

/** A rectangle whose sides bulge outward by `d` toward the middle, with a round notch of radius `r` cut from each corner. */
function antiquePoly(w: number, h: number, r: number, d: number, tolMm: number): Poly {
  const across = lens(w, h, d, tolMm);
  const down = rotate(lens(h, w, d, tolMm), 90);
  const pillow = intersect(across, down);
  const notches = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => outer(circlePoints((sx * w) / 2, (sy * h) / 2, r, tolMm))));
  return r >= MIN_FEATURE_MM ? difference(pillow, union(notches)) : pillow;
}

/**
 * The top side of a wavy outline for a box with half-sizes `a` × `b`: a sine wave inset by up to
 * `d` from the edge, then a quarter-circle corner of radius `d`. Both ends run level into their
 * neighbors, so the corners stay smooth.
 */
function waveSide(a: number, b: number, d: number, tolMm: number): Pt[] {
  const rho = d / 2;
  const half = a - d - rho;
  const waves = Math.max(1, Math.round((2 * half) / (8 * d)));
  const curvature = (d / 2) * ((2 * Math.PI * waves) / (2 * half)) ** 2;
  const step = Math.sqrt((8 * tolMm) / curvature);
  const samples = 2 * waves * Math.max(1, Math.ceil(((2 * half) / step) / (2 * waves)));
  const points: Pt[] = [];
  for (let k = 0; k <= samples; k++) {
    const t = k / samples;
    points.push({ x: -half + 2 * half * t, y: -b + (d / 2) * (1 + Math.cos(2 * Math.PI * waves * t)) });
  }
  // The corner arc's far end is the next side's first point, so it is left out.
  return [...points, ...arcPoints(half, -b + d + rho, rho, -Math.PI / 2, 0, tolMm).slice(1, -1)];
}

function wavePoly(w: number, h: number, d: number, tolMm: number): Poly {
  const [a, b] = [w / 2, h / 2];
  const sides = [waveSide(a, b, d, tolMm), waveSide(b, a, d, tolMm), waveSide(a, b, d, tolMm), waveSide(b, a, d, tolMm)];
  return union([outer(sides.flatMap((side, k) => rotate([side], 90 * k)[0]))]);
}

/** The badge outline for `shape`, centered on the origin. `hugText` has no outline of its own: it returns `[]`. */
export function buildShape(shape: ShapeConfig, tolMm: number): Poly {
  const { widthMm: w, heightMm: h, cornerMm: r, scallopMm: s, depthMm: d } = shape;
  const plain = r < MIN_FEATURE_MM;
  switch (shape.kind) {
    case 'rect':
      return rectPoly(w, h);
    case 'rounded':
      return roundedRectPoly(w, h, r, tolMm);
    case 'pill':
      return roundedRectPoly(w, h, Math.min(w, h) / 2, tolMm);
    case 'ellipse':
      return ellipsePoly(w, h, tolMm);
    case 'chamfer':
      return plain ? rectPoly(w, h) : chamferPoly(w, h, r);
    case 'cornerCut':
      return plain ? rectPoly(w, h) : cornerCutPoly(w, h, notchRadius(r, w, h));
    case 'ticket':
      return plain ? rectPoly(w, h) : ticketPoly(w, h, notchRadius(r, w, h), tolMm);
    case 'doubleRound':
      return d < MIN_FEATURE_MM ? roundedRectPoly(w, h, r, tolMm) : doubleRoundPoly(w, h, r, d, tolMm);
    case 'scallop':
      return s < MIN_FEATURE_MM ? rectPoly(w, h) : scallopPoly(w, h, s, tolMm);
    case 'bracket':
      return bracketPoly(w, h, r, d, tolMm);
    case 'antique':
      return d < MIN_FEATURE_MM ? (plain ? rectPoly(w, h) : ticketPoly(w, h, notchRadius(r, w, h), tolMm)) : antiquePoly(w, h, notchRadius(r, w, h), d, tolMm);
    case 'wave':
      return d < MIN_FEATURE_MM ? rectPoly(w, h) : wavePoly(w, h, d, tolMm);
    case 'hugText':
      return [];
  }
}
