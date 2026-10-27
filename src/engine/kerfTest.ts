import type { BoxPanel2D, BoxParameters, DielinePath, GeneratedBoxModel, Panel3DTransform, Point2D } from './types';
import { assembleModel } from './boxGenerator';
import { pointsToSvgPath } from './fingerJointEngine';
import { buildSingleStrokeTextPath } from './vectorFont';

/** Kerf values on one test pair, one per hexagon side. */
export const KERF_TEST_STEPS = 6;
/** Between neighbouring sides, in kerf (the setting); each tab edge moves half this. */
export const KERF_TEST_STEP_MM = 0.04;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Six kerf values, 0.04 apart, starting 0.02 below the material's kerf. Each `shift` moves the whole
 * set by three steps (0.12): negative for looser, positive for tighter. Never below zero.
 */
export function kerfTestValues(baseKerfMm: number, shift: number): number[] {
  const start = Math.max(0, round2(baseKerfMm - 0.02 + shift * 3 * KERF_TEST_STEP_MM));
  return Array.from({ length: KERF_TEST_STEPS }, (_, i) => round2(start + i * KERF_TEST_STEP_MM));
}

/** The side order values are laid out in: the top side, then clockwise. */
const SIDE_ORDER = [4, 5, 0, 1, 2, 3];

interface Hex {
  /** Side length; the fingers split each side into five equal segments. */
  L: number;
  /** Finger depth: one material thickness. */
  d: number;
  vertices: Point2D[];
  normals: Point2D[];
  apothem: number;
}

/** A flat-top hexagon around the origin, y down; side k runs from vertex k to k + 1, side 4 on top. */
function hexFrame(L: number, d: number): Hex {
  const vertices = Array.from({ length: 6 }, (_, k) => ({
    x: L * Math.cos((k * Math.PI) / 3),
    y: L * Math.sin((k * Math.PI) / 3),
  }));
  const normals = Array.from({ length: 6 }, (_, k) => ({
    x: Math.cos(((2 * k + 1) * Math.PI) / 6),
    y: Math.sin(((2 * k + 1) * Math.PI) / 6),
  }));
  return { L, d, vertices, normals, apothem: (L * Math.sqrt(3)) / 2 };
}

/**
 * One test piece's outline. Every side has five segments; piece A has tabs on segments 0, 2, 4
 * (both ends), piece B on 1 and 3. Both patterns are symmetric along the side, so any side of A
 * meets the facing side of B with both pieces face up. Each tab grows by half its side's kerf at
 * every edge it shares with a gap, as the box engine does, so a side cut at 0.18 fits like a box
 * cut with a 0.18 mm kerf setting.
 */
function pieceOutline(hex: Hex, kerfPerSide: number[], tabsAtEnds: boolean): Point2D[] {
  const { L, d, vertices, normals } = hex;
  const seg = L / 5;
  const out = (j: number) => (tabsAtEnds ? j % 2 === 0 : j % 2 === 1);
  const pts: Point2D[] = [];
  for (let k = 0; k < 6; k++) {
    const a = vertices[k];
    const b = vertices[(k + 1) % 6];
    const e = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const n = normals[k];
    const hk = kerfPerSide[k] / 2;
    const P = (t: number, o: number) => ({ x: a.x + e.x * t + n.x * o, y: a.y + e.y * t + n.y * o });
    pts.push(P(0, out(0) ? d : 0));
    for (let j = 1; j < 5; j++) {
      const t = j * seg;
      if (out(j - 1)) {
        pts.push(P(t + hk, d), P(t + hk, 0));
      } else {
        pts.push(P(t - hk, 0), P(t - hk, d));
      }
    }
    pts.push(P(L, out(4) ? d : 0));
  }
  return pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6;
  });
}

/** Rotates and moves every point of a single-stroke text path built around the origin. */
function placeText(d: string, angle: number, at: Point2D): string {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return d.replace(/([ML])\s*(-?[\d.]+)\s+(-?[\d.]+)/g, (_, cmd: string, xs: string, ys: string) => {
    const x = Number(xs);
    const y = Number(ys);
    return `${cmd} ${(at.x + x * c - y * s).toFixed(3)} ${(at.y + x * s + y * c).toFixed(3)}`;
  });
}

interface PieceResult {
  panel2D: BoxPanel2D;
  panel3D: Omit<Panel3DTransform, 'closedPos' | 'explodedPos'>;
  /** The hexagon's centre in the piece's top-left frame, less the outline box's centre. */
  centreOffset: Point2D;
}

function buildPiece(id: string, name: string, hex: Hex, kerfPerSide: number[], tabsAtEnds: boolean, T: number, color: string): PieceResult {
  const outline = pieceOutline(hex, kerfPerSide, tabsAtEnds);
  const minX = Math.min(...outline.map((p) => p.x));
  const minY = Math.min(...outline.map((p) => p.y));
  const maxX = Math.max(...outline.map((p) => p.x));
  const maxY = Math.max(...outline.map((p) => p.y));
  const w = maxX - minX;
  const h = maxY - minY;
  const shifted = outline.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  const centre = { x: -minX, y: -minY };

  // Each side's value sits just inside it, parallel to it, tops toward the edge: read from inside.
  const capH = Math.min(5, hex.L * 0.13);
  const labels: DielinePath[] = kerfPerSide.map((k, side) => {
    const n = hex.normals[side];
    const dist = hex.apothem - 2.5 - capH / 2;
    const text = buildSingleStrokeTextPath([k.toFixed(2)], { centerX: 0, centerY: 0, capHeightMm: capH, maxWidthMm: hex.L * 0.7 });
    return {
      id: `${id}-label-${side}`,
      layer: 'score',
      d: placeText(text, Math.atan2(n.x, -n.y), { x: centre.x + n.x * dist, y: centre.y + n.y * dist }),
      closed: false,
    };
  });
  const mt = buildSingleStrokeTextPath([`${T.toFixed(2)} MM`], {
    centerX: centre.x,
    centerY: centre.y,
    capHeightMm: capH,
    maxWidthMm: hex.L * 0.9,
  });

  const panel2D: BoxPanel2D = {
    id,
    name,
    faceLabel: name,
    widthMm: w,
    heightMm: h,
    safeRect: { x: centre.x - hex.apothem, y: centre.y - hex.apothem, width: 2 * hex.apothem, height: 2 * hex.apothem },
    sheetX: 0,
    sheetY: 0,
    paths: [
      { id: `${id}-cut`, layer: 'cut', d: pointsToSvgPath(shifted, true), closed: true },
      ...labels,
      { id: `${id}-thickness`, layer: 'score', d: mt, closed: false },
    ],
  };
  return {
    panel2D,
    panel3D: {
      id,
      name,
      faceId: id,
      widthMm: w,
      heightMm: h,
      thicknessMm: T,
      color,
      // Lying flat, face up: the outline's y runs along world +z, as on the sheet seen from above.
      rotation: [-Math.PI / 2, 0, 0],
      outlinePoints: shifted,
    },
    centreOffset: { x: centre.x - w / 2, y: centre.y - h / 2 },
  };
}

/**
 * The kerf test: two hexagons with finger joints on every side, each side cut at one of `values`.
 * On B the value of each A side sits on the opposite side, the one that faces it when B lies beside
 * A, so both stay face up and the two matching labels meet at the joint. In 3D, B slides in to
 * `dockValueIndex`'s side of A as the fold progress closes, and out again as it opens.
 */
export function generateKerfTestModel(params: BoxParameters, values: number[], dockValueIndex: number): GeneratedBoxModel {
  const T = params.materialThicknessMm;
  const seg = Math.max(6, 2.4 * T);
  const hex = hexFrame(5 * seg, T);
  const kerfA: number[] = new Array(6).fill(0);
  const kerfB: number[] = new Array(6).fill(0);
  SIDE_ORDER.forEach((side, i) => {
    kerfA[side] = values[i];
    kerfB[(side + 3) % 6] = values[i];
  });
  const a = buildPiece('kerf-test-a', 'Test A', hex, kerfA, true, T, '#d4ad7f');
  const b = buildPiece('kerf-test-b', 'Test B', hex, kerfB, false, T, '#c49a6c');

  const dockSide = SIDE_ORDER[Math.max(0, Math.min(KERF_TEST_STEPS - 1, dockValueIndex))];
  const n = hex.normals[dockSide];
  // Mated, A's baseline and B's sit one finger depth apart: tab tips touch the other's baseline.
  const gap = 2 * hex.apothem + hex.d;
  const apart = gap + Math.max(20, hex.L * 0.6);
  const panels3D: Panel3DTransform[] = [
    { ...a.panel3D, closedPos: [-a.centreOffset.x, 0, -a.centreOffset.y], explodedPos: [-a.centreOffset.x, 0, -a.centreOffset.y] },
    {
      ...b.panel3D,
      closedPos: [n.x * gap - b.centreOffset.x, 0, n.y * gap - b.centreOffset.y],
      explodedPos: [n.x * apart - b.centreOffset.x, 0, n.y * apart - b.centreOffset.y],
    },
  ];

  const span = a.panel2D.widthMm;
  return assembleModel(
    params,
    { widthMm: span, depthMm: a.panel2D.heightMm, heightMm: T },
    { widthMm: span, depthMm: a.panel2D.heightMm, heightMm: T },
    [a.panel2D, b.panel2D],
    panels3D,
    `Kerf test: ${values.map((v) => v.toFixed(2)).join(', ')} mm`,
    [],
  );
}
