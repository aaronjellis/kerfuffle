/**
 * Living-hinge kerf patterns: the cuts that let a rigid sheet bend. A region is a rectangle, origin
 * top-left, y down; the sheet bends about lines running along x, so the cuts mostly run along x.
 *
 * Every pattern is a set of shapes, each one or more open polylines cut by the laser. Two shapes
 * never touch: the wood between them, the web, holds the hinge together, and its narrowest point
 * decides whether the hinge flexes or snaps (`hingeMinWebMm`).
 */
import type { Point2D } from './types';

export const HINGE_PATTERN_IDS = ['straight', 'wave', 'cross', 'diamond', 'triangle', 'honeycomb'] as const;
export type HingePatternId = (typeof HINGE_PATTERN_IDS)[number];

export interface HingePatternSettings {
  pattern: HingePatternId;
  /** Row spacing for slit patterns; for lattices, the spacing of parallel cut lines. */
  pitchMm: number;
  /** Slit length. Lattices take theirs from the pitch and ignore it. */
  cutMm: number;
  /** Uncut wood between slits in a row, or at each lattice junction. */
  bridgeMm: number;
}

export interface HingePatternInfo {
  id: HingePatternId;
  name: string;
  description: string;
  /** Whether the slit length applies. */
  usesCut: boolean;
  /** What the pitch means for this pattern. */
  pitchLabel: string;
  pitchRangeMm: [number, number];
  defaults: Omit<HingePatternSettings, 'pattern'>;
}

export const HINGE_PATTERNS: HingePatternInfo[] = [
  {
    id: 'straight',
    name: 'Straight',
    description: 'Staggered straight slits. The classic: bends one way, the most of any pattern.',
    usesCut: true,
    pitchLabel: 'Row spacing',
    pitchRangeMm: [1.5, 8],
    defaults: { pitchMm: 2.5, cutMm: 30, bridgeMm: 3.5 },
  },
  {
    id: 'wave',
    name: 'Wave',
    description: 'Staggered wavy slits. Bends one way, a little stiffer than straight, and spreads the strain.',
    usesCut: true,
    pitchLabel: 'Row spacing',
    pitchRangeMm: [1.5, 8],
    defaults: { pitchMm: 3, cutMm: 30, bridgeMm: 4 },
  },
  {
    id: 'cross',
    name: 'Cross',
    description: 'Staggered crosses. Bends one way and twists a little.',
    usesCut: true,
    pitchLabel: 'Row spacing',
    pitchRangeMm: [1.5, 8],
    defaults: { pitchMm: 3, cutMm: 16, bridgeMm: 4 },
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description: 'A lattice of long diamonds. Bends both ways.',
    usesCut: false,
    pitchLabel: 'Line spacing',
    pitchRangeMm: [3, 20],
    defaults: { pitchMm: 6, cutMm: 30, bridgeMm: 2.8 },
  },
  {
    id: 'triangle',
    name: 'Triangle',
    description: 'A lattice of triangles. Bends both ways and twists; the stiffest pattern.',
    usesCut: false,
    pitchLabel: 'Line spacing',
    pitchRangeMm: [4, 20],
    defaults: { pitchMm: 7, cutMm: 30, bridgeMm: 2.8 },
  },
  {
    id: 'honeycomb',
    name: 'Honeycomb',
    description: 'A lattice of hexagons. Bends both ways and stretches a little.',
    usesCut: false,
    pitchLabel: 'Cell size',
    pitchRangeMm: [4, 24],
    defaults: { pitchMm: 8, cutMm: 30, bridgeMm: 2 },
  },
];

export const hingePatternInfo = (id: HingePatternId): HingePatternInfo =>
  HINGE_PATTERNS.find((p) => p.id === id) ?? HINGE_PATTERNS[0];

export const isHingePatternId = (v: unknown): v is HingePatternId =>
  typeof v === 'string' && (HINGE_PATTERN_IDS as readonly string[]).includes(v);

/** One cut shape: polylines that may cross each other but never another shape. */
export type HingeShape = Point2D[][];

export interface HingeRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest settings that still make a pattern; the UI's lower limits. */
export const MIN_HINGE_CUT_MM = 4;
export const MIN_HINGE_BRIDGE_MM = 0.6;

const clampSettings = (s: HingePatternSettings): HingePatternSettings => {
  const info = hingePatternInfo(s.pattern);
  return {
    pattern: info.id,
    pitchMm: Math.max(1, Number.isFinite(s.pitchMm) ? s.pitchMm : info.defaults.pitchMm),
    cutMm: Math.max(MIN_HINGE_CUT_MM, Number.isFinite(s.cutMm) ? s.cutMm : info.defaults.cutMm),
    bridgeMm: Math.max(MIN_HINGE_BRIDGE_MM, Number.isFinite(s.bridgeMm) ? s.bridgeMm : info.defaults.bridgeMm),
  };
};

/** Wave slits swing this share of the row spacing either side of the row. */
const WAVE_AMPLITUDE = 0.35;
/** A wave's length, in row spacings. */
const WAVE_LENGTH = 4;
/** A cross's upright reaches this share of the row spacing either side of the row. */
const CROSS_REACH = 0.6;
/** Diamond lines lean this far from the bend line, so the diamonds lie long across it. */
const DIAMOND_ANGLE = Math.PI / 6;

/** How far a pattern's cuts reach either side of their row line. */
function rowReach(s: HingePatternSettings): number {
  if (s.pattern === 'wave') return WAVE_AMPLITUDE * s.pitchMm;
  if (s.pattern === 'cross') return CROSS_REACH * s.pitchMm;
  return 0;
}

/**
 * Slit patterns: rows `pitch` apart, centred on the region, each row's slits `cut` long with
 * `bridge` between them, every other row moved half a step so its slits cover the last row's bridges.
 */
function rowShapes(s: HingePatternSettings, hw: number, hh: number): HingeShape[] {
  const p = s.pitchMm;
  const step = s.cutMm + s.bridgeMm;
  const reach = rowReach(s);
  const rows = Math.max(1, Math.floor((2 * hh - 2 * reach) / p + 1e-9) + 1);
  const amp = WAVE_AMPLITUDE * p;
  const lambda = WAVE_LENGTH * p;
  const out: HingeShape[] = [];
  for (let r = 0; r < rows; r++) {
    const y = -((rows - 1) * p) / 2 + r * p;
    const off = r % 2 === 1 ? step / 2 : 0;
    const iMin = Math.floor((-hw - step - off) / step);
    const iMax = Math.ceil((hw + step - off) / step);
    for (let i = iMin; i <= iMax; i++) {
      const cx = off + i * step;
      const x0 = cx - s.cutMm / 2;
      const x1 = cx + s.cutMm / 2;
      if (s.pattern === 'wave') {
        // One wave for every row, so neighbouring slits run parallel and the web stays even.
        const n = Math.max(2, Math.ceil(((x1 - x0) / lambda) * 32));
        const line = Array.from({ length: n + 1 }, (_, k) => {
          const x = x0 + ((x1 - x0) * k) / n;
          return { x, y: y + amp * Math.sin((2 * Math.PI * x) / lambda) };
        });
        out.push([line]);
      } else if (s.pattern === 'cross') {
        out.push([
          [{ x: x0, y }, { x: x1, y }],
          [{ x: cx, y: y - reach }, { x: cx, y: y + reach }],
        ]);
      } else {
        out.push([[{ x: x0, y }, { x: x1, y }]]);
      }
    }
  }
  return out;
}

/** Lattice edges as slits, each stopped `bridge / 2` short of both junctions. */
function edgeSlits(edges: [Point2D, Point2D][], bridge: number): HingeShape[] {
  const out: HingeShape[] = [];
  for (const [a, b] of edges) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const keep = len - bridge;
    if (keep < 0.3) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const h = bridge / 2;
    out.push([[{ x: a.x + ux * h, y: a.y + uy * h }, { x: b.x - ux * h, y: b.y - uy * h }]]);
  }
  return out;
}

/** Lattice patterns' junction-to-junction edges, centred on the origin, covering ±hw × ±hh. */
function latticeEdges(s: HingePatternSettings, hw: number, hh: number): [Point2D, Point2D][] {
  const p = s.pitchMm;
  const edges: [Point2D, Point2D][] = [];
  if (s.pattern === 'triangle') {
    // Three families of lines, p apart, through the vertices of equilateral triangles of side a.
    const a = (2 * p) / Math.sqrt(3);
    const J = Math.ceil(hh / p) + 1;
    for (let j = -J; j <= J; j++) {
      const I = Math.ceil(hw / a) + 2;
      for (let i = -I; i <= I; i++) {
        const v = { x: a * (i + j / 2), y: p * j };
        edges.push([v, { x: v.x + a, y: v.y }]);
        edges.push([v, { x: v.x + a / 2, y: v.y + p }]);
        edges.push([v, { x: v.x - a / 2, y: v.y + p }]);
      }
    }
  } else if (s.pattern === 'diamond') {
    // Two families leaning ±DIAMOND_ANGLE, p apart; they cross every L along each line.
    const L = p / Math.sin(2 * DIAMOND_ANGLE);
    const dx = L * Math.cos(DIAMOND_ANGLE);
    const dy = L * Math.sin(DIAMOND_ANGLE);
    const N = Math.ceil(hh / dy) + 1;
    const M = Math.ceil(hw / dx) + 1;
    for (let n = -N; n <= N; n++) {
      for (let m = -M; m <= M; m++) {
        if ((((m + n) % 2) + 2) % 2 !== 0) continue;
        const v = { x: m * dx, y: n * dy };
        edges.push([v, { x: v.x + dx, y: v.y + dy }]);
        edges.push([v, { x: v.x + dx, y: v.y - dy }]);
      }
    }
  } else if (s.pattern === 'honeycomb') {
    // Hexagons p across their flats, flats along the bend line; every edge once.
    const side = p / Math.sqrt(3);
    const seen = new Set<string>();
    const I = Math.ceil(hw / (1.5 * side)) + 1;
    const J = Math.ceil(hh / p) + 1;
    for (let i = -I; i <= I; i++) {
      for (let j = -J; j <= J; j++) {
        const c = { x: 1.5 * side * i, y: p * j + (((i % 2) + 2) % 2 === 1 ? p / 2 : 0) };
        const corners = Array.from({ length: 6 }, (_, k) => ({
          x: c.x + side * Math.cos((k * Math.PI) / 3),
          y: c.y + side * Math.sin((k * Math.PI) / 3),
        }));
        for (let k = 0; k < 6; k++) {
          const a = corners[k];
          const b = corners[(k + 1) % 6];
          const key = `${Math.round((a.x + b.x) * 500)},${Math.round((a.y + b.y) * 500)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push([a, b]);
        }
      }
    }
  }
  return edges;
}

/** Every shape of the pattern, unclipped, centred on the origin and covering at least ±hw × ±hh. */
function rawShapes(settings: HingePatternSettings, hw: number, hh: number): HingeShape[] {
  const s = clampSettings(settings);
  if (s.pattern === 'straight' || s.pattern === 'wave' || s.pattern === 'cross') return rowShapes(s, hw, hh);
  return edgeSlits(latticeEdges(s, hw, hh), s.bridgeMm);
}

type Side = 'x' | 'y' | null;

interface Piece {
  pts: Point2D[];
  /** The region side each end was clipped against: x for the left or right edge, y for top or bottom. */
  start: Side;
  end: Side;
}

/** Liang–Barsky: the part of segment a→b inside the rectangle, with the side it entered and left by. */
function clipSegment(a: Point2D, b: Point2D, x0: number, y0: number, x1: number, y1: number) {
  let t0 = 0;
  let t1 = 1;
  let s0: Side = null;
  let s1: Side = null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tests: [number, number, Side][] = [
    [-dx, a.x - x0, 'x'],
    [dx, x1 - a.x, 'x'],
    [-dy, a.y - y0, 'y'],
    [dy, y1 - a.y, 'y'],
  ];
  for (const [p, q, side] of tests) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) [t0, s0] = [t, side];
    } else {
      if (t < t0) return null;
      if (t < t1) [t1, s1] = [t, side];
    }
  }
  if (t1 - t0 < 1e-12) return null;
  return {
    a: { x: a.x + dx * t0, y: a.y + dy * t0 },
    b: { x: a.x + dx * t1, y: a.y + dy * t1 },
    s0,
    s1,
  };
}

function clipPolyline(line: Point2D[], x0: number, y0: number, x1: number, y1: number): Piece[] {
  const pieces: Piece[] = [];
  let cur: Piece | null = null;
  for (let i = 0; i + 1 < line.length; i++) {
    const c = clipSegment(line[i], line[i + 1], x0, y0, x1, y1);
    if (!c) {
      if (cur) pieces.push(cur);
      cur = null;
      continue;
    }
    if (!cur || c.s0) {
      if (cur) pieces.push(cur);
      cur = { pts: [c.a], start: c.s0, end: null };
    }
    cur.pts.push(c.b);
    if (c.s1) {
      cur.end = c.s1;
      pieces.push(cur);
      cur = null;
    }
  }
  if (cur) pieces.push(cur);
  return pieces;
}

const polylineLength = (pts: Point2D[]) =>
  pts.reduce((l, p, i) => (i === 0 ? 0 : l + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)), 0);

/** Clipped pieces shorter than this are dropped: too short to flex, and they char. */
const MIN_PIECE_MM = 0.8;
/** Cuts lying this close along the region's top or bottom border are dropped. */
const BORDER_MM = 0.5;

/**
 * The pattern's cuts in `region`, centred on it. The left and right edges are free edges: cuts may
 * run off them, which frees the hinge's sides, but a piece that would run from one to the other
 * would cut the sheet in two and is dropped.
 */
export function hingeCuts(settings: HingePatternSettings, region: HingeRegion): HingeShape[] {
  const { x, y, width, height } = region;
  if (width <= 0 || height <= 0) return [];
  const cx = x + width / 2;
  const cy = y + height / 2;
  const out: HingeShape[] = [];
  for (const shape of rawShapes(settings, width / 2, height / 2)) {
    const kept: Point2D[][] = [];
    for (const line of shape) {
      const moved = line.map((p) => ({ x: p.x + cx, y: p.y + cy }));
      for (const piece of clipPolyline(moved, x, y, x + width, y + height)) {
        if (piece.start === 'x' && piece.end === 'x') continue;
        if (polylineLength(piece.pts) < MIN_PIECE_MM) continue;
        // A cut along the top or bottom border would trace the edge of the solid sheet beyond it.
        if (piece.pts.every((p) => p.y - y < BORDER_MM) || piece.pts.every((p) => y + height - p.y < BORDER_MM)) continue;
        kept.push(piece.pts);
      }
    }
    if (kept.length > 0) out.push(kept);
  }
  return out;
}

const f3 = (n: number) => Number(n.toFixed(3)).toString();

/** A shape as SVG path data, one subpath per polyline. */
export const hingeShapePath = (shape: HingeShape): string =>
  shape.map((line) => line.map((p, i) => `${i === 0 ? 'M' : 'L'} ${f3(p.x)} ${f3(p.y)}`).join(' ')).join(' ');

function segmentDistance(a: Point2D, b: Point2D, c: Point2D, d: Point2D): number {
  const cross = (o: Point2D, p: Point2D, q: Point2D) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  const toSeg = (p: Point2D, s: Point2D, e: Point2D) => {
    const vx = e.x - s.x;
    const vy = e.y - s.y;
    const l2 = vx * vx + vy * vy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * vx + (p.y - s.y) * vy) / l2));
    return Math.hypot(p.x - s.x - vx * t, p.y - s.y - vy * t);
  };
  return Math.min(toSeg(a, c, d), toSeg(b, c, d), toSeg(c, a, b), toSeg(d, a, b));
}

/** The closest any two shapes come, centre line to centre line. */
export function closestShapesMm(shapes: HingeShape[]): number {
  interface Seg {
    a: Point2D;
    b: Point2D;
    shape: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }
  const segs: Seg[] = [];
  shapes.forEach((shape, k) => {
    for (const line of shape) {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i];
        const b = line[i + 1];
        segs.push({
          a,
          b,
          shape: k,
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxY: Math.max(a.y, b.y),
        });
      }
    }
  });
  segs.sort((p, q) => p.minX - q.minX);
  let best = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    for (let j = i + 1; j < segs.length; j++) {
      const t = segs[j];
      if (t.minX - s.maxX >= best) break;
      if (t.shape === s.shape) continue;
      if (t.minY - s.maxY >= best || s.minY - t.maxY >= best) continue;
      best = Math.min(best, segmentDistance(s.a, s.b, t.a, t.b));
    }
  }
  return best;
}

const webCache = new Map<string, number>();

/**
 * The narrowest wood left between two cuts, after the beam burns away `kerfMm`. Measured on a
 * patch of the pattern a few repeats across, which holds for any region the pattern fills.
 */
export function hingeMinWebMm(settings: HingePatternSettings, kerfMm: number): number {
  const s = clampSettings(settings);
  const key = `${s.pattern}|${s.pitchMm}|${s.cutMm}|${s.bridgeMm}`;
  let d = webCache.get(key);
  if (d === undefined) {
    const across = Math.max(3 * (s.cutMm + s.bridgeMm), 6 * s.pitchMm);
    d = closestShapesMm(rawShapes(s, across, 4 * s.pitchMm));
    webCache.set(key, d);
  }
  return d - kerfMm;
}

/** Below this the web chars through or snaps when bent. */
export const MIN_SAFE_WEB_MM = 1;
