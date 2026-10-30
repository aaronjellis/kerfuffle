/**
 * Living-hinge test cards: one card per pattern, laid out like a laser material-test matrix. Each
 * card carries three hinge zones that step one setting under, at and over the pattern's default,
 * each zone headed by an engraved line with its settings and estimated bend, and solid wood between
 * zones so each one bends on its own. A hole in one corner bolts the set into a swatch fan.
 */
import type { BoxPanel2D, BoxParameters, DielinePath, GeneratedBoxModel, Panel3DTransform, Point2D } from './types';
import { assembleModel } from './boxGenerator';
import { pointsToSvgPath } from './fingerJointEngine';
import {
  HINGE_PITCH_RANGE_MM,
  MIN_HINGE_BRIDGE_MM,
  MIN_HINGE_CUT_MM,
  hingeBendRadiusMm,
  hingeCuts,
  hingePatternInfo,
  hingeShapePath,
  type HingePatternId,
  type HingePatternSettings,
} from './livingHinge';
import { buildRoundedRectPoints } from './roundedRect';
import { buildSingleStrokeTextPath } from './vectorFont';

export const CARD_WIDTH_MM = 50;
export const CARD_HEIGHT_MM = 130;
const CORNER_R = 3;
/** The bolt hole: an M5 bolt passes with a little play. */
export const CARD_HOLE_D_MM = 5.4;
/** The hole's centre, from the card's top-left corner. */
export const CARD_HOLE_AT: Point2D = { x: 8, y: 8 };
/** The header band with the hole, the pattern's name and the sheet. */
export const CARD_HEADER_MM = 16;
/** Each zone's engraved settings line, on solid wood above its cuts. */
export const ZONE_LABEL_MM = 7;
/** Each zone's cuts. */
export const ZONE_HINGE_MM = 29;
const CARD_FOOT_MM = CARD_HEIGHT_MM - CARD_HEADER_MM - 3 * (ZONE_LABEL_MM + ZONE_HINGE_MM);

/** The setting a card's three zones step through. */
export type HingeCardVary = 'pitch' | 'cut' | 'bridge';
export const ZONE_LETTERS = ['A', 'B', 'C'] as const;
/** Each zone's share of the default; B is the pattern's default. */
const ZONE_STEPS: Record<HingeCardVary, [number, number, number]> = {
  pitch: [0.8, 1, 1.3],
  cut: [0.75, 1, 1.25],
  bridge: [0.7, 1, 1.4],
};

export interface HingeCardSet {
  pattern: HingePatternId;
  /** Zones A, B and C, top to bottom. */
  zones: HingePatternSettings[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** One card per pattern, its zones stepping `vary` under, at and over the pattern's default. */
export function hingeCardSets(patterns: HingePatternId[], vary: HingeCardVary): HingeCardSet[] {
  const [lo, hi] = HINGE_PITCH_RANGE_MM;
  return patterns.map((pattern) => {
    const info = hingePatternInfo(pattern);
    const base: HingePatternSettings = { pattern, ...info.defaults };
    // A pattern without a slit length steps its row spacing instead.
    const by = vary === 'cut' && !info.usesCut ? 'pitch' : vary;
    const zones = ZONE_STEPS[by].map((k) =>
      by === 'pitch'
        ? { ...base, pitchMm: Math.min(hi, Math.max(lo, round1(base.pitchMm * k))) }
        : by === 'cut'
          ? { ...base, cutMm: Math.max(MIN_HINGE_CUT_MM, Math.round(base.cutMm * k)) }
          : { ...base, bridgeMm: Math.max(MIN_HINGE_BRIDGE_MM, round1(base.bridgeMm * k)) },
    );
    return { pattern, zones };
  });
}

const num = (v: number) => Number(v.toFixed(2)).toString();

/**
 * A zone's engraved line: its letter, spacing, slit and bridge in millimetres, and its estimated
 * bend radius. "A  SP 1.2  SL 30  BR 3  R11".
 */
export function hingeZoneLabel(zone: number, s: HingePatternSettings, thicknessMm: number, kerfMm: number): string {
  const bend = hingeBendRadiusMm(s, thicknessMm, kerfMm, CARD_WIDTH_MM);
  const r = Number.isFinite(bend) ? `R${Math.round(bend)}` : 'NO BEND';
  const slit = hingePatternInfo(s.pattern).usesCut ? `  SL ${num(s.cutMm)}` : '';
  return `${ZONE_LETTERS[zone]}  SP ${num(s.pitchMm)}${slit}  BR ${num(s.bridgeMm)}  ${r}`;
}

/** Where zone `i`'s settings line and cuts sit on the card. */
export function cardZone(i: number) {
  const top = CARD_HEADER_MM + i * (ZONE_LABEL_MM + ZONE_HINGE_MM);
  return {
    labelY: top + ZONE_LABEL_MM / 2,
    region: { x: 0, y: top + ZONE_LABEL_MM, width: CARD_WIDTH_MM, height: ZONE_HINGE_MM },
  };
}

const circle = (c: Point2D, r: number, n = 36): Point2D[] =>
  Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((i / n) * 2 * Math.PI), y: c.y + r * Math.sin((i / n) * 2 * Math.PI) }));

interface Card {
  panel2D: BoxPanel2D;
  outline: Point2D[];
  hole: Point2D[];
  slits: Point2D[][];
}

const text = (id: string, lines: string[], x: number, y: number, cap: number, maxW: number): DielinePath => ({
  id,
  layer: 'score',
  d: buildSingleStrokeTextPath(lines, { centerX: x, centerY: y, capHeightMm: cap, maxWidthMm: maxW }),
  closed: false,
});

function buildCard(index: number, set: HingeCardSet, T: number, kerfMm: number): Card {
  const id = `hinge-card-${index + 1}`;
  const outline = buildRoundedRectPoints(CARD_WIDTH_MM, CARD_HEIGHT_MM, CORNER_R);
  const hole = circle(CARD_HOLE_AT, CARD_HOLE_D_MM / 2);
  // The header's text sits right of the hole, centred in what's left of the band.
  const holeRight = CARD_HOLE_AT.x + CARD_HOLE_D_MM / 2;
  const headX = (holeRight + CARD_WIDTH_MM - 2) / 2;
  const headW = CARD_WIDTH_MM - 2 - holeRight - 2;
  const paths: DielinePath[] = [
    { id: `${id}-outline`, layer: 'cut', d: pointsToSvgPath(outline, true), closed: true },
    { id: `${id}-hole`, layer: 'cut', d: pointsToSvgPath(hole, true), closed: true },
    text(`${id}-name`, [hingePatternInfo(set.pattern).name], headX, 6, 3.6, headW),
    text(`${id}-sheet`, [`${num(T)} MM SHEET  KERF ${num(kerfMm)}`], headX, 12, 1.6, headW),
  ];
  const slits: Point2D[][] = [];
  set.zones.forEach((s, z) => {
    const { labelY, region } = cardZone(z);
    paths.push(text(`${id}-zone-${ZONE_LETTERS[z]}-label`, [hingeZoneLabel(z, s, T, kerfMm)], CARD_WIDTH_MM / 2, labelY, 2, CARD_WIDTH_MM - 5));
    hingeCuts(s, region).forEach((shape, k) => {
      paths.push({ id: `${id}-zone-${ZONE_LETTERS[z]}-slit-${k}`, layer: 'cut', d: hingeShapePath(shape), closed: false });
      slits.push(...shape);
    });
  });
  const panel2D: BoxPanel2D = {
    id,
    name: `Card ${index + 1}`,
    faceLabel: `${hingePatternInfo(set.pattern).name} card`,
    widthMm: CARD_WIDTH_MM,
    heightMm: CARD_HEIGHT_MM,
    safeRect: { x: 0, y: CARD_HEADER_MM, width: CARD_WIDTH_MM, height: CARD_HEIGHT_MM - CARD_HEADER_MM - CARD_FOOT_MM },
    sheetX: 0,
    sheetY: 0,
    paths,
  };
  return { panel2D, outline, hole, slits };
}

/** The fan's total sweep in 3D; each card turns an equal share of it about the bolt. */
const FAN_DEG = 110;

/**
 * The test cards on the sheet, and in 3D lying fanned about the bolt like a swatch book, card 1 on
 * the bottom. Opening the view lifts them apart.
 */
export function generateHingeCardsModel(params: BoxParameters, cards: HingeCardSet[]): GeneratedBoxModel {
  const T = params.materialThicknessMm;
  const built = cards.map((s, i) => buildCard(i, s, T, params.kerfMm));
  const step = cards.length > 1 ? Math.min(18, FAN_DEG / (cards.length - 1)) : 0;
  // The bolt, in the card's centred frame: x right, y up.
  const px = CARD_HOLE_AT.x - CARD_WIDTH_MM / 2;
  const py = -(CARD_HOLE_AT.y - CARD_HEIGHT_MM / 2);
  // Card i turns a_i in its own plane, then lies flat: plane (x, y) becomes world (x, −z).
  const turn = (i: number) => (-i * step * Math.PI) / 180;
  const flat = (a: number, x: number, y: number) => ({
    x: x * Math.cos(a) - y * Math.sin(a),
    z: -(x * Math.sin(a) + y * Math.cos(a)),
  });
  // The fan's footprint with the bolt at the origin; the fan is then centred on it.
  const corners = built.flatMap((_, i) =>
    [
      [0, 0],
      [CARD_WIDTH_MM, 0],
      [CARD_WIDTH_MM, CARD_HEIGHT_MM],
      [0, CARD_HEIGHT_MM],
    ].map(([x, y]) => flat(turn(i), x - CARD_HOLE_AT.x, -(y - CARD_HOLE_AT.y))),
  );
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minZ = Math.min(...corners.map((c) => c.z));
  const maxZ = Math.max(...corners.map((c) => c.z));
  const mid = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const panels3D: Panel3DTransform[] = built.map((c, i) => {
    const a = turn(i);
    // The card's centre sits off the bolt by the bolt's offset from the centre, turned.
    const centre = flat(a, -px, -py);
    const at = (lift: number): [number, number, number] => [centre.x - mid.x, (i + 0.5) * T + i * lift, centre.z - mid.z];
    return {
      id: c.panel2D.id,
      name: c.panel2D.name,
      faceId: c.panel2D.id,
      widthMm: CARD_WIDTH_MM,
      heightMm: CARD_HEIGHT_MM,
      thicknessMm: T,
      color: i % 2 === 0 ? '#d4ad7f' : '#c49a6c',
      closedPos: at(0),
      explodedPos: at(8),
      rotation: [-Math.PI / 2, 0, a],
      outlinePoints: c.outline,
      holeContours: [c.hole],
      surfaceLines: c.slits,
    };
  });
  const dims = { widthMm: maxX - minX, depthMm: maxZ - minZ, heightMm: Math.max(T, cards.length * T) };
  const names = cards.map((c) => hingePatternInfo(c.pattern).name);
  return assembleModel(
    params,
    dims,
    dims,
    built.map((c) => c.panel2D),
    panels3D,
    `Hinge test cards: ${cards.length} (${names.join(', ')})`,
    [],
  );
}
