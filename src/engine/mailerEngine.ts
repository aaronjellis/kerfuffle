import type { BoxDims, BoxPanel2D, BoxParameters, DielinePath, Panel3DTransform, Point2D } from './types';
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
  roll: number; // 2T, mid-plane to mid-plane: half the outer wall, the dust ear, half the inner wall
  floorW: number; // W + T + 2*roll, plus 2T when includeLidFlaps (room for the flaps inside the inner walls)
  floorD: number; // D + 2T
  backH: number; // H + T
  frontH: number; // H + T/2: floor mid-plane up to the lid's underside
  outerSideH: number; // H: floor mid-plane up to the roll bridge's mid-plane
  innerSideH: number; // H - T/2 (never below 8): roll bridge's mid-plane down to the floor top
  innerSideLen: number; // D - T (along the depth)
  rollLen: number; // D (along the depth)
  lidD: number; // D + 3T
  tuckH: number; // min(tuckFlapMm, H - T)
  tuckW: number; // W - 2T
  tuckR: number; // min(8, 0.4 * tuckH)
  lidFlapDepth: number; // H - T (0 when flaps off)
  lidFlapLen: number; // D - T
  earW: number; // min(H, D/2 - T)
  earBackH: number; // H - 2T: backH less an ear inset (1.5T) at each crease
  earFrontH: number; // frontH - 2 * earInset = H - 2.5T
  /** chamferEff = min(chamfer, depth, len / 2): the chamfer actually cut on the tab's free corners */
  tab: { len: number; depth: number; centers: [number, number]; chamfer: 4; chamferEff: number };
  /**
   * centerFromCrease = roll: the inner wall's mid-plane, measured from the floor's side crease.
   * inset = centerFromCrease - width/2: the slot's edge nearest the side crease.
   */
  slot: { len: number; width: number; centerFromCrease: number; inset: number };
  /** null for the 'tuck' lock style, or when the board is too thin for the lock ears */
  lock: { tabW: number; tabLen: number; slitLen: number } | null;
  /** Why a requested front lock fell back to a tuck top; null otherwise */
  lockNote: string | null;
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
 * Insets shared by the perimeter, the creases and the rig: ears and inner wall 1.5T, roll strip T,
 * lid flaps 2T back from the lid's front edge (so in 3D they end flush with the tuck flap's back face).
 */
const insetsFor = (T: number) => ({ earInset: 1.5 * T, innerInset: 1.5 * T, rollInset: T, lidFlapSetback: 2 * T });

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
  const roll = 2 * T;
  const { earInset } = insetsFor(T);

  const floorW = W + T + 2 * roll + (params.includeLidFlaps ? 2 * T : 0);
  const floorD = D + 2 * T;
  const backH = H + T;
  const frontH = H + T / 2;
  const outerSideH = H;
  const innerSideH = Math.max(8, H - T / 2);
  const lidD = D + 3 * T;
  const tuckH = Math.min(params.tuckFlapMm, H - T);
  const tuckW = W - 2 * T;
  const tuckR = Math.min(8, 0.4 * tuckH);
  const lidFlapDepth = params.includeLidFlaps ? H - T : 0;
  const earW = Math.min(H, D / 2 - T);

  const tabLen = clamp(D / 4, 14, 26);
  const tabDepth = Math.min(T + 5, innerSideH - 2);
  const tabChamfer = 4;
  const tab: MailerSpans['tab'] = {
    len: tabLen,
    depth: tabDepth,
    centers: [0.25, 0.75],
    chamfer: tabChamfer,
    chamferEff: Math.min(tabChamfer, tabDepth, tabLen / 2),
  };
  // The slot is centred under the inner wall's mid-plane, which sits `roll` in from the side crease.
  const slotWidth = T + 0.5;
  const slot: MailerSpans['slot'] = {
    len: tab.len + 1,
    width: slotWidth,
    centerFromCrease: roll,
    inset: roll - slotWidth / 2,
  };

  let lock: MailerSpans['lock'] = null;
  let lockNote: string | null = null;
  if (params.cardboardLockStyle === 'front-lock') {
    // Sideways room runs from the tuck flap's edge to the outer side wall's inner face: roll + T.
    const upper = roll + T;
    // lockTabWidthMm is a ceiling, not a target. The 8 mm floor applies only when 8 mm fits.
    const capped = Math.min(params.lockTabWidthMm, upper);
    const tabW = upper >= 8 ? Math.max(8, capped) : Math.max(0, capped);
    // Keep at least 3 mm of front ear crease attached above the slit on low boxes.
    const slitLen = Math.min(clamp(params.lockTabDepthMm, 12, tuckH) + 1, frontH - earInset - 3);
    const tabLen = Math.max(0, Math.min(clamp(params.lockTabDepthMm, 12, tuckH), slitLen - 1));
    // Under 2 mm the ear cannot be cut: fall back to a tuck top (no slits, full ear crease, thumb notch).
    if (tabW < 2) lockNote = 'board too thin for lock ears';
    else lock = { tabW, tabLen, slitLen };
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
    earBackH: backH - 2 * earInset,
    earFrontH: frontH - 2 * earInset,
    tab,
    slot,
    lock,
    lockNote,
    notchR,
    x,
    y,
    blankW,
    blankH: y.frontBottom,
  };
}

const rectPoints = (x: number, y: number, w: number, h: number): Point2D[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

/** The lock tab as cut on the tuck flap: null for the tuck style or when too small to cut. */
const cutLockTab = (s: MailerSpans) => (s.lock && s.lock.tabLen >= 4 && s.lock.tabW >= 2 ? s.lock : null);

/**
 * The four floor slots in floor-local coordinates (x from the left side crease, y from the back
 * crease), each `slot.width × slot.len`. Shared by the 2D sheet and the 3D floor.
 */
function floorSlotRects(s: MailerSpans): { id: string; x: number; y: number }[] {
  return s.tab.centers.flatMap((c, i) => {
    const y = c * s.floorD - s.slot.len / 2;
    return [
      { id: `l-${i + 1}`, x: s.slot.inset },
      { id: `r-${i + 1}`, x: s.floorW - s.slot.inset - s.slot.width },
    ].map((r) => ({ ...r, y }));
  });
}

/** A perimeter vertex; `q` is the control point of a quadratic arriving at it, `arc` an arc arriving at it. */
interface PerimNode {
  x: number;
  y: number;
  q?: { x: number; y: number };
  arc?: { r: number; sweep: 0 | 1 };
}

/**
 * The tuck flap's right edge, from its free edge at `top` down to its root crease at `root`,
 * with the front-lock tab when one is cut. `tx1` is the flap's right edge. Shared by the 2D
 * perimeter and the 3D tuck flap.
 */
function tuckFlapRightHalf(s: MailerSpans, tx1: number, top: number, root: number): PerimNode[] {
  const nodes: PerimNode[] = [];
  const lockTab = cutLockTab(s);
  const tabTop = lockTab ? root - lockTab.tabLen : root;
  const rc = lockTab ? Math.max(0, Math.min(s.tuckR, tabTop - top)) : s.tuckR;
  nodes.push({ x: tx1 - rc, y: top });
  if (rc > 0) nodes.push({ x: tx1, y: top + rc, q: { x: tx1, y: top } });
  if (lockTab) {
    const { tabW, tabLen } = lockTab;
    // Root edge tilts 15° off the perpendicular to the flap's side edge.
    const rootDrop = tabW * Math.tan((15 * Math.PI) / 180);
    const rt = Math.max(0, Math.min(4, tabW, tabLen - rootDrop));
    const ox = tx1 + tabW;
    nodes.push({ x: tx1, y: tabTop });
    nodes.push({ x: ox - rt, y: tabTop });
    if (rt > 0) nodes.push({ x: ox, y: tabTop + rt, q: { x: ox, y: tabTop } });
    nodes.push({ x: ox, y: root - rootDrop });
  }
  nodes.push({ x: tx1, y: root });
  return nodes;
}

/** Mirror a right half across `x = cx` and reverse it: the curve arriving at right[i] arrives at mirror(right[i-1]). */
function mirrorLeft(right: PerimNode[], cx: number): PerimNode[] {
  const mx = (v: number) => 2 * cx - v;
  const k = right.length - 1;
  return right.map((_, j) => {
    const n = right[k - j];
    const arriving = j > 0 ? right[k - j + 1].q : undefined;
    return { x: mx(n.x), y: n.y, q: arriving ? { x: mx(arriving.x), y: arriving.y } : undefined };
  });
}

/** A closed loop of perimeter nodes as polygon points, each quadratic sampled in `steps` segments. */
function loopPoints(loop: PerimNode[], steps = 4): Point2D[] {
  const pts: Point2D[] = [];
  let prev = loop[loop.length - 1];
  for (const n of loop) {
    if (n.q) {
      for (let i = 1; i < steps; i++) {
        const u = i / steps;
        const a = (1 - u) * (1 - u);
        const b = 2 * u * (1 - u);
        const c = u * u;
        pts.push({ x: a * prev.x + b * n.q.x + c * n.x, y: a * prev.y + b * n.q.y + c * n.y });
      }
    }
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(n.x - last.x, n.y - last.y) > 1e-6) pts.push({ x: n.x, y: n.y });
    prev = n;
  }
  const [first, last] = [pts[0], pts[pts.length - 1]];
  if (pts.length > 1 && Math.hypot(first.x - last.x, first.y - last.y) <= 1e-6) pts.pop();
  return pts;
}

/**
 * The right half of the perimeter, clockwise from the tuck flap's top edge down to the
 * front wall's bottom-right corner at (floorR, frontBottom).
 */
function rightHalfPerimeter(s: MailerSpans): PerimNode[] {
  const { T, x, y } = s;
  const { earInset, innerInset, rollInset } = insetsFor(T);
  const fr = x.floorR;
  const tx1 = fr - (s.floorW - s.tuckW) / 2;
  const nodes: PerimNode[] = [];

  // Tuck flap, with a lock tab on its side edge for the front lock (omitted when too small to cut).
  nodes.push(...tuckFlapRightHalf(s, tx1, y.tuckTop, y.lidTop));

  // Lid right edge with the lid flap.
  nodes.push({ x: fr, y: y.lidTop });
  if (s.lidFlapDepth > 0) {
    const fy0 = y.lidTop + insetsFor(T).lidFlapSetback;
    const fy1 = fy0 + s.lidFlapLen;
    const fx = fr + s.lidFlapDepth;
    const ch = Math.min(4, s.lidFlapDepth, s.lidFlapLen);
    // Lead-in chamfer on the flap's front end (nearest lidTop), which swings into the box first.
    nodes.push({ x: fr, y: fy0 }, { x: fx - ch, y: fy0 }, { x: fx, y: fy0 + ch }, { x: fx, y: fy1 }, { x: fr, y: fy1 });
  }
  nodes.push({ x: fr, y: y.backTop });

  // Dust ear on a wall row, inset earInset from the row's top crease, 3 mm chamfers on the free corners.
  const ear = (rowTop: number, earH: number) => {
    const e0 = rowTop + earInset;
    const e1 = e0 + earH;
    if (s.earW <= 0 || earH <= 0) return;
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
  ear(y.backTop, s.earBackH);
  nodes.push({ x: fr, y: y.floorTop });

  // Side column: outer wall full floorD, roll inset T, inner wall inset 1.5T, two chamfered tabs.
  nodes.push(
    { x: x.outerR, y: y.floorTop },
    { x: x.outerR, y: y.floorTop + rollInset },
    { x: x.rollR, y: y.floorTop + rollInset },
    { x: x.rollR, y: y.floorTop + innerInset },
    { x: x.innerR, y: y.floorTop + innerInset },
  );
  const ch = s.tab.chamferEff;
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
    { x: x.innerR, y: y.frontTop - innerInset },
    { x: x.rollR, y: y.frontTop - innerInset },
    { x: x.rollR, y: y.frontTop - rollInset },
    { x: x.outerR, y: y.frontTop - rollInset },
    { x: x.outerR, y: y.frontTop },
    { x: fr, y: y.frontTop },
  );

  ear(y.frontTop, s.earFrontH);
  nodes.push({ x: fr, y: y.frontBottom });
  return nodes;
}

function perimeterPath(s: MailerSpans): string {
  const right = rightHalfPerimeter(s);
  const cx = (s.x.floorL + s.x.floorR) / 2;
  const k = right.length - 1;
  const left = mirrorLeft(right, cx);

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
export function buildMailerSheet(spans: MailerSpans, params: BoxParameters): BoxPanel2D {
  const s = spans;
  const { T, x, y } = s;
  const { earInset, innerInset, rollInset } = insetsFor(T);
  const fl = x.floorL;
  const fr = x.floorR;
  const paths: DielinePath[] = [{ id: 'mailer-perimeter-cut', layer: 'cut', d: perimeterPath(s), closed: true }];

  // Floor slots that take the inner wall's tabs.
  for (const r of floorSlotRects(s)) {
    const d = pointsToSvgPath(rectPoints(fl + r.x, y.floorTop + r.y, s.slot.width, s.slot.len));
    paths.push({ id: `mailer-slot-${r.id}`, layer: 'cut', d, closed: true });
  }

  // Front lock: a slit down each front ear crease, starting where the perimeter leaves the crease.
  if (s.lock && s.lock.slitLen > earInset) {
    const slit = (sx: number) =>
      pointsToSvgPath(
        [
          { x: sx, y: y.frontBottom - earInset },
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
  const frontEarTop = y.frontTop + earInset;
  const frontEarEnd = s.lock ? y.frontBottom - s.lock.slitLen : frontEarTop + s.earFrontH;
  for (const [side, edge, outer, roll] of [
    ['l', fl, x.outerL, x.rollL],
    ['r', fr, x.outerR, x.rollR],
  ] as const) {
    const fy0 = y.lidTop + insetsFor(T).lidFlapSetback;
    if (s.lidFlapDepth > 0) vertical(`score-lid-flap-${side}`, edge, fy0, fy0 + s.lidFlapLen);
    vertical(`score-ear-back-${side}`, edge, y.backTop + earInset, y.backTop + earInset + s.earBackH);
    scores.push([`score-ear-front-${side}`, edge, frontEarTop, edge, frontEarEnd]);
    vertical(`score-floor-side-${side}`, edge, y.floorTop, y.frontTop);
    vertical(`score-roll-${side}-1`, outer, y.floorTop + rollInset, y.frontTop - rollInset);
    vertical(`score-roll-${side}-2`, roll, y.floorTop + innerInset, y.frontTop - innerInset);
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

/**
 * The closed mailer's outside size: the floor span plus half an outer wall each side across;
 * the lid (D + 3T) front to back; floor mid-plane to lid mid-plane (backH) plus half a ply each, top and bottom.
 */
const mailerOuterDims = (s: MailerSpans): BoxDims => ({
  widthMm: s.floorW + s.T,
  depthMm: s.lidD,
  heightMm: s.backH + s.T,
});

/** The closure the sheet actually cuts: `front lock, 4.5 mm ears` or `tuck top (board too thin for lock ears)`. */
function closureLabel(s: MailerSpans): string {
  if (s.lock) return `front lock, ${fmt(s.lock.tabW)} mm ears`;
  return s.lockNote ? `tuck top (${s.lockNote})` : 'tuck top';
}

export function generateMailerBox(
  params: BoxParameters,
  W: number,
  D: number,
  H: number,
): { panels2D: BoxPanel2D[]; panels3D: Panel3DTransform[]; summary: string; outerDims: BoxDims } {
  const spans = computeMailerSpans(params, W, D, H);
  return {
    panels2D: [buildMailerSheet(spans, params)],
    panels3D: buildMailerRig(spans, H),
    summary: `Roll-end mailer (${fmt(spans.blankW)} × ${fmt(spans.blankH)} mm blank, ${closureLabel(spans)})`,
    outerDims: mailerOuterDims(spans),
  };
}

/** Where a panel's centre lies with every fold in its chain at `flatAngleRad`: its place on the flat blank. */
function flatPosition(p: Panel3DTransform, byId: Map<string, Panel3DTransform>): [number, number, number] {
  let [x, y, z] = p.closedPos;
  let cur: Panel3DTransform | undefined = p;
  while (cur?.foldRig) {
    const { pivotOffset, axis, flatAngleRad, parentId }: NonNullable<Panel3DTransform['foldRig']> = cur.foldRig;
    const [px, py, pz] = pivotOffset;
    const [rx, ry, rz] = [x - px, y - py, z - pz];
    const c = Math.cos(flatAngleRad);
    const s = Math.sin(flatAngleRad);
    if (axis === 'x') [y, z] = [py + ry * c - rz * s, pz + ry * s + rz * c];
    else if (axis === 'y') [x, z] = [px + rx * c + rz * s, pz - rx * s + rz * c];
    else [x, y] = [px + rx * c - ry * s, py + rx * s + ry * c];
    cur = parentId ? byId.get(parentId) : undefined;
  }
  return [x, y, z];
}

/**
 * The roll-end mailer's 3D fold rig, built from the same ply-model spans as the 2D sheet.
 *
 * Every pivot sits where the parent's and the child's mid-planes meet, so with every fold
 * at `flatAngleRad` the whole rig lies in the floor's mid-plane. The floor's mid-plane is at
 * `y = −H/2` (the plane the flat blank lies in); the floor top is `T/2` above it and the lid
 * underside is `H` above the floor top. Inner walls' inner faces sit at `x = ±W/2` (±(W/2 + T)
 * with lid flaps, which tuck inside them); the back wall's inner face and the tuck flap's inner
 * face are `D` apart.
 */
export function buildMailerRig(spans: MailerSpans, H: number): Panel3DTransform[] {
  const s = spans;
  const { T } = s;
  const hp = Math.PI / 2;

  // Mid-planes, all from the spans.
  const yFloor = -H / 2;
  const yLid = yFloor + s.backH; // the back wall reaches from the floor's mid-plane to the lid's
  const yRoll = yFloor + s.outerSideH; // roll bridge mid-plane, T below the lid mid-plane: top meets lid underside
  const yBack = yFloor + s.backH / 2;
  const yFront = yFloor + s.frontH / 2;
  const xOuter = s.floorW / 2; // outer wall straddles the floor's side crease
  const xEar = xOuter - T; // dust ear, just inside the outer wall
  const xInner = xOuter - s.roll; // inner wall: W/2 + T/2, or W/2 + 3T/2 with lid flaps
  const zBack = -s.floorD / 2;
  const zFront = s.floorD / 2;
  const zTuck = zFront - T; // tuck flap, just inside the front wall
  const zLidBack = zBack - T / 2; // lid runs lidD forward from the back wall's outer face
  const zLidFront = zLidBack + s.lidD;

  // Floor: slots match the 2D sheet. Rotation +π/2 about x puts local y=0 at the front edge.
  const floorHoles = floorSlotRects(s).map((r) =>
    rectPoints(r.x, s.floorD - r.y - s.slot.len, s.slot.width, s.slot.len),
  );

  // Inner wall with its two tabs past the free (bottom) edge. Local x runs back to front on
  // the left wall (−π/2 about y) and front to back on the right (+π/2).
  const innerOutline = (sx: number): Point2D[] => {
    const w = s.innerSideLen;
    const h = s.innerSideH;
    const { len, depth } = s.tab;
    const ch = s.tab.chamferEff;
    const centers = floorSlotRects(s)
      .filter((r) => r.id.startsWith('l-'))
      .map((r) => {
        const z = zBack + r.y + s.slot.len / 2;
        return sx < 0 ? w / 2 + z : w / 2 - z;
      })
      .sort((a, b) => b - a);
    const pts: Point2D[] = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
    ];
    for (const pc of centers) {
      const t0 = pc - len / 2;
      const t1 = pc + len / 2;
      pts.push(
        { x: t1, y: h },
        { x: t1, y: h + depth - ch },
        { x: t1 - ch, y: h + depth },
        { x: t0 + ch, y: h + depth },
        { x: t0, y: h + depth - ch },
        { x: t0, y: h },
      );
    }
    pts.push({ x: 0, y: h });
    return pts;
  };

  // Tuck flap with the front-lock ears, the same shape as the sheet. The sheet runs from the free
  // edge (y = 0) to the root (y = tuckH); in 3D the root is the top edge, so y flips.
  const tuckRight = tuckFlapRightHalf(s, s.tuckW / 2, 0, s.tuckH);
  const tuckOutline = loopPoints([...tuckRight, ...mirrorLeft(tuckRight, 0)]).map((p) => ({
    x: p.x + s.tuckW / 2,
    y: s.tuckH - p.y,
  }));

  const panels: Panel3DTransform[] = [];
  const add = (p: Omit<Panel3DTransform, 'thicknessMm' | 'explodedPos'>) =>
    panels.push({ ...p, thicknessMm: T, explodedPos: p.closedPos });
  const sides = [
    ['l', 'Left', -1],
    ['r', 'Right', 1],
  ] as const;

  add({
    id: 'bottom',
    name: 'Bottom Floor',
    faceId: 'bottom',
    widthMm: s.floorW,
    heightMm: s.floorD,
    color: '#c69c6d',
    closedPos: [0, yFloor, 0],
    rotation: [hp, 0, 0],
    outlinePoints: rectPoints(0, 0, s.floorW, s.floorD),
    holeContours: floorHoles,
  });
  add({
    id: 'front',
    name: 'Front Wall',
    faceId: 'front',
    widthMm: s.floorW,
    heightMm: s.frontH,
    color: '#d1a778',
    closedPos: [0, yFront, zFront],
    rotation: [0, 0, 0],
    foldRig: { pivotOffset: [0, yFloor, zFront], axis: 'x', flatAngleRad: hp, foldedAngleRad: 0, stage: [0, 0.22] },
  });
  add({
    id: 'back',
    name: 'Back Spine',
    faceId: 'back',
    widthMm: s.floorW,
    heightMm: s.backH,
    color: '#d1a778',
    closedPos: [0, yBack, zBack],
    rotation: [0, Math.PI, 0],
    foldRig: { pivotOffset: [0, yFloor, zBack], axis: 'x', flatAngleRad: -hp, foldedAngleRad: 0, stage: [0, 0.22] },
  });

  // Dust ears fold in about a vertical axis, landing between the outer and inner walls.
  // Each ear is as tall as the sheet cuts it: earBackH and earFrontH from the spans.
  for (const [wall, wallName, z, y, dir, earH] of [
    ['back', 'Back', zBack, yBack, 1, s.earBackH],
    ['front', 'Front', zFront, yFront, -1, s.earFrontH],
  ] as const) {
    if (s.earW > 0 && earH > 0) {
      for (const [side, sideName, sx] of sides) {
        add({
          id: `${wall}-dust-${side}`,
          name: `${sideName} ${wallName} Dust Flap`,
          faceId: wall,
          widthMm: s.earW,
          heightMm: earH,
          color: '#b88c5d',
          closedPos: [sx * xEar, y, z + (dir * s.earW) / 2],
          rotation: [0, sx * hp, 0],
          foldRig: {
            parentId: wall,
            pivotOffset: [sx * xEar, y, z],
            axis: 'y',
            flatAngleRad: dir * sx * hp,
            foldedAngleRad: 0,
            stage: [0.22, 0.4],
          },
        });
      }
    }
  }

  // Side columns: outer wall, roll bridge, inner wall with tabs.
  for (const [side, sideName, sx] of sides) {
    const wall = side === 'l' ? 'left' : 'right';
    add({
      id: wall,
      name: `${sideName} Outer Wall`,
      faceId: wall,
      widthMm: s.floorD,
      heightMm: s.outerSideH,
      color: '#bc9162',
      closedPos: [sx * xOuter, yFloor + s.outerSideH / 2, 0],
      rotation: [0, sx * hp, 0],
      foldRig: { pivotOffset: [sx * xOuter, yFloor, 0], axis: 'z', flatAngleRad: -sx * hp, foldedAngleRad: 0, stage: [0.3, 0.52] },
    });
    add({
      id: `${wall}-roll-bridge`,
      name: `${sideName} Rollover Top Bridge`,
      faceId: wall,
      widthMm: s.roll,
      heightMm: s.rollLen,
      color: '#b38758',
      closedPos: [sx * (xOuter - s.roll / 2), yRoll, 0],
      rotation: [hp, 0, 0],
      foldRig: {
        parentId: wall,
        pivotOffset: [sx * xOuter, yRoll, 0],
        axis: 'z',
        flatAngleRad: -sx * hp,
        foldedAngleRad: 0,
        stage: [0.48, 0.66],
      },
    });
    add({
      id: `${wall}-roll-inner`,
      name: `${sideName} Inner Rollover Wall`,
      faceId: wall,
      widthMm: s.innerSideLen,
      heightMm: s.innerSideH,
      color: '#ab7f50',
      closedPos: [sx * xInner, yRoll - s.innerSideH / 2, 0],
      rotation: [0, sx * hp, 0],
      outlinePoints: innerOutline(sx),
      foldRig: {
        parentId: `${wall}-roll-bridge`,
        pivotOffset: [sx * xInner, yRoll, 0],
        axis: 'z',
        flatAngleRad: -sx * hp,
        foldedAngleRad: 0,
        stage: [0.54, 0.74],
      },
    });
  }

  add({
    id: 'top',
    name: 'Mailer Lid Top',
    faceId: 'top',
    widthMm: s.floorW,
    heightMm: s.lidD,
    color: '#dbb386',
    closedPos: [0, yLid, (zLidBack + zLidFront) / 2],
    rotation: [-hp, 0, 0],
    foldRig: {
      parentId: 'back',
      pivotOffset: [0, yLid, zBack],
      axis: 'x',
      flatAngleRad: -hp,
      foldedAngleRad: 0,
      stage: [0.6, 0.86],
    },
  });

  // Lid side flaps start 2T behind the lid's front edge, as on the sheet, and hang straight down
  // inside the inner walls, outer face against the inner wall's inner face. The 3D hinge sits on
  // the flap's mid-plane (so the flat rig stays in the floor plane), not at the lid's side edge.
  if (s.lidFlapDepth > 0) {
    const xLidFlap = xInner - T; // W/2 + T/2
    const z = zLidFront - insetsFor(T).lidFlapSetback - s.lidFlapLen / 2;
    for (const [side, sideName, sx] of sides) {
      add({
        id: `lid-flap-${side}`,
        name: `${sideName} Lid Flap`,
        faceId: `lid-flap-${side}`,
        widthMm: s.lidFlapLen,
        heightMm: s.lidFlapDepth,
        color: '#c9a073',
        closedPos: [sx * xLidFlap, yLid - s.lidFlapDepth / 2, z],
        rotation: [0, sx * hp, 0],
        foldRig: {
          parentId: 'top',
          pivotOffset: [sx * xLidFlap, yLid, z],
          axis: 'z',
          flatAngleRad: sx * hp,
          foldedAngleRad: 0,
          stage: [0.5, 0.64],
        },
      });
    }
  }

  add({
    id: 'tuck-flap',
    name: 'Inner Tuck Flap (Inside Front Wall)',
    faceId: 'tuck-flap',
    widthMm: s.tuckW,
    heightMm: s.tuckH,
    color: '#b5895a',
    closedPos: [0, yLid - s.tuckH / 2, zTuck],
    rotation: [0, 0, 0],
    outlinePoints: tuckOutline,
    foldRig: {
      parentId: 'top',
      pivotOffset: [0, yLid, zTuck],
      axis: 'x',
      flatAngleRad: -hp,
      foldedAngleRad: 0,
      stage: [0.5, 0.7],
    },
  });

  const byId = new Map(panels.map((p) => [p.id, p]));
  return panels.map((p) => ({ ...p, explodedPos: flatPosition(p, byId) }));
}
