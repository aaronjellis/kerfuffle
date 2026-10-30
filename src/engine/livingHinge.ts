/**
 * Living-hinge kerf patterns: the cuts that let a rigid sheet bend. A region is a rectangle, origin
 * top-left, y down; the sheet bends about lines running along x, so the cuts run along x in rows.
 *
 * Every pattern is rows of slits, each row's slits broken by uncut bridges and every other row
 * moved half a step, so each strip of wood between two rows is held only where the rows' bridges
 * alternate. Bending twists those strips: the longer and thinner the free stretch of strip between
 * a bridge above and one below (a link), the further it twists before the wood gives. The rows'
 * shapes (straight, wavy, zigzag, mirrored) only change how wide the strip is along its length.
 * `hingeMinWebMm` measures the narrowest wood; `hingeBendRadiusMm` estimates the tightest bend.
 */
import type { Point2D } from './types';

export const HINGE_PATTERN_IDS = [
  'straight',
  'brick',
  'split',
  'serpentine',
  'wave',
  'zigzag',
  'chevron',
  'diamond',
  'triangle',
  'honeycomb',
] as const;
export type HingePatternId = (typeof HINGE_PATTERN_IDS)[number];

export interface HingePatternSettings {
  pattern: HingePatternId;
  /** Spacing of the rows of slits. */
  pitchMm: number;
  /** Slit length. */
  cutMm: number;
  /** Uncut wood between slits in a row. */
  bridgeMm: number;
}

export interface HingePatternInfo {
  id: HingePatternId;
  name: string;
  description: string;
  /** Whether the slit length applies; serpentine rows run the hinge's full width. */
  usesCut: boolean;
  defaults: Omit<HingePatternSettings, 'pattern'>;
}

/** The row spacings the UI offers, in millimetres. */
export const HINGE_PITCH_RANGE_MM: [number, number] = [1, 6];

export const HINGE_PATTERNS: HingePatternInfo[] = [
  {
    id: 'straight',
    name: 'Straight',
    description: 'Staggered straight slits: the most bend for the least cutting.',
    usesCut: true,
    defaults: { pitchMm: 1.5, cutMm: 30, bridgeMm: 3 },
  },
  {
    id: 'brick',
    name: 'Brick',
    description:
      'Straight slits staggered in thirds, like brickwork. Stiffer than straight at the same sizes, since bridges a third of a step apart make some links short: it needs long slits.',
    usesCut: true,
    defaults: { pitchMm: 1.5, cutMm: 44, bridgeMm: 3 },
  },
  {
    id: 'split',
    name: 'Split bridge',
    description:
      'Straight slits with a short cross-cut through every bridge, so each bridge bends as well as the strips twisting. Softer than straight, but weaker; the estimate counts only the strips.',
    usesCut: true,
    defaults: { pitchMm: 1.8, cutMm: 36, bridgeMm: 3 },
  },
  {
    id: 'serpentine',
    name: 'Serpentine',
    description:
      'Each row runs in from alternate side edges, so the wood is one long strip zigzagging across. The softest pattern and the weakest; it twists too.',
    usesCut: false,
    defaults: { pitchMm: 2, cutMm: 30, bridgeMm: 4 },
  },
  {
    id: 'wave',
    name: 'Wave',
    description: 'Wavy slits, every row in step. Bends nearly as far as straight, with softer corners.',
    usesCut: true,
    defaults: { pitchMm: 1.6, cutMm: 30, bridgeMm: 3 },
  },
  {
    id: 'zigzag',
    name: 'Zigzag',
    description: 'Zigzag slits, every row in step, so the wood between them runs in chevrons.',
    usesCut: true,
    defaults: { pitchMm: 1.6, cutMm: 30, bridgeMm: 3 },
  },
  {
    id: 'chevron',
    name: 'Chevron',
    description: 'Each slit one broad V, the rows nested inside one another like stacked chevrons.',
    usesCut: true,
    defaults: { pitchMm: 1.6, cutMm: 30, bridgeMm: 3 },
  },
  {
    id: 'diamond',
    name: 'Diamond',
    description:
      'Zigzag rows mirrored in pairs, so the wood between them pinches into chains of diamonds. The pinches stiffen it: it needs long slits.',
    usesCut: true,
    defaults: { pitchMm: 1.6, cutMm: 36, bridgeMm: 2.5 },
  },
  {
    id: 'triangle',
    name: 'Triangle',
    description: 'Straight rows and zigzag rows in turn, so the wood between them runs in triangles.',
    usesCut: true,
    defaults: { pitchMm: 1.5, cutMm: 36, bridgeMm: 2.5 },
  },
  {
    id: 'honeycomb',
    name: 'Honeycomb',
    description:
      'Stepped rows mirrored in pairs, so the wood between them runs in chains of hexagons. Stiffer than straight: it needs long slits.',
    usesCut: true,
    defaults: { pitchMm: 1.6, cutMm: 36, bridgeMm: 2.5 },
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
    pitchMm: Math.max(0.5, Number.isFinite(s.pitchMm) ? s.pitchMm : info.defaults.pitchMm),
    cutMm: Math.max(MIN_HINGE_CUT_MM, Number.isFinite(s.cutMm) ? s.cutMm : info.defaults.cutMm),
    bridgeMm: Math.max(MIN_HINGE_BRIDGE_MM, Number.isFinite(s.bridgeMm) ? s.bridgeMm : info.defaults.bridgeMm),
  };
};

/** A row's shape: how far the slit sits off its row line at x, and its slope there. */
interface Profile {
  y: (x: number) => number;
  slope: (x: number) => number;
  /** Where a polyline must have a corner; empty for smooth or straight rows. */
  corners: number;
  /** One repeat along x; 0 for a straight row. */
  period: number;
}

const FLAT: Profile = { y: () => 0, slope: () => 0, corners: 0, period: 0 };

/** A shape repeating every `period`, scaled to `amp` either side of the row line. */
function shaped(kind: 'sine' | 'zigzag' | 'stepped', amp: number, period: number, sign: 1 | -1, phase = 0): Profile {
  const u = (x: number) => ((((x / period + phase) % 1) + 1) % 1);
  if (kind === 'sine') {
    const k = (2 * Math.PI) / period;
    return { y: (x) => sign * amp * Math.sin(k * x), slope: (x) => sign * amp * k * Math.cos(k * x), corners: 0, period };
  }
  if (kind === 'zigzag') {
    // Up a quarter, down a half, up a quarter: corners every quarter period.
    const tri = (v: number) => (v < 0.25 ? 4 * v : v < 0.75 ? 2 - 4 * v : 4 * v - 4);
    const dtri = (v: number) => (v < 0.25 || v >= 0.75 ? 4 : -4);
    return { y: (x) => sign * amp * tri(u(x)), slope: (x) => (sign * amp * dtri(u(x))) / period, corners: 4, period };
  }
  // Stepped: a flat top a third long, a ramp a sixth, a flat bottom a third, a ramp a sixth; half
  // of a hexagon either side of the row line.
  const step = (v: number) => (v < 1 / 3 ? 1 : v < 0.5 ? 1 - 12 * (v - 1 / 3) : v < 5 / 6 ? -1 : -1 + 12 * (v - 5 / 6));
  const dstep = (v: number) => (v < 1 / 3 || (v >= 0.5 && v < 5 / 6) ? 0 : v < 0.5 ? -12 : 12);
  return { y: (x) => sign * amp * step(u(x)), slope: (x) => (sign * amp * dstep(u(x))) / period, corners: 6, period };
}

/** Each shaped pattern's height either side of the row line, and repeat, in row spacings. */
const ROW_SHAPES: Record<'wave' | 'zigzag' | 'diamond' | 'triangle' | 'honeycomb', { amp: number; length: number }> = {
  wave: { amp: 0.35, length: 4 },
  zigzag: { amp: 0.35, length: 4 },
  // Mirrored rows pinch the strip between them; deep pinches stiffen it fast, so these stay shallow.
  diamond: { amp: 0.14, length: 5 },
  triangle: { amp: 0.22, length: 4 },
  honeycomb: { amp: 0.14, length: 6 },
};

/**
 * Row r's shape. Heights scale with the row spacing so the web stays in proportion; each repeat is
 * stretched to fit a whole number of times into half a slit step, so every bridge lands at the same
 * point of the shape in every row and the hinge flexes the same along its width.
 */
function rowProfile(s: HingePatternSettings, r: number): Profile {
  const p = s.pitchMm;
  // A chevron's V spans one slit and its bridge, its point at the slit's middle, on one grid for
  // every row: rows staggered half a step still nest, every V parallel to its neighbours.
  if (s.pattern === 'chevron') return shaped('zigzag', CHEVRON_RISE * p, s.cutMm + s.bridgeMm, 1, 0.25);
  if (!(s.pattern in ROW_SHAPES)) return FLAT;
  const pattern = s.pattern as keyof typeof ROW_SHAPES;
  const odd = ((r % 2) + 2) % 2 === 1;
  const { amp, length } = ROW_SHAPES[pattern];
  const half = (s.cutMm + s.bridgeMm) / 2;
  const period = half / Math.max(1, Math.round(half / (length * p)));
  switch (pattern) {
    case 'wave':
      return shaped('sine', amp * p, period, 1);
    case 'zigzag':
      return shaped('zigzag', amp * p, period, 1);
    case 'diamond':
      return shaped('zigzag', amp * p, period, odd ? -1 : 1);
    case 'triangle':
      return odd ? shaped('zigzag', amp * p, period, 1) : FLAT;
    case 'honeycomb':
      return shaped('stepped', amp * p, period, odd ? -1 : 1);
  }
}

/** A chevron's rise either side of the row line, in row spacings. */
const CHEVRON_RISE = 2;
/** A split bridge's cross-cut reaches this share of the row spacing either side of the row. */
const SPLIT_REACH = 0.35;

/** Rows before the stagger repeats: brick staggers in thirds, the rest in halves. */
const rowRepeat = (s: HingePatternSettings) => (s.pattern === 'brick' ? 3 : 2);

/** How far any row's slits reach either side of their row line. */
const rowReach = (s: HingePatternSettings) =>
  Math.max(...[0, 1].map((r) => {
    const f = rowProfile(s, r);
    return f.period === 0 ? 0 : Math.max(...Array.from({ length: 49 }, (_, k) => Math.abs(f.y((k / 48) * f.period))));
  }));

/** Row r's stagger along x: half a slit step every other row, or a third in turn for brick. */
const rowOffset = (s: HingePatternSettings, r: number) => {
  const n = rowRepeat(s);
  return ((((r % n) + n) % n) * (s.cutMm + s.bridgeMm)) / n;
};

/**
 * Serpentine as straight slits sized to the hinge's width: one bridge per row, at alternate side
 * edges, so each slit runs from one side edge to a bridge's width short of the other. Returned with
 * the stagger's start that puts row 0's bridge against the right edge.
 */
function serpentineAsStraight(s: HingePatternSettings, widthMm: number): { s: HingePatternSettings; start: number } {
  const w = Math.max(widthMm, 3 * s.bridgeMm);
  const step = 2 * (w - s.bridgeMm);
  return { s: { ...s, pattern: 'straight', cutMm: step - s.bridgeMm }, start: -(w - s.bridgeMm) / 2 };
}

/** A slit from x0 to x1 along a row's shape, with a point at every corner and fine steps on curves. */
function slitLine(f: Profile, x0: number, x1: number, y: number): Point2D[] {
  if (f.period === 0) return [{ x: x0, y }, { x: x1, y }];
  // Sample on a grid fixed to x = 0, so every row's corners land on the same x and every corner is hit.
  const step = f.period / (f.corners > 0 ? f.corners * 2 : 32);
  const xs = [x0];
  for (let k = Math.floor(x0 / step) + 1; k * step < x1; k++) xs.push(k * step);
  xs.push(x1);
  return xs.map((x) => ({ x, y: y + f.y(x) }));
}

/** Every slit of the pattern, unclipped, centred on the origin and covering at least ±hw × ±hh. */
function rawShapes(settings: HingePatternSettings, hw: number, hh: number): HingeShape[] {
  let s = clampSettings(settings);
  let start = 0;
  if (s.pattern === 'serpentine') ({ s, start } = serpentineAsStraight(s, 2 * hw));
  const split = s.pattern === 'split';
  const p = s.pitchMm;
  const step = s.cutMm + s.bridgeMm;
  const reach = rowReach(s);
  const rows = Math.max(1, Math.floor((2 * hh - 2 * reach) / p + 1e-9) + 1);
  const out: HingeShape[] = [];
  for (let r = 0; r < rows; r++) {
    const y = -((rows - 1) * p) / 2 + r * p;
    const f = rowProfile(s, r);
    const off = start + rowOffset(s, r);
    const iMin = Math.floor((-hw - step - off) / step);
    const iMax = Math.ceil((hw + step - off) / step);
    for (let i = iMin; i <= iMax; i++) {
      const cx = off + i * step;
      out.push([slitLine(f, cx - s.cutMm / 2, cx + s.cutMm / 2, y)]);
      // The cross-cut through the bridge after this slit, square to the row.
      if (split) {
        const bx = cx + step / 2;
        out.push([[{ x: bx, y: y - SPLIT_REACH * p }, { x: bx, y: y + SPLIT_REACH * p }]]);
      }
    }
  }
  return out;
}

/**
 * The shear strain wood takes in twisting before it cracks. Wood's own figure varies with species,
 * plies and moisture; 1% puts Boxes.py's long-standing defaults (3 mm sheet, rows 1.5 mm apart,
 * 3 mm bridges, 12 mm and longer links) at about a 16 mm bend, which is how they're used. The
 * hinge test cards are how to check it for a given sheet.
 */
export const HINGE_SHEAR_STRAIN = 0.01;

/**
 * Saint-Venant torsion of a solid rectangle, long side a over short side c (Roark): twist stiffness
 * K = β a c³ and stress capacity Q = α a c², by aspect ratio.
 */
const TORSION_TABLE: [number, number, number][] = [
  [1, 0.208, 0.141],
  [1.2, 0.219, 0.166],
  [1.5, 0.231, 0.196],
  [2, 0.246, 0.229],
  [2.5, 0.258, 0.249],
  [3, 0.267, 0.263],
  [4, 0.282, 0.281],
  [5, 0.291, 0.291],
  [10, 0.312, 0.312],
];

function torsionSection(width: number, thickness: number): { K: number; Q: number } {
  const a = Math.max(width, thickness);
  const c = Math.min(width, thickness);
  const ratio = a / c;
  let alpha: number;
  let beta: number;
  if (ratio >= 10) {
    // Thin strips tend to a third, less an end correction.
    alpha = beta = (1 - 0.63 / ratio) / 3;
  } else {
    const i = TORSION_TABLE.findIndex(([r]) => r >= ratio);
    const [r1, a1, b1] = TORSION_TABLE[Math.max(1, i)];
    const [r0, a0, b0] = TORSION_TABLE[Math.max(0, i - 1)];
    const t = r1 === r0 ? 0 : (ratio - r0) / (r1 - r0);
    alpha = a0 + (a1 - a0) * t;
    beta = b0 + (b1 - b0) * t;
  }
  return { K: beta * a * c ** 3, Q: alpha * a * c ** 2 };
}

const bendCache = new Map<string, number>();

/** The hinge width a serpentine's estimate assumes when none is given. */
export const DEFAULT_HINGE_WIDTH_MM = 100;

/**
 * The tightest radius the hinge bends to before its links crack, in millimetres, by the twisting
 * links model (DefProc's lattice hinge analysis): bending the sheet about x twists every strip of
 * wood between two rows by the same angle across its length, each link between alternating bridges
 * taking a share by its stiffness. A strip may twist until its most strained link reaches
 * `HINGE_SHEAR_STRAIN`; the strips' twists add up over the rows to the curve. Infinity when the
 * cuts leave a strip no wood at all.
 *
 * It ignores the bridges' own give and the kerf gaps closing, both small next to the links' twist,
 * so read it as a guide for comparing settings; the test cards say what a given sheet really does.
 * A split bridge's cross-cuts only add bridge give, so it estimates like straight slits. A
 * serpentine's links span the hinge, so it needs the hinge's `widthMm`.
 */
export function hingeBendRadiusMm(
  settings: HingePatternSettings,
  thicknessMm: number,
  kerfMm: number,
  widthMm = DEFAULT_HINGE_WIDTH_MM,
): number {
  const s = clampSettings(settings);
  // A serpentine's links run the hinge's whole width, so it bends like straight slits that long.
  if (s.pattern === 'serpentine') return hingeBendRadiusMm(serpentineAsStraight(s, widthMm).s, thicknessMm, kerfMm);
  const key = `${s.pattern}|${s.pitchMm}|${s.cutMm}|${s.bridgeMm}|${thicknessMm}|${kerfMm}`;
  const hit = bendCache.get(key);
  if (hit !== undefined) return hit;
  const p = s.pitchMm;
  const step = s.cutMm + s.bridgeMm;
  const ds = Math.min(0.05, step / 400);
  // One strip per row of the stagger's repeat makes a full repeat of row shapes and stagger; average
  // over several slit steps so links whose shape repeat falls differently along x all count.
  const span = 6 * step;
  const strips = Array.from({ length: rowRepeat(s) }, (_, r) => {
    const above = rowProfile(s, r);
    const below = rowProfile(s, r + 1);
    const offAbove = rowOffset(s, r);
    const offBelow = rowOffset(s, r + 1);
    // Bridges are centred half a step past each slit centre; links run between neighbouring
    // bridges of the two rows, which alternate along x.
    const bridges = [
      ...Array.from({ length: 8 }, (_, i) => ({ x: offAbove + (i + 0.5) * step })),
      ...Array.from({ length: 8 }, (_, i) => ({ x: offBelow + (i + 0.5) * step })),
    ]
      .map((b) => b.x)
      .sort((a, b) => a - b)
      .filter((x) => x <= span + step);
    let stiffness = 0;
    let capacity = Infinity;
    for (let i = 0; i + 1 < bridges.length; i++) {
      const x0 = bridges[i] + s.bridgeMm / 2;
      const x1 = bridges[i + 1] - s.bridgeMm / 2;
      if (x1 - x0 < 1e-6) continue;
      let compliance = 0;
      let qMin = Infinity;
      for (let x = x0; x < x1; x += ds) {
        const xm = Math.min(x + ds / 2, x1);
        const slope = (above.slope(xm) + below.slope(xm)) / 2;
        const stretch = Math.sqrt(1 + slope * slope);
        const width = (p + below.y(xm) - above.y(xm)) / stretch - kerfMm;
        if (width <= 0) return null;
        const { K, Q } = torsionSection(width, thicknessMm);
        compliance += (Math.min(ds, x1 - x) * stretch) / K;
        qMin = Math.min(qMin, Q);
      }
      // Twisted by θ, this link carries torque θG / compliance and strains θ / (compliance · Q):
      // the strip can twist until its weakest link reaches the limit.
      stiffness += 1 / compliance;
      capacity = Math.min(capacity, HINGE_SHEAR_STRAIN * compliance * qMin);
    }
    return { stiffness, capacity };
  });
  if (strips.some((st) => st === null)) {
    bendCache.set(key, Infinity);
    return Infinity;
  }
  const solid = strips as { stiffness: number; capacity: number }[];
  // One bending moment runs through every strip: the strip that reaches its limit first stops the
  // bend, and each strip twists in proportion to its own flexibility.
  const moment = Math.min(...solid.map((st) => st.capacity * st.stiffness));
  const twist = solid.reduce((sum, st) => sum + moment / st.stiffness, 0);
  const radius = (solid.length * p) / twist;
  bendCache.set(key, radius);
  return radius;
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
