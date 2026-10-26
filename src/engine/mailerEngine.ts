import type { BoxParameters } from './types';

/**
 * Ply model for the roll-end cardboard mailer.
 *
 * Every wall straddles its crease, half a ply each side. W, D, H are the inner
 * width (across the front), inner depth (front to back) and inner height; T is
 * the board thickness. Later tasks build the 2D sheet and the 3D fold rig from
 * these spans, so names and numbers here are a contract.
 */
export interface MailerSpans {
  T: number;
  roll: number; // 2T, or 3T when includeLidFlaps
  floorW: number; // W + T + 2*roll
  floorD: number; // D + 2T
  backH: number; // H + T
  frontH: number; // H + T
  outerSideH: number; // H + T/2
  innerSideH: number; // H - T/2 (never below 8)
  innerSideLen: number; // D - T (along the depth)
  rollLen: number; // D (along the depth)
  lidD: number; // D + 3T
  tuckH: number; // min(tuckFlapMm, H - T)
  tuckW: number; // W - 2T
  tuckR: number; // min(8, 0.4 * tuckH)
  lidFlapDepth: number; // H - T (0 when flaps off)
  lidFlapLen: number; // D - T
  earW: number; // min(H, D/2 - T)
  earH: number; // H - 2T
  tab: { len: number; depth: number; centers: [number, number]; chamfer: 4 };
  /** inset = T/2 + roll from the side crease */
  slot: { len: number; width: number; inset: number };
  /** null for the 'tuck' lock style */
  lock: { tabW: number; tabLen: number; slitLen: number } | null;
  /** 0 when off or when a lock is set */
  notchR: number;
  /** 2D layout, blank origin top-left, x left to right, y top to bottom */
  x: {
    tabL: number;
    innerL: number;
    rollL: number;
    outerL: number;
    floorL: number;
    floorR: number;
    outerR: number;
    rollR: number;
    innerR: number;
    tabR: number;
  };
  y: {
    tuckTop: number;
    lidTop: number;
    backTop: number;
    floorTop: number;
    frontTop: number;
    frontBottom: number;
  };
  blankW: number;
  blankH: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function computeMailerSpans(params: BoxParameters, W: number, D: number, H: number): MailerSpans {
  const T = params.materialThicknessMm;
  const roll = params.includeLidFlaps ? 3 * T : 2 * T;

  const floorW = W + T + 2 * roll;
  const floorD = D + 2 * T;
  const backH = H + T;
  const frontH = H + T;
  const outerSideH = H + T / 2;
  const innerSideH = Math.max(8, H - T / 2);
  const lidD = D + 3 * T;
  const tuckH = Math.min(params.tuckFlapMm, H - T);
  const tuckW = W - 2 * T;
  const tuckR = Math.min(8, 0.4 * tuckH);
  const lidFlapDepth = params.includeLidFlaps ? H - T : 0;
  const earW = Math.min(H, D / 2 - T);

  const tab: MailerSpans['tab'] = {
    len: clamp(D / 4, 14, 26),
    depth: Math.min(2 * T + 6, innerSideH - 2),
    centers: [0.25, 0.75],
    chamfer: 4,
  };
  const slot: MailerSpans['slot'] = {
    len: tab.len + 1,
    width: T + 0.5,
    inset: T / 2 + roll,
  };

  let lock: MailerSpans['lock'] = null;
  if (params.cardboardLockStyle === 'front-lock') {
    // Sideways room runs from the tuck flap's edge to the outer side wall's inner face: roll + T.
    const upper = roll + T;
    // lockTabWidthMm is a ceiling, not a target. The 8 mm floor applies only when 8 mm fits.
    const capped = Math.min(params.lockTabWidthMm, upper);
    const tabW = upper >= 8 ? Math.max(8, capped) : Math.max(0, capped);
    const tabLen = clamp(params.lockTabDepthMm, 12, tuckH);
    lock = { tabW, tabLen, slitLen: tabLen + 1 };
  }
  const notchR = params.thumbNotch && lock === null ? Math.min(12, W / 8) : 0;

  // 2D layout, before any overflow shift.
  const xL = {
    tabL: 0,
    innerL: tab.depth,
    rollL: 0,
    outerL: 0,
    floorL: 0,
  };
  xL.rollL = xL.innerL + innerSideH;
  xL.outerL = xL.rollL + roll;
  xL.floorL = xL.outerL + outerSideH;
  const floorR = xL.floorL + floorW;
  const outerR = floorR + outerSideH;
  const rollR = outerR + roll;
  const innerR = rollR + innerSideH;
  const tabR = innerR + tab.depth;

  // Lid flaps (lid row) and dust ears (wall rows) extend sideways past the
  // floor edges. Shift everything right if they would land at a negative x.
  const sideReach = Math.max(lidFlapDepth, earW);
  const leftOverflow = Math.max(0, sideReach - xL.floorL);
  const rightOverflow = Math.max(0, floorR + sideReach - tabR);
  const dx = leftOverflow;

  const x: MailerSpans['x'] = {
    tabL: xL.tabL + dx,
    innerL: xL.innerL + dx,
    rollL: xL.rollL + dx,
    outerL: xL.outerL + dx,
    floorL: xL.floorL + dx,
    floorR: floorR + dx,
    outerR: outerR + dx,
    rollR: rollR + dx,
    innerR: innerR + dx,
    tabR: tabR + dx,
  };

  const y: MailerSpans['y'] = {
    tuckTop: 0,
    lidTop: tuckH,
    backTop: tuckH + lidD,
    floorTop: tuckH + lidD + backH,
    frontTop: tuckH + lidD + backH + floorD,
    frontBottom: tuckH + lidD + backH + floorD + frontH,
  };

  return {
    T,
    roll,
    floorW,
    floorD,
    backH,
    frontH,
    outerSideH,
    innerSideH,
    innerSideLen: D - T,
    rollLen: D,
    lidD,
    tuckH,
    tuckW,
    tuckR,
    lidFlapDepth,
    lidFlapLen: D - T,
    earW,
    earH: H - 2 * T,
    tab,
    slot,
    lock,
    notchR,
    x,
    y,
    blankW: tabR + leftOverflow + rightOverflow,
    blankH: y.frontBottom,
  };
}
