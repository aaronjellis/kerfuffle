import type { BoxPanel2D, BoxParameters, DielinePath, Panel3DTransform } from './types';
import { buildScoreLinePaths } from './cardboardEngine';
import { fmt, pointsToSvgPath } from './fingerJointEngine';

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

/**
 * Keeps sideways projections (lid flaps, dust ears) on the blank.
 * `sideReach` is how far they extend past `floorL` and `floorR`. If they would
 * land at a negative x, every x shifts right by that left overflow. `blankW` is
 * the original `tabR` widened by the left and right overflow.
 */
export function applySideOverflow(
  x: MailerSpans['x'],
  sideReach: number,
): { x: MailerSpans['x']; blankW: number } {
  const left = Math.max(0, sideReach - x.floorL);
  const right = Math.max(0, x.floorR + sideReach - x.tabR);
  const shifted = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v + left])) as MailerSpans['x'];
  return { x: shifted, blankW: x.tabR + left + right };
}

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
  const innerL = tab.depth;
  const rollL = innerL + innerSideH;
  const outerL = rollL + roll;
  const floorL = outerL + outerSideH;
  const floorR = floorL + floorW;
  const outerR = floorR + outerSideH;
  const rollR = outerR + roll;
  const innerR = rollR + innerSideH;
  const xUnshifted: MailerSpans['x'] = {
    tabL: 0,
    innerL,
    rollL,
    outerL,
    floorL,
    floorR,
    outerR,
    rollR,
    innerR,
    tabR: innerR + tab.depth,
  };

  // Lid flaps (lid row) and dust ears (wall rows) extend sideways past the floor edges.
  const { x, blankW } = applySideOverflow(xUnshifted, Math.max(lidFlapDepth, earW));

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
    blankW,
    blankH: y.frontBottom,
  };
}

/** A perimeter vertex; `q` is the control point of a quadratic arriving at it, `arc` an arc arriving at it. */
interface PerimNode {
  x: number;
  y: number;
  q?: { x: number; y: number };
  arc?: { r: number; sweep: 0 | 1 };
}

/**
 * The right half of the perimeter, clockwise from the tuck flap's top edge down to the
 * front wall's bottom-right corner at (floorR, frontBottom).
 */
function rightHalfPerimeter(s: MailerSpans): PerimNode[] {
  const { T, x, y } = s;
  const fr = x.floorR;
  const tx1 = fr - (s.floorW - s.tuckW) / 2;
  const nodes: PerimNode[] = [];

  // Tuck flap, with a lock tab on its side edge for the front lock.
  const tabTop = s.lock ? y.lidTop - s.lock.tabLen : y.lidTop;
  const rc = s.lock ? Math.max(0, Math.min(s.tuckR, tabTop - y.tuckTop)) : s.tuckR;
  nodes.push({ x: tx1 - rc, y: y.tuckTop });
  if (rc > 0) nodes.push({ x: tx1, y: y.tuckTop + rc, q: { x: tx1, y: y.tuckTop } });
  if (s.lock) {
    const { tabW, tabLen } = s.lock;
    const rootDrop = tabLen * Math.tan((15 * Math.PI) / 180);
    const rt = Math.max(0, Math.min(4, tabW, tabLen - rootDrop));
    const ox = tx1 + tabW;
    nodes.push({ x: tx1, y: tabTop });
    nodes.push({ x: ox - rt, y: tabTop });
    nodes.push({ x: ox, y: tabTop + rt, q: { x: ox, y: tabTop } });
    nodes.push({ x: ox, y: y.lidTop - rootDrop });
  }
  nodes.push({ x: tx1, y: y.lidTop });

  // Lid right edge with the lid flap.
  nodes.push({ x: fr, y: y.lidTop });
  if (s.lidFlapDepth > 0) {
    const fy0 = y.lidTop + T;
    const fy1 = fy0 + s.lidFlapLen;
    const fx = fr + s.lidFlapDepth;
    const ch = Math.min(4, s.lidFlapDepth, s.lidFlapLen);
    nodes.push({ x: fr, y: fy0 }, { x: fx, y: fy0 }, { x: fx, y: fy1 - ch }, { x: fx - ch, y: fy1 }, { x: fr, y: fy1 });
  }
  nodes.push({ x: fr, y: y.backTop });

  // Dust ear on a wall row, inset 1.5T from both creases, 3 mm chamfers on the free corners.
  const ear = (rowTop: number, rowBottom: number) => {
    const e0 = rowTop + 1.5 * T;
    const e1 = rowBottom - 1.5 * T;
    if (s.earW <= 0 || e1 <= e0) return;
    const ex = fr + s.earW;
    const ch = Math.min(3, s.earW, (e1 - e0) / 2);
    nodes.push(
      { x: fr, y: e0 },
      { x: ex - ch, y: e0 },
      { x: ex, y: e0 + ch },
      { x: ex, y: e1 - ch },
      { x: ex - ch, y: e1 },
      { x: fr, y: e1 },
    );
  };
  ear(y.backTop, y.floorTop);
  nodes.push({ x: fr, y: y.floorTop });

  // Side column: outer wall full floorD, roll inset T, inner wall inset 1.5T, two chamfered tabs.
  nodes.push(
    { x: x.outerR, y: y.floorTop },
    { x: x.outerR, y: y.floorTop + T },
    { x: x.rollR, y: y.floorTop + T },
    { x: x.rollR, y: y.floorTop + 1.5 * T },
    { x: x.innerR, y: y.floorTop + 1.5 * T },
  );
  const ch = Math.min(s.tab.chamfer, s.tab.depth, s.tab.len / 2);
  for (const c of s.tab.centers) {
    const yc = y.floorTop + c * s.floorD;
    const t0 = yc - s.tab.len / 2;
    const t1 = yc + s.tab.len / 2;
    nodes.push(
      { x: x.innerR, y: t0 },
      { x: x.tabR - ch, y: t0 },
      { x: x.tabR, y: t0 + ch },
      { x: x.tabR, y: t1 - ch },
      { x: x.tabR - ch, y: t1 },
      { x: x.innerR, y: t1 },
    );
  }
  nodes.push(
    { x: x.innerR, y: y.frontTop - 1.5 * T },
    { x: x.rollR, y: y.frontTop - 1.5 * T },
    { x: x.rollR, y: y.frontTop - T },
    { x: x.outerR, y: y.frontTop - T },
    { x: x.outerR, y: y.frontTop },
    { x: fr, y: y.frontTop },
  );

  ear(y.frontTop, y.frontBottom);
  nodes.push({ x: fr, y: y.frontBottom });
  return nodes;
}

function perimeterPath(s: MailerSpans): string {
  const right = rightHalfPerimeter(s);
  const cx = (s.x.floorL + s.x.floorR) / 2;
  const mx = (v: number) => 2 * cx - v;
  const k = right.length - 1;
  // Mirror across the centre line and reverse: the curve arriving at right[i] arrives at mirror(right[i-1]).
  const left: PerimNode[] = right.map((_, j) => {
    const n = right[k - j];
    const arriving = j > 0 ? right[k - j + 1].q : undefined;
    return { x: mx(n.x), y: n.y, q: arriving ? { x: mx(arriving.x), y: arriving.y } : undefined };
  });

  // Front wall's bottom edge in 2D (its top rim when folded), walked right to left.
  const bottom: PerimNode[] = [];
  if (s.notchR > 0) {
    const yb = s.y.frontBottom;
    bottom.push({ x: cx + s.notchR, y: yb }, { x: cx - s.notchR, y: yb, arc: { r: s.notchR, sweep: 0 } });
  }

  const start = left[k];
  const loop = [...right, ...bottom, ...left];
  const cmds = [`M ${fmt(start.x)} ${fmt(start.y)}`];
  let px = start.x;
  let py = start.y;
  for (const n of loop) {
    if (n.q) cmds.push(`Q ${fmt(n.q.x)} ${fmt(n.q.y)} ${fmt(n.x)} ${fmt(n.y)}`);
    else if (n.arc) cmds.push(`A ${fmt(n.arc.r)} ${fmt(n.arc.r)} 0 0 ${n.arc.sweep} ${fmt(n.x)} ${fmt(n.y)}`);
    else if (Math.hypot(n.x - px, n.y - py) > 1e-6) cmds.push(`L ${fmt(n.x)} ${fmt(n.y)}`);
    px = n.x;
    py = n.y;
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/** The roll-end mailer's single cut-and-score sheet, built only from the ply-model spans. */
export function buildMailerSheet(
  spans: MailerSpans,
  params: BoxParameters,
  W: number,
  D: number,
  H: number,
): BoxPanel2D {
  const s = spans;
  const { T, x, y } = s;
  const fl = x.floorL;
  const fr = x.floorR;
  const paths: DielinePath[] = [{ id: 'mailer-perimeter-cut', layer: 'cut', d: perimeterPath(s), closed: true }];

  // Floor slots that take the inner wall's tabs.
  s.tab.centers.forEach((c, i) => {
    const yc = y.floorTop + c * s.floorD;
    const y0 = yc - s.slot.len / 2;
    const y1 = yc + s.slot.len / 2;
    const rect = (x0: number) =>
      pointsToSvgPath([
        { x: x0, y: y0 },
        { x: x0 + s.slot.width, y: y0 },
        { x: x0 + s.slot.width, y: y1 },
        { x: x0, y: y1 },
      ]);
    paths.push({ id: `mailer-slot-l-${i + 1}`, layer: 'cut', d: rect(fl + s.slot.inset), closed: true });
    paths.push({ id: `mailer-slot-r-${i + 1}`, layer: 'cut', d: rect(fr - s.slot.inset - s.slot.width), closed: true });
  });

  // Front lock: a slit down each front ear crease from the front wall's rim.
  if (s.lock) {
    const slit = (sx: number) =>
      pointsToSvgPath(
        [
          { x: sx, y: y.frontBottom },
          { x: sx, y: y.frontBottom - s.lock!.slitLen },
        ],
        false,
      );
    paths.push({ id: 'mailer-slit-l', layer: 'cut', d: slit(fl), closed: false });
    paths.push({ id: 'mailer-slit-r', layer: 'cut', d: slit(fr), closed: false });
  }

  const tuckInset = (s.floorW - s.tuckW) / 2;
  const scores: [string, number, number, number, number][] = [
    ['score-tuck', fl + tuckInset, y.lidTop, fr - tuckInset, y.lidTop],
    ['score-lid-back', fl, y.backTop, fr, y.backTop],
    ['score-back-floor', fl, y.floorTop, fr, y.floorTop],
    ['score-floor-front', fl, y.frontTop, fr, y.frontTop],
  ];
  const vertical = (id: string, sx: number, y0: number, y1: number) => {
    if (y1 > y0) scores.push([id, sx, y0, sx, y1]);
  };
  const frontEarEnd = s.lock ? y.frontBottom - s.lock.slitLen : y.frontBottom - 1.5 * T;
  for (const [side, edge, outer, roll] of [
    ['l', fl, x.outerL, x.rollL],
    ['r', fr, x.outerR, x.rollR],
  ] as const) {
    if (s.lidFlapDepth > 0) vertical(`score-lid-flap-${side}`, edge, y.lidTop + T, y.lidTop + T + s.lidFlapLen);
    vertical(`score-ear-back-${side}`, edge, y.backTop + 1.5 * T, y.floorTop - 1.5 * T);
    vertical(`score-ear-front-${side}`, edge, y.frontTop + 1.5 * T, frontEarEnd);
    vertical(`score-floor-side-${side}`, edge, y.floorTop, y.frontTop);
    vertical(`score-roll-${side}-1`, outer, y.floorTop + T, y.frontTop - T);
    vertical(`score-roll-${side}-2`, roll, y.floorTop + 1.5 * T, y.frontTop - 1.5 * T);
  }
  for (const [id, x1, y1, x2, y2] of scores) {
    paths.push(...buildScoreLinePaths(id, x1, y1, x2, y2, params));
  }

  const inner = { x: fl + T / 2, width: s.floorW - T };
  const top = { id: 'top', name: 'Lid Top (Outside)', ...inner, y: y.lidTop + T / 2, height: s.lidD - T };
  return {
    id: 'mailer-sheet',
    name: '1-piece mailer dieline (roll end)',
    faceLabel: 'MAILER DIELINE',
    widthMm: s.blankW,
    heightMm: s.blankH,
    safeRect: { x: top.x, y: top.y, width: top.width, height: top.height },
    sheetX: 0,
    sheetY: 0,
    paths,
    subFaces: [
      top,
      { id: 'back', name: 'Back Spine', ...inner, y: y.backTop + T / 2, height: s.backH - T },
      { id: 'bottom', name: 'Bottom Floor', ...inner, y: y.floorTop + T / 2, height: s.floorD - T },
      { id: 'front', name: 'Front Wall', ...inner, y: y.frontTop + T / 2, height: s.frontH - T },
      { id: 'left', name: 'Left Side Wall', x: x.outerL + T / 2, y: y.floorTop, width: s.outerSideH - T, height: s.floorD },
      { id: 'right', name: 'Right Side Wall', x: fr + T / 2, y: y.floorTop, width: s.outerSideH - T, height: s.floorD },
    ],
  };
}

export function generateMailerBox(
  params: BoxParameters,
  W: number,
  D: number,
  H: number,
): { panels2D: BoxPanel2D[]; panels3D: Panel3DTransform[]; summary: string } {
  const spans = computeMailerSpans(params, W, D, H);
  return {
    panels2D: [buildMailerSheet(spans, params, W, D, H)],
    panels3D: buildMailerRig(spans, params, W, D, H),
    summary: `Roll-end mailer (${fmt(spans.blankW)} × ${fmt(spans.blankH)} mm blank, ${spans.lock ? 'front lock' : 'tuck top'})`,
  };
}

/**
 * Stop-gap 3D fold rig carried over from the retired generator so the suite stays green.
 * Task 4 replaces it with a rig built from the spans.
 */
export function buildMailerRig(
  spans: MailerSpans,
  params: BoxParameters,
  W: number,
  D: number,
  H: number,
): Panel3DTransform[] {
  const { T, earW, earH, roll, innerSideH, tuckH, tuckW } = spans;
  return [
    {
      id: 'bottom',
      name: 'Bottom Floor',
      faceId: 'bottom',
      widthMm: W,
      heightMm: D,
      thicknessMm: T,
      color: '#c69c6d',
      closedPos: [0, -H / 2, 0],
      explodedPos: [0, -H / 2, 0],
      rotation: [Math.PI / 2, 0, 0],
    },
    {
      id: 'front',
      name: 'Front Wall',
      faceId: 'front',
      widthMm: W,
      heightMm: H,
      thicknessMm: T,
      color: '#d1a778',
      closedPos: [0, 0, D / 2],
      explodedPos: [0, -H / 2, D / 2 + H / 2],
      rotation: [0, 0, 0],
      foldRig: {
        pivotOffset: [0, -H / 2, D / 2],
        axis: 'x',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.0, 0.24],
      },
    },
    {
      id: 'back',
      name: 'Back Spine',
      faceId: 'back',
      widthMm: W,
      heightMm: H,
      thicknessMm: T,
      color: '#d1a778',
      closedPos: [0, 0, -D / 2],
      explodedPos: [0, -H / 2, -D / 2 - H / 2],
      rotation: [0, Math.PI, 0],
      foldRig: {
        pivotOffset: [0, -H / 2, -D / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.0, 0.24],
      },
    },
    // 4 Side Dust Flaps (attached to Back & Front walls; fold 90° inward after Front & Back reach vertical at t = 0.24)
    {
      id: 'back-dust-l',
      name: 'Left Back Dust Flap',
      faceId: 'back',
      widthMm: earW,
      heightMm: earH,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [-W / 2, 0, -D / 2 + earW / 2],
      explodedPos: [-W / 2 - earW / 2, -H / 2, -D / 2 - H / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [-W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    {
      id: 'back-dust-r',
      name: 'Right Back Dust Flap',
      faceId: 'back',
      widthMm: earW,
      heightMm: earH,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [W / 2, 0, -D / 2 + earW / 2],
      explodedPos: [W / 2 + earW / 2, -H / 2, -D / 2 - H / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    {
      id: 'front-dust-l',
      name: 'Left Front Dust Flap',
      faceId: 'front',
      widthMm: earW,
      heightMm: earH,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [-W / 2, 0, D / 2 - earW / 2],
      explodedPos: [-W / 2 - earW / 2, -H / 2, D / 2 + H / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'front',
        pivotOffset: [-W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    {
      id: 'front-dust-r',
      name: 'Right Front Dust Flap',
      faceId: 'front',
      widthMm: earW,
      heightMm: earH,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [W / 2, 0, D / 2 - earW / 2],
      explodedPos: [W / 2 + earW / 2, -H / 2, D / 2 + H / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'front',
        pivotOffset: [W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    // Left & Right Outer Walls + Rollover Bridges + Inner Rollover Walls
    {
      id: 'left',
      name: 'Left Outer Wall',
      faceId: 'left',
      widthMm: D,
      heightMm: H,
      thicknessMm: T,
      color: '#bc9162',
      closedPos: [-W / 2, 0, 0],
      explodedPos: [-W / 2 - H / 2, -H / 2, 0],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        pivotOffset: [-W / 2, -H / 2, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.30, 0.55],
      },
    },
    {
      id: 'left-roll-bridge',
      name: 'Left Rollover Top Bridge',
      faceId: 'left',
      widthMm: roll,
      heightMm: D,
      thicknessMm: T,
      color: '#b38758',
      closedPos: [-W / 2 + roll / 2, H / 2, 0],
      explodedPos: [-W / 2 - H - roll / 2, -H / 2, 0],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, H / 2, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.48, 0.72],
      },
    },
    {
      id: 'left-roll-inner',
      name: 'Left Inner Rollover Wall',
      faceId: 'left',
      widthMm: D,
      heightMm: innerSideH,
      thicknessMm: T,
      color: '#ab7f50',
      closedPos: [-W / 2 + roll, H / 2 - innerSideH / 2, 0],
      explodedPos: [-W / 2 - H - roll - innerSideH / 2, -H / 2, 0],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'left-roll-bridge',
        pivotOffset: [-W / 2 + roll, H / 2, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.54, 0.78],
      },
    },
    {
      id: 'right',
      name: 'Right Outer Wall',
      faceId: 'right',
      widthMm: D,
      heightMm: H,
      thicknessMm: T,
      color: '#bc9162',
      closedPos: [W / 2, 0, 0],
      explodedPos: [W / 2 + H / 2, -H / 2, 0],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        pivotOffset: [W / 2, -H / 2, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.30, 0.55],
      },
    },
    {
      id: 'right-roll-bridge',
      name: 'Right Rollover Top Bridge',
      faceId: 'right',
      widthMm: roll,
      heightMm: D,
      thicknessMm: T,
      color: '#b38758',
      closedPos: [W / 2 - roll / 2, H / 2, 0],
      explodedPos: [W / 2 + H + roll / 2, -H / 2, 0],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'right',
        pivotOffset: [W / 2, H / 2, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.48, 0.72],
      },
    },
    {
      id: 'right-roll-inner',
      name: 'Right Inner Rollover Wall',
      faceId: 'right',
      widthMm: D,
      heightMm: innerSideH,
      thicknessMm: T,
      color: '#ab7f50',
      closedPos: [W / 2 - roll, H / 2 - innerSideH / 2, 0],
      explodedPos: [W / 2 + H + roll + innerSideH / 2, -H / 2, 0],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'right-roll-bridge',
        pivotOffset: [W / 2 - roll, H / 2, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.54, 0.78],
      },
    },
    {
      id: 'top',
      name: 'Mailer Lid Top',
      faceId: 'top',
      widthMm: W,
      heightMm: D,
      thicknessMm: T,
      color: '#dbb386',
      closedPos: [0, H / 2, 0],
      explodedPos: [0, -H / 2, -D / 2 - H - D / 2],
      rotation: [-Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [0, H / 2, -D / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.54, 0.82],
      },
    },
    {
      id: 'tuck-flap',
      name: 'Inner Tuck Flap (Inside Front Wall)',
      faceId: 'tuck-flap',
      widthMm: tuckW,
      heightMm: tuckH,
      thicknessMm: T,
      color: '#b5895a',
      // Sits INSIDE the box at Z = D/2 - T (behind Front Wall at Z = D/2)
      closedPos: [0, H / 2 - tuckH / 2, D / 2 - T],
      explodedPos: [0, -H / 2, -D / 2 - H - D - tuckH / 2],
      rotation: [0, 0, 0],
      foldRig: {
        parentId: 'top',
        pivotOffset: [0, H / 2, D / 2 - T],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        // Folds down FIRST before the lid finishes closing and before the front locking tab folds inward!
        stage: [0.46, 0.72],
      },
    },
  ];
}
