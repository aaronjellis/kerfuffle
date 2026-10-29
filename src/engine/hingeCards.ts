/**
 * Living-hinge test cards: one card per pattern, or per step of one setting, each engraved with its
 * settings and drilled at one corner so the set bolts together into a swatch fan.
 */
import type { BoxPanel2D, BoxParameters, DielinePath, GeneratedBoxModel, Panel3DTransform, Point2D } from './types';
import { assembleModel } from './boxGenerator';
import { pointsToSvgPath } from './fingerJointEngine';
import {
  hingeCuts,
  hingeMinWebMm,
  hingePatternInfo,
  hingeShapePath,
  type HingePatternId,
  type HingePatternSettings,
} from './livingHinge';
import { buildRoundedRectPoints } from './roundedRect';
import { buildSingleStrokeTextPath } from './vectorFont';

export const CARD_WIDTH_MM = 50;
export const CARD_HEIGHT_MM = 100;
const CORNER_R = 3;
/** The bolt hole: an M5 bolt passes with a little play. */
export const CARD_HOLE_D_MM = 5.4;
/** The hole's centre, from the card's top-left corner. */
export const CARD_HOLE_AT: Point2D = { x: 9, y: 9 };
/** The pattern fills the card's full width from here down, leaving a solid foot. */
export const CARD_PATTERN_TOP_MM = 25;
const CARD_FOOT_MM = 6;

/** What the set varies: nothing (one card per pattern), the pitch, or the bridge. */
export type HingeCardSweep = 'none' | 'pitch' | 'bridge';
const SWEEP_STEPS = [0.8, 1, 1.25];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Every card's settings, pattern by pattern, each at its defaults or stepped either side of them. */
export function hingeCardSettings(patterns: HingePatternId[], sweep: HingeCardSweep): HingePatternSettings[] {
  return patterns.flatMap((id) => {
    const info = hingePatternInfo(id);
    const base: HingePatternSettings = { pattern: id, ...info.defaults };
    if (sweep === 'none') return [base];
    const [lo, hi] = info.pitchRangeMm;
    const steps = SWEEP_STEPS.map((k) =>
      sweep === 'pitch'
        ? { ...base, pitchMm: Math.min(hi, Math.max(lo, round1(base.pitchMm * k))) }
        : { ...base, bridgeMm: Math.max(0.6, round1(base.bridgeMm * k)) },
    );
    // A step clamped onto its neighbour would make a duplicate card.
    return steps.filter((s, i) => i === 0 || s.pitchMm !== steps[i - 1].pitchMm || s.bridgeMm !== steps[i - 1].bridgeMm);
  });
}

const num = (v: number) => Number(v.toFixed(2)).toString();

/** The lines engraved on a card: its pattern, then its sizes. */
export function hingeCardLabel(s: HingePatternSettings): string[] {
  const info = hingePatternInfo(s.pattern);
  return [
    info.name,
    `${info.usesCut ? 'SPACING' : 'CELL'} ${num(s.pitchMm)}`,
    ...(info.usesCut ? [`SLIT ${num(s.cutMm)}`] : []),
    `BRIDGE ${num(s.bridgeMm)}`,
  ];
}

const circle = (c: Point2D, r: number, n = 36): Point2D[] =>
  Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((i / n) * 2 * Math.PI), y: c.y + r * Math.sin((i / n) * 2 * Math.PI) }));

/** The region of a card the pattern fills. */
export const cardPatternRegion = () => ({
  x: 0,
  y: CARD_PATTERN_TOP_MM,
  width: CARD_WIDTH_MM,
  height: CARD_HEIGHT_MM - CARD_PATTERN_TOP_MM - CARD_FOOT_MM,
});

interface Card {
  panel2D: BoxPanel2D;
  outline: Point2D[];
  hole: Point2D[];
  slits: Point2D[][];
}

function buildCard(index: number, s: HingePatternSettings, T: number, kerfMm: number): Card {
  const id = `hinge-card-${index + 1}`;
  const outline = buildRoundedRectPoints(CARD_WIDTH_MM, CARD_HEIGHT_MM, CORNER_R);
  const hole = circle(CARD_HOLE_AT, CARD_HOLE_D_MM / 2);
  const shapes = hingeCuts(s, cardPatternRegion());
  const [name, ...sizes] = hingeCardLabel(s);
  // Text sits right of the hole, centred in what's left of the label band.
  const textX = (CARD_HOLE_AT.x + CARD_HOLE_D_MM / 2 + CARD_WIDTH_MM - 2) / 2;
  const textW = CARD_WIDTH_MM - 2 - (CARD_HOLE_AT.x + CARD_HOLE_D_MM / 2) - 2;
  const nameCap = 3.6;
  const sizeCap = 2.2;
  const sizesH = sizes.length * sizeCap + (sizes.length - 1) * sizeCap * 0.45;
  const top = 3.5;
  const labels: DielinePath[] = [
    {
      id: `${id}-name`,
      layer: 'score',
      d: buildSingleStrokeTextPath([name], { centerX: textX, centerY: top + nameCap / 2, capHeightMm: nameCap, maxWidthMm: textW }),
      closed: false,
    },
    {
      id: `${id}-sizes`,
      layer: 'score',
      d: buildSingleStrokeTextPath(sizes, {
        centerX: textX,
        centerY: top + nameCap + 2 + sizesH / 2,
        capHeightMm: sizeCap,
        maxWidthMm: textW,
      }),
      closed: false,
    },
  ];
  const web = hingeMinWebMm(s, kerfMm);
  const panel2D: BoxPanel2D = {
    id,
    name: `Card ${index + 1}`,
    faceLabel: `${hingePatternInfo(s.pattern).name} card`,
    widthMm: CARD_WIDTH_MM,
    heightMm: CARD_HEIGHT_MM,
    safeRect: { x: 0, y: CARD_PATTERN_TOP_MM, width: CARD_WIDTH_MM, height: CARD_HEIGHT_MM - CARD_PATTERN_TOP_MM },
    sheetX: 0,
    sheetY: 0,
    paths: [
      { id: `${id}-outline`, layer: 'cut', d: pointsToSvgPath(outline, true), closed: true },
      { id: `${id}-hole`, layer: 'cut', d: pointsToSvgPath(hole, true), closed: true },
      ...shapes.map((shape, k) => ({ id: `${id}-slit-${k}`, layer: 'cut' as const, d: hingeShapePath(shape), closed: false })),
      ...labels,
      // The thickness, small, in the foot: cards from different sheets stay apart in the fan.
      {
        id: `${id}-thickness`,
        layer: 'score',
        d: buildSingleStrokeTextPath([`${num(T)} MM  WEB ${num(web)}`], {
          centerX: CARD_WIDTH_MM / 2,
          centerY: CARD_HEIGHT_MM - CARD_FOOT_MM / 2,
          capHeightMm: 1.8,
          maxWidthMm: CARD_WIDTH_MM - 8,
        }),
        closed: false,
      },
    ],
  };
  return { panel2D, outline, hole, slits: shapes.flat() };
}

/** The fan's total sweep in 3D; each card turns an equal share of it about the bolt. */
const FAN_DEG = 110;

/**
 * The test cards on the sheet, and in 3D lying fanned about the bolt like a swatch book, card 1 on
 * the bottom. Opening the view lifts them apart.
 */
export function generateHingeCardsModel(params: BoxParameters, cards: HingePatternSettings[]): GeneratedBoxModel {
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
  const names = [...new Set(cards.map((c) => hingePatternInfo(c.pattern).name))];
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
