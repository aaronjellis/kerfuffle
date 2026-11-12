/**
 * The book box: a box that looks like a hardcover book lying flat. One wrap piece is the back cover,
 * the spine and the front cover; living-hinge cuts in the spine strip let it curve round the page
 * block and let the front cover swing open. Four walls stand on the back cover: three show as the
 * page block's edges, the fourth stands behind the spine.
 *
 * World frame, closed: x from the spine to the fore edge, y up, z from the head (−) to the tail (+),
 * the outer box centred on the origin. The wrap's sheet frame (y down): x from the head to the tail;
 * down the sheet, the front cover (its fore edge on top), the spine strip, the back cover.
 */
import * as THREE from 'three';
import { bentPoint, partlyBent, type BendSegment } from './bentPanel';
import type { PatternFaceTarget } from './facePatterns';
import { computeOddFingerCount, livingHingeZoneCuts, pointsToSvgPath } from './fingerJointEngine';
import { hingeShapePath } from './livingHinge';
import { slotsFor, tabCentres, type TabRun } from './tabSlot';
import type { BoxDims, BoxPanel2D, BoxParameters, DielinePath, GeneratedBoxModel, Panel3DTransform, Point2D } from './types';
import { roundCorners } from './wineCarrier';

/** The covers' free corners are eased like a hardcover's. */
const COVER_CORNER_MM = 2;
export const BOOK_OVERHANG_MAX_MM = 10;
export const BOOK_PAGE_LINE_RANGE_MM: [number, number] = [0.8, 5];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The smallest cover overhang: enough sound wood outside the wall and pin slots. */
export const bookMinOverhangMm = (thicknessMm: number) => Math.max(3, thicknessMm);

/** The book's default face names, by face id. */
export const BOOK_FACE_NAMES: Record<string, string> = {
  top: 'Front cover',
  bottom: 'Back cover',
  spine: 'Spine',
  right: 'Fore edge',
  front: 'Tail',
  back: 'Head',
  'spine-wall': 'Spine wall',
};

export interface BookLayout {
  T: number;
  ovMm: number;
  /** Solid wood between the spine wall and the bend, so its slots keep clear of the hinge slits. */
  bandMm: number;
  /** Bend radius at mid-thickness, and the flat band between the two arcs (0 when full round). */
  radiusMm: number;
  flatBandMm: number;
  arcLengthMm: number;
  spineLengthMm: number;
  fullRound: boolean;
  /** One cover's length along the wrap, and the wrap's size on the sheet. */
  coverLengthMm: number;
  wrapWidthMm: number;
  wrapHeightMm: number;
  outer: BoxDims;
  /** World x of the page block's inner spine-side and fore-side faces, the outer box centred on 0. */
  innerX0: number;
  innerX1: number;
  /** Bend profile from the back cover's bend line to the front cover's. */
  spineSegments: BendSegment[];
}

export function bookLayout(params: BoxParameters, innerW: number, innerD: number, innerH: number): BookLayout {
  const T = params.materialThicknessMm;
  const ovMm = clamp(params.bookCoverOverhangMm, bookMinOverhangMm(T), Math.max(BOOK_OVERHANG_MAX_MM, bookMinOverhangMm(T)));
  const bandMm = Math.max(5, 1.5 * T);
  const full = (innerH + T) / 2;
  const asked = params.bookSpineRadiusMm;
  const radiusMm = asked > 0 ? clamp(asked, Math.min(T, full), full) : full;
  const flatBandRaw = innerH + T - 2 * radiusMm;
  const fullRound = flatBandRaw < 0.01;
  const flatBandMm = fullRound ? 0 : flatBandRaw;
  const arcLengthMm = (Math.PI * radiusMm) / 2;
  const spineLengthMm = 2 * arcLengthMm + flatBandMm;
  const coverLengthMm = innerW + 2 * T + ovMm + bandMm;
  const wrapWidthMm = innerD + 2 * T + 2 * ovMm;
  const outer: BoxDims = {
    widthMm: coverLengthMm + radiusMm + T / 2,
    depthMm: wrapWidthMm,
    heightMm: innerH + 2 * T,
  };
  const innerX1 = outer.widthMm / 2 - ovMm - T;
  const arc: BendSegment = { kind: 'arc', radiusMm, angleRad: Math.PI / 2 };
  return {
    T,
    ovMm,
    bandMm,
    radiusMm,
    flatBandMm,
    arcLengthMm,
    spineLengthMm,
    fullRound,
    coverLengthMm,
    wrapWidthMm,
    wrapHeightMm: 2 * coverLengthMm + spineLengthMm,
    outer,
    innerX0: innerX1 - innerW,
    innerX1,
    spineSegments: fullRound ? [arc, arc] : [arc, { kind: 'straight', lengthMm: flatBandMm }, arc],
  };
}

/**
 * The inside size of the book whose outside is the typed size. The spine's bulge grows with the
 * height, so the width's allowance isn't fixed: the height is solved first, then the width from it.
 */
export function bookInnerDims(params: BoxParameters, minInnerMm: number): BoxDims {
  const T = params.materialThicknessMm;
  const heightMm = Math.max(minInnerMm, params.heightMm - 2 * T);
  const probe = bookLayout(params, minInnerMm, minInnerMm, heightMm);
  return {
    widthMm: Math.max(minInnerMm, params.widthMm - (probe.outer.widthMm - minInnerMm)),
    depthMm: Math.max(minInnerMm, params.depthMm - (probe.outer.depthMm - minInnerMm)),
    heightMm,
  };
}

/** Tabs along a wall's foot: a run inset from both ends, its tabs shortened to fit a short wall. */
function footRun(fromMm: number, toMm: number): TabRun {
  const inset = Math.min(6, (toMm - fromMm) / 6);
  const a = fromMm + inset;
  const b = toMm - inset;
  const count = Math.max(1, Math.round((b - a) / 45));
  return { fromMm: a, toMm: b, count, tabMm: Math.min(12, (b - a) / (2 * count)) };
}

/** How many guide pins the fore-edge wall has room for: two, one on a short wall, none on a tiny one. */
export function bookPinCount(innerD: number, thicknessMm: number): number {
  const pin = Math.max(6, 2 * thicknessMm);
  return innerD >= 4 * pin ? 2 : innerD >= 2 * pin ? 1 : 0;
}

/** The guide pins' run along the fore-edge wall. */
function pinRun(params: BoxParameters, innerD: number, T: number): TabRun | null {
  if (!params.bookGuidePins) return null;
  const pin = Math.max(6, 2 * T);
  const count = bookPinCount(innerD, T);
  return count ? { fromMm: T, toMm: T + innerD, count, tabMm: pin } : null;
}

interface WallShape {
  outline: Point2D[];
  widthMm: number;
  heightMm: number;
  /** Where the wall's body (between the covers, inside the corner joints) sits in its frame. */
  body: { x: number; y: number; width: number; height: number };
  foot: TabRun;
}

/**
 * A page wall, y down, its top edge under the front cover. Its ends are finger joints up the
 * height: a wall that owns the corners keeps the first and last fingers, the other fills between.
 * Fingers are a kerf wider than their sockets, so the joint is snug once the laser has burnt both.
 * Tabs `T` deep hang from the foot into the back cover; pins, when given, stand `T` above the top.
 */
function wallShape(lengthMm: number, innerH: number, T: number, kerf: number, fingers: number, ownsCorners: boolean, pins: TabRun | null): WallShape {
  const halfK = kerf / 2;
  const top = pins ? T : 0;
  /** The left end's edge, top to bottom: x steps between the wall's end and one thickness in. */
  const leftEdge: Point2D[] = [];
  const xOf = (i: number) => ((i % 2 === 0) === ownsCorners ? 0 : T);
  leftEdge.push({ x: xOf(0), y: 0 });
  for (let i = 1; i < fingers; i++) {
    // The finger (the stretch at x = 0) grows half a kerf into its neighbour.
    const fingerAbove = xOf(i - 1) === 0;
    const y = (innerH * i) / fingers + (fingerAbove ? halfK : -halfK);
    leftEdge.push({ x: xOf(i - 1), y }, { x: xOf(i), y });
  }
  leftEdge.push({ x: xOf(fingers - 1), y: innerH });
  const rightEdge = leftEdge.map((p) => ({ x: lengthMm - p.x, y: p.y }));

  const foot = footRun(T, lengthMm - T);
  const pts: Point2D[] = [leftEdge[0]];
  if (pins) {
    const ease = Math.min(1, T / 3);
    for (const c of tabCentres(pins)) {
      const a = c - pins.tabMm / 2;
      const b = c + pins.tabMm / 2;
      pts.push({ x: a, y: 0 }, { x: a, y: -T + ease }, { x: a + ease, y: -T }, { x: b - ease, y: -T }, { x: b, y: -T + ease }, { x: b, y: 0 });
    }
  }
  pts.push(...rightEdge);
  for (const c of tabCentres(foot).reverse()) {
    const a = c + foot.tabMm / 2;
    const b = c - foot.tabMm / 2;
    pts.push({ x: a, y: innerH }, { x: a, y: innerH + T }, { x: b, y: innerH + T }, { x: b, y: innerH });
  }
  pts.push(...leftEdge.slice().reverse().slice(0, -1));
  return {
    outline: pts.map((p) => ({ x: p.x, y: p.y + top })),
    widthMm: lengthMm,
    heightMm: top + innerH + T,
    body: { x: T, y: top, width: lengthMm - 2 * T, height: innerH },
    foot,
  };
}

/** Page lines down a wall's body: one per spacing, clear of the top and bottom edges. */
function pageLines(params: BoxParameters, body: WallShape['body']): Point2D[][] {
  const sp = clamp(params.bookPageLineSpacingMm, BOOK_PAGE_LINE_RANGE_MM[0], BOOK_PAGE_LINE_RANGE_MM[1]);
  const lines: Point2D[][] = [];
  for (let y = sp; y <= body.height - sp + 1e-6; y += sp) {
    lines.push([
      { x: body.x, y: body.y + y },
      { x: body.x + body.width, y: body.y + y },
    ]);
  }
  return lines;
}

const hasPattern = (params: BoxParameters, faceId: string) => {
  const p = params.facePatterns[faceId];
  return p !== undefined && p.style !== 'none';
};

const rect = (x: number, y: number, w: number, h: number): Point2D[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

const eulerOf = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): [number, number, number] => {
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return [e.x, e.y, e.z];
};
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const neg = (v: THREE.Vector3) => v.clone().negate();
/** The back cover and the spine: sheet x to the tail, sheet up toward the spine, the outer face down. */
const WRAP_FOOT_ROTATION = eulerOf(Z, neg(X), neg(Y));

/** Where the spine strip's flat-panel centre sits: its foot is on the back cover's bend line. */
const spineClosedPos = (l: BookLayout, innerH: number): [number, number, number] => [
  l.outer.widthMm / 2 - l.coverLengthMm - l.spineLengthMm / 2,
  -(innerH + l.T) / 2,
  0,
];

function coverPose(l: BookLayout, innerH: number, share: number): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const segs = partlyBent(l.spineSegments, share);
  const end = bentPoint(segs, l.spineLengthMm, 0);
  const theta = segs.reduce((a, g) => a + (g.kind === 'arc' ? g.angleRad : 0), 0);
  const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(...WRAP_FOOT_ROTATION));
  // In the spine's frame: its foot, then along the bend to its end, then half a cover further on.
  const local = new THREE.Vector3(
    0,
    -l.spineLengthMm / 2 + end.y + (l.coverLengthMm / 2) * Math.cos(theta),
    end.z - (l.coverLengthMm / 2) * Math.sin(theta),
  );
  const position = local.applyQuaternion(base).add(new THREE.Vector3(...spineClosedPos(l, innerH)));
  const quaternion = base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(X, -theta));
  return { position, quaternion };
}

/** The front cover's position and orientation with the spine `share` of the way bent (0 flat, 1 closed). */
export function bookCoverPose(
  model: Pick<GeneratedBoxModel, 'params' | 'innerDims'>,
  share: number,
): { position: [number, number, number]; quaternion: [number, number, number, number] } {
  const { widthMm, depthMm, heightMm } = model.innerDims;
  const p = coverPose(bookLayout(model.params, widthMm, depthMm, heightMm), heightMm, clamp(share, 0, 1));
  return { position: [p.position.x, p.position.y, p.position.z], quaternion: [p.quaternion.x, p.quaternion.y, p.quaternion.z, p.quaternion.w] };
}

/** The turn that makes new artwork read upright on a face: the covers lie a quarter turn round on the wrap. */
export function bookFaceTurnDeg(params: Pick<BoxParameters, 'templateId'>, faceId: string): number {
  return params.templateId === 'finger-book' && (faceId === 'top' || faceId === 'bottom') ? -90 : 0;
}

/** Pattern targets for the covers: the page block's footprint on each, clear of every slot. */
export function bookPatternTargets(panels2D: BoxPanel2D[], panels3D: Panel3DTransform[]): PatternFaceTarget[] {
  const wrap = panels2D.find((p) => p.id === 'wrap');
  if (!wrap) return [];
  const safe = wrap.safeRect;
  const targets: PatternFaceTarget[] = [];
  for (const faceId of ['top', 'bottom'] as const) {
    const sub = wrap.subFaces?.find((s) => s.id === faceId);
    const p3 = panels3D.find((p) => p.id === faceId);
    if (!sub || !p3) continue;
    // The wrap's safe area is the front cover's footprint; the back cover's mirrors it down the wrap.
    const region = faceId === 'top' ? { ...safe } : { ...safe, y: wrap.heightMm - safe.y - safe.height };
    targets.push({
      faceId,
      panel2DId: wrap.id,
      region,
      panel3DId: p3.id,
      to3D: (p) => ({ x: region.x + p.x, y: region.y - sub.y + p.y }),
    });
  }
  return targets;
}

export function generateBookBox(
  params: BoxParameters,
  innerW: number,
  innerD: number,
  innerH: number,
): { panels2D: BoxPanel2D[]; panels3D: Panel3DTransform[]; fingerCountSummary: string; outerDims: BoxDims } {
  const l = bookLayout(params, innerW, innerD, innerH);
  const { T, ovMm: ov, bandMm: band, coverLengthMm: C, spineLengthMm: S, wrapWidthMm: wrapW, wrapHeightMm: wrapH } = l;
  const kerf = params.kerfMm;
  const fingers = computeOddFingerCount(innerH, params.fingerWidthMm);
  const pins = pinRun(params, innerD, T);

  // The walls. The tail and head walls run the block's full width and own the corners.
  const longLen = innerW + 2 * T;
  const sideLen = innerD + 2 * T;
  const walls: { id: string; shape: WallShape; pages: boolean }[] = [
    { id: 'front', shape: wallShape(longLen, innerH, T, kerf, fingers, true, null), pages: true },
    { id: 'back', shape: wallShape(longLen, innerH, T, kerf, fingers, true, null), pages: true },
    { id: 'right', shape: wallShape(sideLen, innerH, T, kerf, fingers, false, pins), pages: true },
    { id: 'spine-wall', shape: wallShape(sideLen, innerH, T, kerf, fingers, false, null), pages: false },
  ];

  // The wrap: slots in the back cover for every wall's tabs, slots in the front cover for the pins.
  const backTop = C + S;
  /** Sheet y on the back cover of the spine-side end of a tail or head wall. */
  const longY0 = backTop + band;
  const shift = (run: TabRun, by: number): TabRun => ({ ...run, fromMm: run.fromMm + by, toMm: run.toMm + by });
  const longFoot = walls[0].shape.foot;
  const sideFoot = walls[2].shape.foot;
  const slots: Point2D[][] = [
    ...slotsFor(shift(longFoot, longY0), ov + T / 2, T, kerf, false),
    ...slotsFor(shift(longFoot, longY0), wrapW - ov - T / 2, T, kerf, false),
    ...slotsFor(shift(sideFoot, ov), wrapH - ov - T / 2, T, kerf, true),
    ...slotsFor(shift(sideFoot, ov), backTop + band + T / 2, T, kerf, true),
  ];
  const pinSlots = pins ? slotsFor(shift(pins, ov), ov + T / 2, T, kerf, true) : [];

  // Hinge cuts: over the whole strip on a full-round spine, over each arc when a flat band parts them.
  const zones = l.fullRound
    ? [{ y: C, length: S }]
    : [
        { y: C, length: l.arcLengthMm },
        { y: C + l.arcLengthMm + l.flatBandMm, length: l.arcLengthMm },
      ];
  const hingeLines: Point2D[][] = zones.flatMap((z) =>
    livingHingeZoneCuts(params, wrapW, z.length).flatMap((shape) => shape.map((line) => line.map((p) => ({ x: p.x, y: p.y + z.y })))),
  );

  const wrapOutline = roundCorners(rect(0, 0, wrapW, wrapH), COVER_CORNER_MM);
  const footprint = { x: ov + T, y: ov + T, width: innerD, height: innerW };
  const closedPath = (id: string, pts: Point2D[]): DielinePath => ({ id, layer: 'cut', d: pointsToSvgPath(pts, true), closed: true });

  const panels2D: BoxPanel2D[] = [
    {
      id: 'wrap',
      name: 'Cover wrap',
      faceLabel: 'WRAP',
      widthMm: wrapW,
      heightMm: wrapH,
      safeRect: footprint,
      sheetX: 0,
      sheetY: 0,
      paths: [
        closedPath('wrap-outline', wrapOutline),
        ...slots.map((s, i) => closedPath(`wrap-slot-${i + 1}`, s)),
        ...pinSlots.map((s, i) => closedPath(`wrap-pin-slot-${i + 1}`, s)),
        ...hingeLines.map((line, i) => ({ id: `wrap-hinge-${i + 1}`, layer: 'cut' as const, d: hingeShapePath([line]), closed: false })),
      ],
      subFaces: [
        { id: 'top', name: BOOK_FACE_NAMES.top, x: 0, y: 0, width: wrapW, height: C },
        { id: 'bottom', name: BOOK_FACE_NAMES.bottom, x: 0, y: backTop, width: wrapW, height: C },
      ],
    },
  ];

  const wallLines = new Map<string, Point2D[][]>();
  for (const w of walls) {
    const lines = w.pages && params.bookPageLines && !hasPattern(params, w.id) ? pageLines(params, w.shape.body) : [];
    wallLines.set(w.id, lines);
    panels2D.push({
      id: w.id,
      name: BOOK_FACE_NAMES[w.id],
      faceLabel: BOOK_FACE_NAMES[w.id].toUpperCase(),
      widthMm: w.shape.widthMm,
      heightMm: w.shape.heightMm,
      safeRect: w.shape.body,
      sheetX: 0,
      sheetY: 0,
      paths: [
        closedPath(`${w.id}-outline`, w.shape.outline),
        ...lines.map((line, i) => ({ id: `${w.id}-page-${i + 1}`, layer: 'score' as const, d: pointsToSvgPath(line, false), closed: false })),
      ],
    });
  }

  // 3D. The wrap is three panels, each in its own stretch of the wrap's frame.
  const WRAP_COLOR = '#dfc195';
  const WALL_COLOR = '#cda676';
  const midY = (innerH + T) / 2;
  const down = (pts: Point2D[], by: number) => pts.map((p) => ({ x: p.x, y: p.y - by }));
  const closedCover = coverPose(l, innerH, 1);
  const coverEuler = new THREE.Euler().setFromQuaternion(closedCover.quaternion);
  const coverPos: [number, number, number] = [closedCover.position.x, closedCover.position.y, closedCover.position.z];
  const backPos: [number, number, number] = [l.outer.widthMm / 2 - C / 2, -midY, 0];
  const spinePos = spineClosedPos(l, innerH);
  const blockX = (l.innerX0 + l.innerX1) / 2;

  const panels3D: Panel3DTransform[] = [
    {
      id: 'bottom',
      name: BOOK_FACE_NAMES.bottom,
      faceId: 'bottom',
      widthMm: wrapW,
      heightMm: C,
      thicknessMm: T,
      color: WRAP_COLOR,
      closedPos: backPos,
      explodedPos: backPos,
      rotation: WRAP_FOOT_ROTATION,
      outlinePoints: roundCorners(rect(0, 0, wrapW, C), COVER_CORNER_MM, (p) => p.y > C / 2),
      holeContours: slots.map((s) => down(s, backTop)),
      patternSafe: true,
    },
    {
      // The spine is the hinge: it takes no artwork or pattern, so it isn't the `left` face.
      id: 'spine',
      name: BOOK_FACE_NAMES.spine,
      faceId: 'spine',
      widthMm: wrapW,
      heightMm: S,
      thicknessMm: T,
      color: WRAP_COLOR,
      closedPos: spinePos,
      explodedPos: spinePos,
      rotation: WRAP_FOOT_ROTATION,
      outlinePoints: rect(0, 0, wrapW, S),
      bend: { segments: l.spineSegments, lines: hingeLines.map((line) => down(line, C)) },
    },
    {
      id: 'top',
      name: BOOK_FACE_NAMES.top,
      faceId: 'top',
      widthMm: wrapW,
      heightMm: C,
      thicknessMm: T,
      color: WRAP_COLOR,
      closedPos: coverPos,
      explodedPos: coverPos,
      rotation: [coverEuler.x, coverEuler.y, coverEuler.z],
      outlinePoints: roundCorners(rect(0, 0, wrapW, C), COVER_CORNER_MM, (p) => p.y < C / 2),
      holeContours: pinSlots,
      patternSafe: true,
    },
  ];

  const pinTop = pins ? T : 0;
  const placed: Record<string, Pick<Panel3DTransform, 'closedPos' | 'rotation'>> = {
    front: { closedPos: [blockX, -T / 2, innerD / 2 + T / 2], rotation: [0, 0, 0] },
    back: { closedPos: [blockX, -T / 2, -(innerD / 2 + T / 2)], rotation: [0, Math.PI, 0] },
    right: { closedPos: [l.innerX1 + T / 2, (pinTop - T) / 2, 0], rotation: [0, Math.PI / 2, 0] },
    'spine-wall': { closedPos: [l.innerX0 - T / 2, -T / 2, 0], rotation: [0, -Math.PI / 2, 0] },
  };
  for (const w of walls) {
    const { closedPos, rotation } = placed[w.id];
    const lines = wallLines.get(w.id) ?? [];
    panels3D.push({
      id: w.id,
      name: BOOK_FACE_NAMES[w.id],
      faceId: w.id,
      widthMm: w.shape.widthMm,
      heightMm: w.shape.heightMm,
      thicknessMm: T,
      color: WALL_COLOR,
      closedPos,
      // The walls part outward from the page block's middle.
      explodedPos: [blockX + (closedPos[0] - blockX) * 1.6, closedPos[1], closedPos[2] * 1.6],
      rotation,
      outlinePoints: w.shape.outline,
      holeContours: [],
      patternSafe: true,
      ...(lines.length ? { surfaceLines: lines } : {}),
    });
  }

  return { panels2D, panels3D, fingerCountSummary: 'Book box: wrap on a tabbed page block', outerDims: l.outer };
}
