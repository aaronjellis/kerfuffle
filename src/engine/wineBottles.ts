/**
 * The wine carrier's sizes: the bottle presets, and the box worked out from a bottle. A tall square
 * box with clearance round the bottle; above the bottle's shoulder the front and back each bend in
 * over a living hinge, run up a straight slope, and bend back to vertical as the handle halves,
 * meeting face to face. All lengths in mm along the panels' mid-thickness.
 */
import { livingHingeSettings } from './fingerJointEngine';
import { hingeBendRadiusMm } from './livingHinge';
import type { BoxParameters } from './types';

export interface WineBottle {
  id: string;
  name: string;
  diameterMm: number;
  heightMm: number;
  /** Height where the bottle's shoulder starts */
  shoulderMm: number;
}

/** Common bottles, approximate to a few mm: a starting point the user adjusts. */
export const WINE_BOTTLES: WineBottle[] = [
  { id: 'bordeaux-750', name: 'Bordeaux 750 ml', diameterMm: 76, heightMm: 300, shoulderMm: 210 },
  { id: 'burgundy-750', name: 'Burgundy 750 ml', diameterMm: 82, heightMm: 300, shoulderMm: 190 },
  { id: 'champagne-750', name: 'Champagne 750 ml', diameterMm: 90, heightMm: 310, shoulderMm: 200 },
  { id: 'riesling-750', name: 'Riesling flute 750 ml', diameterMm: 74, heightMm: 350, shoulderMm: 230 },
  { id: 'half-375', name: 'Half bottle 375 ml', diameterMm: 66, heightMm: 240, shoulderMm: 170 },
  { id: 'magnum-1500', name: 'Magnum 1.5 l', diameterMm: 100, heightMm: 350, shoulderMm: 245 },
];

export interface WineCarrierLayout {
  /** Inside width and depth: the bottle plus clearance each side */
  innerSideMm: number;
  /** Straight body, from the floor to where the shoulders start */
  bodyHeightMm: number;
  shoulderHeightMm: number;
  minShoulderHeightMm: number;
  /** The set shoulder height was raised to clear the neck */
  shoulderClamped: boolean;
  /** The handle halves, above the shoulders */
  handleHeightMm: number;
  /** Each shoulder bend's radius at mid-thickness, and its angle */
  bendRadiusMm: number;
  bendAngleRad: number;
  /** The straight slope between a shoulder's two bends */
  slopeLengthMm: number;
  /** How far each half's mid-surface moves in: from the body's to the handle's */
  insetMm: number;
  /** The least gap kept between the taper's inside and the centre line at the bottle's top */
  neckClearanceMm: number;
}

const HANDLE_HEIGHT_MM = 70;
/** A 30 mm capsule's radius plus 2 mm. */
const NECK_CLEARANCE_MM = 17;
/** The shoulder hinges flex at every opening, so they bend half again gentler than they can. */
const REPEAT_MARGIN = 1.5;

/**
 * Two arcs of `radiusMm` turning `angleRad` with a straight slope between, meeting `insetMm` across
 * and `heightMm` up: inset = 2R(1 − cos α) + L sin α, height = 2R sin α + L cos α. Null when no
 * angle reaches the inset within the height.
 */
export function shoulderProfile(insetMm: number, heightMm: number, radiusMm: number): { angleRad: number; slopeMm: number } | null {
  const R = radiusMm;
  // The steepest angle whose slope isn't negative.
  const maxAngle = heightMm >= 2 * R ? Math.PI / 2 - 1e-9 : Math.asin(heightMm / (2 * R));
  const slope = (a: number) => (heightMm - 2 * R * Math.sin(a)) / Math.cos(a);
  const reach = (a: number) => 2 * R * (1 - Math.cos(a)) + slope(a) * Math.sin(a);
  if (reach(maxAngle) < insetMm) return null;
  let lo = 0;
  let hi = maxAngle;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (reach(mid) < insetMm) lo = mid;
    else hi = mid;
  }
  const angleRad = (lo + hi) / 2;
  return { angleRad, slopeMm: Math.max(0, slope(angleRad)) };
}

/** The shoulder's mid-surface, `n + 1` points from its foot: [up, in]. */
function shoulderTrace(l: WineCarrierLayout, n = 240): [number, number][] {
  const { bendRadiusMm: R, bendAngleRad: a, slopeLengthMm: L } = l;
  const arc = R * a;
  const total = 2 * arc + L;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const s = (total * i) / n;
    if (s <= arc) {
      const t = s / R;
      pts.push([R * Math.sin(t), R * (1 - Math.cos(t))]);
    } else if (s <= arc + L) {
      const d = s - arc;
      pts.push([R * Math.sin(a) + d * Math.cos(a), R * (1 - Math.cos(a)) + d * Math.sin(a)]);
    } else {
      // The second arc turns back to vertical; measured from the top of the shoulder.
      const t = (total - s) / R;
      pts.push([l.shoulderHeightMm - R * Math.sin(t), l.insetMm - R * (1 - Math.cos(t))]);
    }
  }
  return pts;
}

/**
 * The gap between the taper's inside face and the box's centre line, `upMm` above the shoulders'
 * foot: half the inside depth below them, nothing above them where the halves meet.
 */
export function taperHalfGapMm(l: WineCarrierLayout, thicknessMm: number, upMm: number): number {
  if (upMm <= 0) return l.innerSideMm / 2;
  if (upMm >= l.shoulderHeightMm) return 0;
  const pts = shoulderTrace(l);
  let k = 1;
  while (k < pts.length - 1 && pts[k][0] < upMm) k++;
  const [u0, x0] = pts[k - 1];
  const [u1, x1] = pts[k];
  const inset = x0 + ((x1 - x0) * (upMm - u0)) / Math.max(1e-9, u1 - u0);
  // The inside face sits half a thickness off the mid-surface, further across where it slopes.
  const tilt = Math.atan2(x1 - x0, Math.max(1e-9, u1 - u0));
  return Math.max(0, l.innerSideMm / 2 - inset - (thicknessMm / 2) / Math.cos(tilt) + thicknessMm / 2);
}

/** The carrier worked out from its bottle. */
export function wineCarrierLayout(p: BoxParameters): WineCarrierLayout {
  const T = p.materialThicknessMm;
  const clearance = Math.max(0, p.wineClearanceMm);
  const innerSideMm = Math.max(20, p.wineBottleDiameterMm) + 2 * clearance;
  const bodyHeightMm = Math.max(40, p.wineBottleShoulderMm) + clearance;
  const insetMm = innerSideMm / 2;
  const hinge = hingeBendRadiusMm(livingHingeSettings(p), T, p.kerfMm, innerSideMm);
  const bendRadiusMm = Math.max(10, REPEAT_MARGIN * (Number.isFinite(hinge) ? hinge : 10));
  const base = {
    innerSideMm,
    bodyHeightMm,
    handleHeightMm: HANDLE_HEIGHT_MM,
    bendRadiusMm,
    insetMm,
    neckClearanceMm: NECK_CLEARANCE_MM,
  };
  const at = (h: number) => {
    const prof = shoulderProfile(insetMm, h, bendRadiusMm);
    return prof && { ...base, shoulderHeightMm: h, minShoulderHeightMm: h, shoulderClamped: false, bendAngleRad: prof.angleRad, slopeLengthMm: prof.slopeMm };
  };
  // The least whole-mm height whose profile exists and clears the neck at the bottle's top.
  const neckUp = p.wineBottleHeightMm - bodyHeightMm;
  let minH = 1;
  for (; minH < 1000; minH++) {
    const l = at(minH);
    if (l && taperHalfGapMm(l, T, neckUp) >= NECK_CLEARANCE_MM) break;
  }
  const wanted = p.wineShoulderHeightMm > 0 ? p.wineShoulderHeightMm : minH;
  const h = Math.max(minH, wanted);
  const l = at(h)!;
  return { ...l, minShoulderHeightMm: minH, shoulderClamped: p.wineShoulderHeightMm > 0 && p.wineShoulderHeightMm < minH };
}
