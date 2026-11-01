/**
 * The wine carrier: a tall tab-and-slot box for one bottle (layout in `wineBottles`).
 *
 * - Front and back, alike: the body, the full width; above it, narrower to fit between the side
 *   pieces, two living-hinge bends with a straight slope between, then the handle half: rounded
 *   top, a pill-shaped cut-out, and a hooked tab on each side edge.
 * - Side pieces: the body with tabs up both edges into the front and back's slots; above it, the
 *   outline follows the closed flaps' outside face in to meet the handle, then rises as the ear,
 *   which holds the hooked tabs in its slot and flexes out on an oval patch of hinge slits.
 * - Bottom: tabbed into all four walls, raised to clear the feet.
 *
 * The lock: the stacked hooked tabs pass through the ear's slot with the handle pressed down;
 * carrying lifts the handle, which lifts each hook above the slot and behind solid ear, so the
 * weight keeps it shut. Press the handle down and flex the ears out to open.
 *
 * Pieces are built in a y-up frame (y = height from the foot), then turned into the sheet's y-down
 * frame. Touchable edges are rounded; the joints' hidden faces (body tabs, slots) stay square.
 */
import { livingHingeSettings, pointsToSvgPath } from './fingerJointEngine';
import { bounds, union, type Poly } from './geom';
import { hingeCuts, hingeShapePath } from './livingHinge';
import { buildShape, DEFAULT_SHAPE } from './shapes';
import { slotsFor, tabbedEdge, tabCentres, tabCountFor, TAB_MM, type TabRun } from './tabSlot';
import type { BoxPanel2D, BoxParameters, DielinePath, Panel3DTransform, Point2D } from './types';
import { carrierFloorMm, EAR_PATCH, FOOT_ARCH_MM, HOOK, NOTCH_FROM_MM, shoulderLengthMm, taperHalfGapMm, wineCarrierLayout } from './wineBottles';

export { HOOK };

/** Rounding on every touchable corner (at most 30% of the ply, so the tab's notch survives it), and the curve tolerance. */
const roundFor = (T: number) => Math.min(1.5, 0.3 * T);
const TOL_MM = 0.05;
const HANDLE_CORNER_MM = 10;
/** The ear's solid wood either side of the stacked tabs, and how far below the handle's top it stops. */
const EAR_MARGIN_MM = 8;
const EAR_DROP_MM = 12;


interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A piece in the y-up frame: its outline, holes (cut), hinge slits (open cuts), and its pattern-safe area. */
export interface CarrierPiece {
  id: string;
  name: string;
  faceLabel: string;
  /** The outline's size on the sheet. */
  widthMm: number;
  heightMm: number;
  outlineUp: Point2D[];
  holesUp: Point2D[][];
  cutsUp: Point2D[][];
  safeUp: Rect;
}

export interface CarrierParts {
  front: CarrierPiece;
  back: CarrierPiece;
  left: CarrierPiece;
  right: CarrierPiece;
  bottom: CarrierPiece;
  meta: {
    /** The front's two hinge zones, as [from, to] up the front. */
    bendZones: [number, number][];
    /** Heights of the side pieces' tabs and of the front's slots for them. */
    sideTabCentres: number[];
    frontSlotCentres: number[];
    /** The ear, its slot and its hinge slits, across the side (0 at the middle) and up from the foot. */
    ear: Point2D[];
    earSlot: Point2D[];
    earPatch: Point2D[][];
    /** The handle tab beyond the ear, carried: its bottom and the hook's top. */
    tabLo: number;
    tabHi: number;
    /** How many tabs the bottom has along each edge. */
    bottomTabCount: number;
    /** The handle half's two side edges across the front, and the notch's top up the handle. */
    handleLeftMm: number;
    handleRightMm: number;
    /** The ears' inside faces across the front: where the flaps meet them at the body's top. */
    earLeftMm: number;
    earRightMm: number;
    notchHiMm: number;
  };
}

const largest = (poly: Poly): Point2D[] =>
  poly.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a), poly[0] ?? []);
const ringArea = (r: Point2D[]) => r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y, 0) / 2;
const move = (r: Point2D[], dx: number, dy: number) => r.map((p) => ({ x: p.x + dx, y: p.y + dy }));
/** `shapes` builds y-down and centred; every shape used here is symmetric top to bottom, so it reads the same y-up. */
const centredShape = (kind: 'pill' | 'rounded', w: number, h: number, corner = 0) =>
  largest(buildShape({ ...DEFAULT_SHAPE, kind, widthMm: w, heightMm: h, cornerMm: corner }, TOL_MM));

/** A piece with its outline's size filled in. */
const sized = (piece: Omit<CarrierPiece, 'widthMm' | 'heightMm'>): CarrierPiece => {
  const b = bounds([piece.outlineUp])!;
  return { ...piece, widthMm: b.w, heightMm: b.h };
};

/**
 * A ring with every corner `where` picks filleted: swapped for an arc of `radiusMm` tangent to both
 * edges, smaller where an edge is too short to hold it (an arc never takes more than half an edge).
 * Works for convex and concave corners alike; straight runs are left alone.
 */
export function roundCorners(ring: Point2D[], radiusMm: number, where: (p: Point2D) => boolean = () => true): Point2D[] {
  const out: Point2D[] = [];
  const n = ring.length;
  ring.forEach((p, i) => {
    const a = ring[(i - 1 + n) % n];
    const b = ring[(i + 1) % n];
    const la = Math.hypot(a.x - p.x, a.y - p.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    if (!where(p) || la < 1e-9 || lb < 1e-9) return void out.push(p);
    const ua = { x: (a.x - p.x) / la, y: (a.y - p.y) / la };
    const ub = { x: (b.x - p.x) / lb, y: (b.y - p.y) / lb };
    // The angle between the two edges at p; a straight run (π) needs nothing.
    const phi = Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.y * ub.y)));
    if (phi > Math.PI - 1e-3 || phi < 1e-3) return void out.push(p);
    const t = Math.min(radiusMm / Math.tan(phi / 2), la / 2, lb / 2);
    const r = t * Math.tan(phi / 2);
    const bis = { x: ua.x + ub.x, y: ua.y + ub.y };
    const bl = Math.hypot(bis.x, bis.y);
    const d = r / Math.sin(phi / 2);
    const c = { x: p.x + (bis.x / bl) * d, y: p.y + (bis.y / bl) * d };
    const t1 = { x: p.x + ua.x * t, y: p.y + ua.y * t };
    const t2 = { x: p.x + ub.x * t, y: p.y + ub.y * t };
    const a1 = Math.atan2(t1.y - c.y, t1.x - c.x);
    let a2 = Math.atan2(t2.y - c.y, t2.x - c.x);
    // The short way round, which is the side of the corner the arc sits in.
    while (a2 - a1 > Math.PI) a2 -= 2 * Math.PI;
    while (a1 - a2 > Math.PI) a2 += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(a2 - a1) / (Math.PI / 18)));
    for (let k = 0; k <= steps; k++) {
      const ang = a1 + ((a2 - a1) * k) / steps;
      out.push({ x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) });
    }
  });
  return out;
}

/** A straight cut clipped to the ellipse centred (cx, cy) with radii (rx, ry); null when it misses. */
function clipToEllipse(a: Point2D, b: Point2D, cx: number, cy: number, rx: number, ry: number): [Point2D, Point2D] | null {
  const ax = (a.x - cx) / rx;
  const ay = (a.y - cy) / ry;
  const dx = (b.x - a.x) / rx;
  const dy = (b.y - a.y) / ry;
  const qa = dx * dx + dy * dy;
  const qb = 2 * (ax * dx + ay * dy);
  const qc = ax * ax + ay * ay - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (qa === 0 || disc <= 0) return null;
  const t0 = Math.max(0, (-qb - Math.sqrt(disc)) / (2 * qa));
  const t1 = Math.min(1, (-qb + Math.sqrt(disc)) / (2 * qa));
  if (t1 - t0 < 1e-6) return null;
  const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  return [at(t0), at(t1)];
}

/** The carrier's pieces, in the y-up frame, with what the tests and 3D need to know about them. */
export function wineCarrierPieces(params: BoxParameters): CarrierParts {
  const l = wineCarrierLayout(params);
  const T = params.materialThicknessMm;
  const kerf = params.kerfMm;
  const S = l.innerSideMm;
  // The front and back overhang the sides by a ply, so the side tabs' slots sit inside solid wood.
  const m = T;
  const W = S + 2 * T + 2 * m;
  const L = m + T; // the handle half's left edge, between the ears
  const R = m + T + S; // and its right edge
  const Hb = l.bodyHeightMm;
  const Hs = l.shoulderHeightMm;
  const lowArc = l.bendRadiusMm * l.bendAngleRad;
  const topArc = l.topBendRadiusMm * l.bendAngleRad;
  const handleFrom = Hb + shoulderLengthMm(l);
  const Hf = handleFrom + l.handleHeightMm;
  // The bottom's underside: raised clear of the feet.
  const floor = carrierFloorMm(params);
  const settings = livingHingeSettings(params);

  const sideRun: TabRun = { fromMm: floor + T + 4, toMm: Hb - 4, count: tabCountFor(Hb - floor - T - 8), tabMm: TAB_MM };
  const bottomRun: TabRun = { fromMm: 6, toMm: S - 6, count: tabCountFor(S - 12), tabMm: TAB_MM };
  const slotLine = floor + T / 2;
  const notch = { lo: NOTCH_FROM_MM, hi: NOTCH_FROM_MM + HOOK.notchMm, top: NOTCH_FROM_MM + HOOK.notchMm + HOOK.hookMm };

  // ── Front (and back) ─────────────────────────────────────────────────────────
  const front: Point2D[] = [{ x: 0, y: 0 }];
  if (params.wineFeet) {
    const half = (0.6 * S) / 2;
    for (let i = 0; i <= 24; i++) {
      const t = Math.PI - (Math.PI * i) / 24;
      front.push({ x: W / 2 + half * Math.cos(t), y: FOOT_ARCH_MM * Math.sin(t) });
    }
  }
  const corner = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 0; i <= 12; i++) {
      const t = from + ((to - from) * i) / 12;
      front.push({ x: cx + HANDLE_CORNER_MM * Math.cos(t), y: cy + HANDLE_CORNER_MM * Math.sin(t) });
    }
  };
  const hy = (t: number) => handleFrom + t;
  // The front and back narrow a little up the shoulder, a few mm a side, so the handle sits in from
  // the ears and its tabs have room to find their slots.
  const taper = Math.min(6, Math.max(3, 0.05 * S));
  const hL = L + taper;
  const hR = R - taper;
  /** The flap's edges at height y: the ears' inside faces at the body's top, the handle's at the bend's top. */
  const flapEdges = (y: number): [number, number] => {
    const t = Math.min(1, Math.max(0, (y - Hb) / (handleFrom - Hb)));
    return [L + taper * t, R - taper * t];
  };
  front.push(
    { x: W, y: 0 },
    { x: W, y: Hb },
    { x: R, y: Hb },
    // The flap's edge slants in to the handle; the handle's edge and its hooked tab: the notch across
    // the gap and through the ear, the hook rising beyond it.
    { x: hR, y: handleFrom },
    { x: hR, y: hy(notch.lo) },
    { x: R + T + HOOK.reachMm, y: hy(notch.lo) },
    { x: R + T + HOOK.reachMm, y: hy(notch.top) },
    { x: R + T, y: hy(notch.top) },
    { x: R + T, y: hy(notch.hi) },
    { x: hR, y: hy(notch.hi) },
  );
  corner(hR - HANDLE_CORNER_MM, Hf - HANDLE_CORNER_MM, 0, Math.PI / 2);
  corner(hL + HANDLE_CORNER_MM, Hf - HANDLE_CORNER_MM, Math.PI / 2, Math.PI);
  front.push(
    { x: hL, y: hy(notch.hi) },
    { x: L - T, y: hy(notch.hi) },
    { x: L - T, y: hy(notch.top) },
    { x: L - T - HOOK.reachMm, y: hy(notch.top) },
    { x: L - T - HOOK.reachMm, y: hy(notch.lo) },
    { x: hL, y: hy(notch.lo) },
    { x: hL, y: handleFrom },
    { x: L, y: Hb },
    { x: 0, y: Hb },
  );
  // The notch's inside corners stay square: the hook seats its full depth on the ear.
  const square = [hL, L - T, hR, R + T].map((x) => ({ x, y: hy(notch.hi) }));
  const frontOutline = roundCorners(front, roundFor(T), (q) => !square.some((c) => Math.abs(c.x - q.x) < 1e-9 && Math.abs(c.y - q.y) < 1e-9));
  const handleHole = move(centredShape('pill', Math.max(24, Math.min(hR - hL - 24, 90)), 28), W / 2, Hf - 30);
  const frontSlots = [
    ...slotsFor(sideRun, m + T / 2, T, kerf, false),
    ...slotsFor(sideRun, W - m - T / 2, T, kerf, false),
    ...slotsFor({ ...bottomRun, fromMm: L + bottomRun.fromMm, toMm: L + bottomRun.toMm }, slotLine, T, kerf, true),
  ];
  // A hinge in each bend, the slope between solid; when the bends touch, one unbroken hinge up both
  // (two would each leave a solid row at their shared edge).
  const bendZones: [number, number][] =
    l.slopeLengthMm < 0.5
      ? [[Hb, handleFrom]]
      : [
          [Hb, Hb + lowArc],
          [handleFrom - topArc, handleFrom],
        ];
  // Each slit stops at the flap's edge at its own height, as the flap narrows.
  const frontCuts = bendZones
    .flatMap(([lo, hi]) => hingeCuts(settings, { x: L, y: lo, width: S, height: hi - lo }).flat())
    .map((line) =>
      line.map((q) => {
        const [a, b] = flapEdges(q.y);
        return { x: Math.min(b, Math.max(a, q.x)), y: q.y };
      }),
    )
    .filter((line) => line.length > 1 && Math.hypot(line[line.length - 1].x - line[0].x, line[line.length - 1].y - line[0].y) > 1);
  const frontSafe: Rect = { x: L + 3, y: floor + T + 6, width: S - 6, height: Hb - 6 - (floor + T + 6) };
  const frontPiece = (id: 'front' | 'back'): CarrierPiece => sized({
    id,
    name: id === 'front' ? 'Front and handle half' : 'Back and handle half',
    faceLabel: id.toUpperCase(),
    outlineUp: frontOutline,
    holesUp: [handleHole, ...frontSlots],
    cutsUp: frontCuts,
    safeUp: frontSafe,
  });

  // ── Side pieces ──────────────────────────────────────────────────────────────
  // The ear: at least half the box's depth, so the side frames the handle instead of pinching in.
  const e = Math.max(T + EAR_MARGIN_MM, S / 4);
  const earTop = Hb + Hs + l.handleHeightMm - EAR_DROP_MM;
  // Above the body the side follows the closed flaps' outside face, in to the handle's two plies.
  // The side sweeps in as the shoulder closes, eased so it turns gently everywhere: flat where it
  // leaves the body and where it meets the ear, not copying the short top bend's tight turn.
  const halfWidth = (h: number) => {
    const eased = e + ((S / 2 - e) * (1 + Math.cos((Math.PI * Math.min(Math.max(h, 0), Hs)) / Hs))) / 2;
    // Never inside the closed flaps' inside faces, which would leave a gap.
    return Math.max(eased, taperHalfGapMm(l, T, h));
  };
  const N = 60;
  const mirrored: TabRun = { ...sideRun, fromMm: Hb - sideRun.toMm, toMm: Hb - sideRun.fromMm };
  // The side follows the closed flaps in to the handle's two plies, then the ear rises from a full-
  // width base well below the taper's top, so it flexes on its patch, not at a narrow neck.
  const earBase = Hb + Hs - 30;
  const side: Point2D[] = [{ x: 0, y: 0 }, ...tabbedEdge({ x: S, y: 0 }, { x: S, y: Hb }, sideRun, T, 1)];
  for (let i = 1; i <= N; i++) side.push({ x: S / 2 + halfWidth((Hs * i) / N), y: Hb + (Hs * i) / N });
  for (let i = N; i >= 1; i--) side.push({ x: S / 2 - halfWidth((Hs * i) / N), y: Hb + (Hs * i) / N });
  side.push(...tabbedEdge({ x: 0, y: Hb }, { x: 0, y: 0 }, mirrored, T, 1));
  const earShape: Point2D[] = [{ x: S / 2 - e, y: earBase }, { x: S / 2 + e, y: earBase }];
  for (let i = 0; i <= 24; i++) {
    const t = (Math.PI * i) / 24;
    earShape.push({ x: S / 2 + e * Math.cos(t), y: earTop - e + e * Math.sin(t) });
  }
  const joined = largest(union([[side], [earShape]]));
  // Round the part above the body only; the body's tabs are hidden in the front and back.
  const sideOutline = roundCorners(joined, roundFor(T), (q) => q.y > Hb + 1e-6);
  const slotLo = Hb + Hs + notch.lo - HOOK.hookMm;
  // Square, and the stacked plies' full width all the way up, so the hook passes.
  const slotW = 2 * T - kerf;
  const earSlot = [
    { x: S / 2 - slotW / 2, y: slotLo },
    { x: S / 2 + slotW / 2, y: slotLo },
    { x: S / 2 + slotW / 2, y: slotLo + HOOK.notchMm + HOOK.hookMm },
    { x: S / 2 - slotW / 2, y: slotLo + HOOK.notchMm + HOOK.hookMm },
  ];
  // An oval wider than the ear, so its middle slits run out to the ear's edges: no solid border.
  // Low on the side, just above the body where it's near full width: the whole upper side swings out.
  const patch = { cx: S / 2, cy: Hb + EAR_PATCH.aboveBodyMm, rx: halfWidth(EAR_PATCH.aboveBodyMm) + 4, ry: EAR_PATCH.heightMm / 2 };
  const earPatch: Point2D[][] = hingeCuts(settings, { x: patch.cx - patch.rx, y: patch.cy - patch.ry, width: 2 * patch.rx, height: 2 * patch.ry })
    .flat()
    .flatMap((line) => line.slice(1).map((b, i) => clipToEllipse(line[i], b, patch.cx, patch.cy, patch.rx, patch.ry)))
    .filter((seg): seg is [Point2D, Point2D] => seg !== null)
    // Within the ear's width, a hair inside its edges.
    // Within the side's width at each slit's own height (the side narrows up the patch), a hair inside.
    .map(([a, b]) =>
      [a, b].map((q) => {
        const w = halfWidth(q.y - Hb) - 0.05;
        return { x: Math.max(S / 2 - w, Math.min(S / 2 + w, q.x)), y: q.y };
      }) as [Point2D, Point2D],
    )
    .filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) > 1);
  const sideSlots = slotsFor(bottomRun, slotLine, T, kerf, true);
  const sidePiece = (id: 'left' | 'right'): CarrierPiece => sized({
    id,
    name: id === 'left' ? 'Left side and ear' : 'Right side and ear',
    faceLabel: id.toUpperCase(),
    outlineUp: sideOutline,
    holesUp: [earSlot, ...sideSlots],
    cutsUp: earPatch,
    safeUp: { x: 6, y: floor + T + 6, width: S - 12, height: Hb - 6 - (floor + T + 6) },
  });

  // ── Bottom ───────────────────────────────────────────────────────────────────
  const bottom: Point2D[] = [
    ...tabbedEdge({ x: 0, y: 0 }, { x: S, y: 0 }, bottomRun, T, 1),
    ...tabbedEdge({ x: S, y: 0 }, { x: S, y: S }, bottomRun, T, 1).slice(1),
    ...tabbedEdge({ x: S, y: S }, { x: 0, y: S }, bottomRun, T, 1).slice(1),
    ...tabbedEdge({ x: 0, y: S }, { x: 0, y: 0 }, bottomRun, T, 1).slice(1, -1),
  ];

  const earRing: Point2D[] = [
    { x: -e, y: earBase },
    { x: e, y: earBase },
    ...Array.from({ length: 25 }, (_, i) => ({ x: e * Math.cos((Math.PI * i) / 24), y: earTop - e + e * Math.sin((Math.PI * i) / 24) })),
  ];
  return {
    front: frontPiece('front'),
    back: frontPiece('back'),
    left: sidePiece('left'),
    right: sidePiece('right'),
    bottom: sized({ id: 'bottom', name: 'Bottom', faceLabel: 'BOTTOM', outlineUp: bottom, holesUp: [], cutsUp: [], safeUp: { x: 4, y: 4, width: S - 8, height: S - 8 } }),
    meta: {
      bendZones,
      sideTabCentres: tabCentres(sideRun),
      frontSlotCentres: frontSlots.slice(0, sideRun.count).map((s) => (Math.min(...s.map((p) => p.y)) + Math.max(...s.map((p) => p.y))) / 2),
      ear: earRing,
      earSlot: move(earSlot, -S / 2, 0),
      earPatch: earPatch.map((seg) => move(seg, -S / 2, 0)),
      tabLo: Hb + Hs + notch.lo,
      tabHi: Hb + Hs + notch.top,
      bottomTabCount: bottomRun.count,
      handleLeftMm: hL,
      handleRightMm: hR,
      earLeftMm: L,
      earRightMm: R,
      notchHiMm: notch.hi,
    },
  };
}

/** The carrier's inside size: the bottle's square plus clearance, and its full height. */
export function wineCarrierInnerDims(params: BoxParameters): { widthMm: number; depthMm: number; heightMm: number } {
  const l = wineCarrierLayout(params);
  return { widthMm: l.innerSideMm, depthMm: l.innerSideMm, heightMm: l.bodyHeightMm + l.shoulderHeightMm + l.handleHeightMm };
}

/** The carrier as panels: each piece on the sheet (y-down) and placed closed in 3D. */
export function generateWineCarrier(params: BoxParameters): { panels2D: BoxPanel2D[]; panels3D: Panel3DTransform[]; fingerCountSummary: string } {
  const parts = wineCarrierPieces(params);
  const l = wineCarrierLayout(params);
  const T = params.materialThicknessMm;
  const S = l.innerSideMm;
  const totalH = l.bodyHeightMm + l.shoulderHeightMm + l.handleHeightMm;
  const floor = carrierFloorMm(params);
  const panels2D: BoxPanel2D[] = [];
  const panels3D: Panel3DTransform[] = [];

  for (const piece of [parts.front, parts.back, parts.left, parts.right, parts.bottom]) {
    const b = bounds([piece.outlineUp])!;
    const down = (r: Point2D[]) => r.map((p) => ({ x: p.x - b.x, y: b.y + b.h - p.y }));
    const outline = down(piece.outlineUp);
    const holes = piece.holesUp.map(down);
    const paths: DielinePath[] = [
      { id: `${piece.id}-outline`, layer: 'cut', d: pointsToSvgPath(outline, true), closed: true },
      ...holes.map((h, i) => ({ id: `${piece.id}-hole-${i + 1}`, layer: 'cut' as const, d: pointsToSvgPath(h, true), closed: true })),
      ...piece.cutsUp.map((c, i) => ({ id: `${piece.id}-hinge-${i + 1}`, layer: 'cut' as const, d: hingeShapePath([down(c)]), closed: false })),
    ];
    const safe = piece.safeUp;
    panels2D.push({
      id: piece.id,
      name: piece.name,
      faceLabel: piece.faceLabel,
      widthMm: b.w,
      heightMm: b.h,
      safeRect: { x: safe.x - b.x, y: b.y + b.h - (safe.y + safe.height), width: safe.width, height: safe.height },
      sheetX: 0,
      sheetY: 0,
      paths,
    });

    // Closed in 3D: the box centred on the origin, y up, the front facing +z.
    const cy = b.y + b.h / 2 - totalH / 2;
    const placed: Record<string, Pick<Panel3DTransform, 'closedPos' | 'rotation'>> = {
      front: { closedPos: [0, cy, S / 2 + T / 2], rotation: [0, 0, 0] },
      back: { closedPos: [0, cy, -(S / 2 + T / 2)], rotation: [0, Math.PI, 0] },
      left: { closedPos: [-(S / 2 + T / 2), cy, b.x + b.w / 2 - S / 2], rotation: [0, -Math.PI / 2, 0] },
      right: { closedPos: [S / 2 + T / 2, cy, -(b.x + b.w / 2 - S / 2)], rotation: [0, Math.PI / 2, 0] },
      bottom: { closedPos: [0, floor + T / 2 - totalH / 2, 0], rotation: [-Math.PI / 2, 0, 0] },
    };
    const { closedPos, rotation } = placed[piece.id];
    panels3D.push({
      id: piece.id,
      name: piece.name,
      faceId: piece.id,
      widthMm: b.w,
      heightMm: b.h,
      thicknessMm: T,
      color: piece.id === 'front' || piece.id === 'back' ? '#dfc195' : '#cda676',
      closedPos,
      explodedPos: [closedPos[0] * 1.6, closedPos[1], closedPos[2] * 1.6],
      rotation,
      outlinePoints: outline,
      holeContours: holes,
      patternSafe: true,
      // The ears' hinge slits, drawn on the flat side pieces.
      ...(piece.id === 'left' || piece.id === 'right' ? { surfaceLines: piece.cutsUp.map(down) } : {}),
      ...(piece.id === 'front' || piece.id === 'back'
        ? {
            bend: {
              // Up the body, in over the first hinge, up the slope, back out over the second, up the handle.
              segments: [
                { kind: 'straight' as const, lengthMm: l.bodyHeightMm },
                { kind: 'arc' as const, radiusMm: l.bendRadiusMm, angleRad: l.bendAngleRad },
                { kind: 'straight' as const, lengthMm: l.slopeLengthMm },
                { kind: 'arc' as const, radiusMm: l.topBendRadiusMm, angleRad: -l.bendAngleRad },
                { kind: 'straight' as const, lengthMm: l.handleHeightMm },
              ],
              lines: piece.cutsUp.map(down),
            },
          }
        : {}),
    });
  }
  return { panels2D, panels3D, fingerCountSummary: 'Tab-and-slot wine carrier' };
}
