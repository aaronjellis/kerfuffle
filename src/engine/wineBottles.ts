/**
 * The wine carrier's sizes: the bottle presets, and the box worked out from a bottle. A tall square
 * box with clearance round the bottle; above the bottle's shoulder the front and back each bend in
 * over a living hinge, run up a straight slope, and bend back to vertical as the handle halves,
 * meeting face to face. All lengths in mm along the panels' mid-thickness.
 */
import { livingHingeSettings } from './fingerJointEngine';
import { hingeBendRadiusMm, hingeMinWebMm, MIN_SAFE_WEB_MM } from './livingHinge';
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
  /** The soft lower bend's radius and the short top bend's, at mid-thickness, and the angle each turns */
  bendRadiusMm: number;
  topBendRadiusMm: number;
  bendAngleRad: number;
  /** The straight slope between a shoulder's two bends */
  slopeLengthMm: number;
  /** How far each half's mid-surface moves in: from the body's to the handle's */
  insetMm: number;
  /** The least gap kept between the taper's inside and the centre line at the bottle's top */
  neckClearanceMm: number;
}

const HANDLE_HEIGHT_MM = 70;

/** The handle's hooked tab: its height in the ear's slot, how far the hook rises above it, and how far past the ear it reaches. */
export const HOOK = { notchMm: 8, hookMm: 3, reachMm: 2 };
/** Where the tab's notch starts, up the handle half. */
export const NOTCH_FROM_MM = 37;
/** The ear's flexing patch: its height, and its centre's distance below the taper's top. */
export const EAR_PATCH = { heightMm: 24, aboveBodyMm: 18 };
/** The arched feet's height, and the bottom's underside above the floor with and without them. */
export const FOOT_ARCH_MM = 8;
export const carrierFloorMm = (p: Pick<BoxParameters, 'wineFeet'>): number => (p.wineFeet ? FOOT_ARCH_MM + 4 : 4);
/** A 30 mm capsule's radius plus 2 mm. */
const NECK_CLEARANCE_MM = 17;
/** The shoulder hinges flex at every opening, so they bend half again gentler than they can. */
const REPEAT_MARGIN = 1.5;
/** The gentlest the short top bend is drawn. */
const MAX_TOP_BEND_MM = 40;


/**
 * A shoulder: a soft lower bend of `lowMm` radius turning in by `angleRad`, a straight slope, then a
 * short top bend of `topMm` turning back up into the handle. They meet `insetMm` across and
 * `heightMm` up: inset = (r1 + r2)(1 − cos α) + L sin α, height = (r1 + r2) sin α + L cos α.
 * Null when no angle reaches the inset within the height.
 */
export function shoulderProfile(insetMm: number, heightMm: number, lowMm: number, topMm: number): { angleRad: number; slopeMm: number } | null {
  const R = lowMm + topMm;
  // The steepest angle whose slope isn't negative.
  const maxAngle = heightMm >= R ? Math.PI / 2 - 1e-9 : Math.asin(heightMm / R);
  const slope = (a: number) => (heightMm - R * Math.sin(a)) / Math.cos(a);
  const reach = (a: number) => R * (1 - Math.cos(a)) + slope(a) * Math.sin(a);
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

/** A shoulder's length along the panel: both bends and the slope between. */
export const shoulderLengthMm = (l: Pick<WineCarrierLayout, 'bendRadiusMm' | 'topBendRadiusMm' | 'bendAngleRad' | 'slopeLengthMm'>): number =>
  (l.bendRadiusMm + l.topBendRadiusMm) * l.bendAngleRad + l.slopeLengthMm;

/** The shoulder's mid-surface, `n + 1` points from its foot: [up, in]. */
function shoulderTrace(l: WineCarrierLayout, n = 240): [number, number][] {
  const { bendRadiusMm: R, topBendRadiusMm: R2, bendAngleRad: a, slopeLengthMm: L } = l;
  const arc = R * a;
  const total = shoulderLengthMm(l);
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
      const t = (total - s) / R2;
      pts.push([l.shoulderHeightMm - R2 * Math.sin(t), l.insetMm - R2 * (1 - Math.cos(t))]);
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
  // Heights count from the foot of the box; the bottle stands on the bottom's top face above it.
  const stand = carrierFloorMm(p) + T;
  const bodyHeightMm = stand + Math.max(40, p.wineBottleShoulderMm) + clearance;
  const insetMm = innerSideMm / 2;
  const base = {
    innerSideMm,
    bodyHeightMm,
    handleHeightMm: HANDLE_HEIGHT_MM,
    insetMm,
    neckClearanceMm: NECK_CLEARANCE_MM,
  };
  // The top bend as tight as the hinge takes repeatedly; the lower one soft, near half the shoulder.
  const hinge = hingeBendRadiusMm(livingHingeSettings(p), T, p.kerfMm, innerSideMm);
  // Capped: a stiff pattern would otherwise balloon the top bend; the checks warn instead.
  const topBendRadiusMm = Math.max(10, Math.min(MAX_TOP_BEND_MM, REPEAT_MARGIN * (Number.isFinite(hinge) ? hinge : MAX_TOP_BEND_MM)));
  const at = (h: number): WineCarrierLayout | null => {
    const bendRadiusMm = Math.max(topBendRadiusMm, 0.45 * h);
    const prof = shoulderProfile(insetMm, h, bendRadiusMm, topBendRadiusMm);
    return (
      prof && { ...base, shoulderHeightMm: h, minShoulderHeightMm: h, shoulderClamped: false, bendRadiusMm, topBendRadiusMm, bendAngleRad: prof.angleRad, slopeLengthMm: prof.slopeMm }
    );
  };
  // The least whole-mm height whose profile exists and clears the neck at the bottle's top.
  const neckUp = stand + p.wineBottleHeightMm - bodyHeightMm;
  let minH = 1;
  for (; minH < 1000; minH++) {
    const l = at(minH);
    if (l && taperHalfGapMm(l, T, neckUp) >= NECK_CLEARANCE_MM) break;
  }
  const wanted = p.wineShoulderHeightMm > 0 ? p.wineShoulderHeightMm : minH;
  const h = Math.max(minH, wanted);
  const l = at(h) ?? at(minH)!;
  return { ...l, minShoulderHeightMm: minH, shoulderClamped: p.wineShoulderHeightMm > 0 && p.wineShoulderHeightMm < minH };
}

export interface WineCarrierChecks {
  /** How tight the hinge pattern bends, with the repeat margin, at the shoulders and the ears */
  shoulderBendMm: number;
  earBendMm: number;
  /** The bend the ear's patch must take to swing the slot clear of the hooks */
  earNeedMm: number;
  /** The narrowest wood between slits */
  webMm: number;
  shoulderCracks: boolean;
  earCracks: boolean;
  thinWeb: boolean;
  notes: string[];
}

/** Whether the shoulders and ears bend as often as they're asked to without cracking, and what to say. */
export function wineCarrierChecks(p: BoxParameters): WineCarrierChecks {
  const l = wineCarrierLayout(p);
  const T = p.materialThicknessMm;
  const settings = livingHingeSettings(p);
  const raw = (width: number) => {
    const r = hingeBendRadiusMm(settings, T, p.kerfMm, width);
    return REPEAT_MARGIN * (Number.isFinite(r) ? r : Infinity);
  };
  const shoulderBendMm = raw(l.innerSideMm);
  const earBendMm = raw(2 * T + 16);
  // The slot must swing out the ply and the hook's reach; the patch turns that far over its lever.
  const lever = l.shoulderHeightMm + NOTCH_FROM_MM - HOOK.hookMm + (HOOK.notchMm + HOOK.hookMm) / 2 - EAR_PATCH.aboveBodyMm;
  const earNeedMm = (EAR_PATCH.heightMm * lever) / (T + HOOK.reachMm);
  const webMm = hingeMinWebMm(settings, p.kerfMm);
  const shoulderCracks = shoulderBendMm > l.topBendRadiusMm + 1e-6;
  const earCracks = earBendMm > earNeedMm;
  const thinWeb = webMm < MIN_SAFE_WEB_MM;
  const notes: string[] = [];
  if (shoulderCracks) notes.push('The shoulders open and close each time; at these settings they may crack. Move the hinge rows closer or lengthen the slits.');
  if (earCracks) notes.push('The ears flex each time you open it; at these settings they may crack. Move the hinge rows closer or lengthen the slits.');
  if (thinWeb) notes.push('Under 1 mm of wood between slits can char through or snap.');
  if (l.shoulderClamped) notes.push(`Shoulders raised to ${l.minShoulderHeightMm} mm so the taper clears the bottle's neck.`);
  return { shoulderBendMm, earBendMm, earNeedMm, webMm, shoulderCracks, earCracks, thinWeb, notes };
}

/** The settings a bottle choice sets: a preset fills in its size; Custom keeps the size as it is. */
export function bottlePatch(id: string): Partial<BoxParameters> {
  const b = WINE_BOTTLES.find((x) => x.id === id);
  if (!b) return { wineBottleId: 'custom' };
  return { wineBottleId: b.id, wineBottleDiameterMm: b.diameterMm, wineBottleHeightMm: b.heightMm, wineBottleShoulderMm: b.shoulderMm };
}
