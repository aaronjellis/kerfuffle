import * as THREE from 'three';
import type { BoxPanel2D, BoxParameters, FacePatternSettings, FacePatternStyle, Panel3DTransform, Point2D } from './types';
import { pointsToSvgPath } from './fingerJointEngine';

/** Faces a see-through pattern can go on. The floor is left solid. */
export const PATTERN_FACE_IDS = ['top', 'front', 'back', 'left', 'right'] as const;

type Poly = Point2D[];

const TAU = Math.PI * 2;

/** A closed circle-ish polygon, `n` points. */
const circle = (cx: number, cy: number, r: number, n = 28): Poly =>
  Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((i / n) * TAU), y: cy + r * Math.sin((i / n) * TAU) }));

function polyArea(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a / 2;
}

function polyPerimeter(p: Poly): number {
  let l = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    l += Math.hypot(q.x - p[i].x, q.y - p[i].y);
  }
  return l;
}

/** Sutherland–Hodgman: `subject` clipped to the convex `window`. */
function clipConvex(subject: Poly, window: Poly): Poly {
  const sign = Math.sign(polyArea(window)) || 1;
  let out = subject;
  for (let i = 0; i < window.length && out.length > 0; i++) {
    const a = window[i];
    const b = window[(i + 1) % window.length];
    const side = (p: Point2D) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0) {
        if (sp < 0) out.push(lerpAt(prev, cur, sp, sc));
        out.push(cur);
      } else if (sp >= 0) {
        out.push(lerpAt(prev, cur, sp, sc));
      }
    }
  }
  return out;
}

const lerpAt = (p: Point2D, q: Point2D, sp: number, sq: number): Point2D => {
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
};

/** The window the holes are clipped to: the region inset by `pad`, corners rounded. */
function roundedWindow(x0: number, y0: number, x1: number, y1: number, r: number): Poly {
  const pts: Poly = [];
  const corners: [number, number, number][] = [
    [x1 - r, y0 + r, -Math.PI / 2],
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, Math.PI / 2],
    [x0 + r, y0 + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  }
  return pts;
}

/**
 * Unclipped holes, centred on (cx, cy), covering at least a circle of radius `reach`.
 * `cell` is the repeat; `bar` the solid web left between neighbouring holes.
 */
function rawHoles(style: Exclude<FacePatternStyle, 'none'>, cx: number, cy: number, reach: number, cell: number, bar: number): Poly[] {
  const holes: Poly[] = [];
  const span = Math.ceil(reach / cell) + 1;
  switch (style) {
    case 'grid':
    case 'checker': {
      const s = (cell - bar) / 2;
      // Even cell counts across centre the lattice on a bar, odd ones on a hole; centre on a hole.
      for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
          if (style === 'checker' && (i + j) % 2 !== 0) continue;
          const x = cx + i * cell;
          const y = cy + j * cell;
          holes.push([
            { x: x - s, y: y - s },
            { x: x + s, y: y - s },
            { x: x + s, y: y + s },
            { x: x - s, y: y + s },
          ]);
        }
      }
      break;
    }
    case 'diamond': {
      // Squares turned 45°, on a lattice whose diagonal neighbours sit cell / √2 apart.
      const r = (cell - bar * Math.SQRT2) / 2;
      if (r <= 0) break;
      for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
          for (const off of [0, cell / 2]) {
            const x = cx + i * cell + off;
            const y = cy + j * cell + off;
            holes.push([
              { x, y: y - r },
              { x: x + r, y },
              { x, y: y + r },
              { x: x - r, y },
            ]);
          }
        }
      }
      break;
    }
    case 'honeycomb': {
      // Pointy-top hexagons, `cell` between neighbouring centres.
      const apothem = (cell - bar) / 2;
      const R = (apothem * 2) / Math.sqrt(3);
      const rowH = (cell * Math.sqrt(3)) / 2;
      const rows = Math.ceil(reach / rowH) + 1;
      for (let j = -rows; j <= rows; j++) {
        for (let i = -span; i <= span; i++) {
          const x = cx + i * cell + (Math.abs(j) % 2 ? cell / 2 : 0);
          const y = cy + j * rowH;
          holes.push(
            Array.from({ length: 6 }, (_, k) => {
              const a = Math.PI / 6 + (k * Math.PI) / 3;
              return { x: x + R * Math.cos(a), y: y + R * Math.sin(a) };
            }),
          );
        }
      }
      break;
    }
    case 'scallops': {
      // Fish scales: circles of radius r, rows r apart, alternate rows offset by r. A scale is the
      // top of its own circle above the two circles of the row below; insetting shrinks its own
      // circle and grows the two below by bar / 2.
      const r = cell / 2;
      const r1 = r - bar / 2;
      const r2 = r + bar / 2;
      if (r1 <= bar / 2) break;
      const scale = scallop(r, r1, r2);
      const rows = Math.ceil(reach / r) + 2;
      for (let j = -rows; j <= rows; j++) {
        for (let i = -span; i <= span; i++) {
          const x = cx + i * cell + (Math.abs(j) % 2 ? r : 0);
          const y = cy + j * r;
          holes.push(scale.map((p) => ({ x: x + p.x, y: y + p.y })));
        }
      }
      break;
    }
    case 'sunflower': {
      // Phyllotaxis: point k at radius c·√(k + ½), turned by the golden angle; neighbours land
      // about 1.9·c apart, so c = cell / 1.9 makes the spacing roughly `cell`.
      const c = cell / 1.905;
      const hole = (cell * 0.86 - bar) / 2;
      if (hole <= 0.4) break;
      const golden = Math.PI * (3 - Math.sqrt(5));
      const pts: Point2D[] = [];
      for (let k = 0; ; k++) {
        const rad = c * Math.sqrt(k + 0.5);
        if (rad > reach + cell) break;
        const a = k * golden;
        pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
      }
      // Spacing tightens near the centre, so each dot shrinks to keep a full bar to its nearest neighbour.
      for (const p of pts) {
        let nn = Infinity;
        for (const q of pts) if (q !== p) nn = Math.min(nn, Math.hypot(q.x - p.x, q.y - p.y));
        const r = Math.min(hole, (nn - bar) / 2);
        if (r > 0.4) holes.push(circle(p.x, p.y, r, 20));
      }
      break;
    }
    case 'spiral': {
      holes.push(...spiralLattice(cx, cy, reach, cell, bar));
      break;
    }
  }
  return holes;
}

/** One scale, centred on its own circle's centre. */
function scallop(r: number, r1: number, r2: number): Poly {
  // Where the shrunk top circle meets the grown lower-right circle (centre (r, r)).
  const at = (t: number) => ({ x: r1 * Math.cos(t), y: r1 * Math.sin(t) });
  const f = (t: number) => Math.hypot(at(t).x - r, at(t).y - r) - r2;
  let lo = 1.5 * Math.PI;
  let hi = 2 * Math.PI;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const tR = (lo + hi) / 2;
  const tL = 3 * Math.PI - tR;
  const pts: Poly = [];
  for (let i = 0; i <= 14; i++) pts.push(at(tL + ((tR - tL) * i) / 14));
  // Down the lower-right circle to the point where the two lower circles meet.
  const pR = at(tR);
  const bottomY = r - Math.sqrt(r2 * r2 - r * r);
  const a0 = Math.atan2(pR.y - r, pR.x - r);
  const a1 = Math.atan2(bottomY - r, -r);
  const right: Poly = [];
  for (let i = 1; i <= 8; i++) {
    const a = a0 + ((a1 - a0) * i) / 8;
    right.push({ x: r + r2 * Math.cos(a), y: r + r2 * Math.sin(a) });
  }
  pts.push(...right);
  // And back up the lower-left circle, the mirror image.
  for (let i = right.length - 2; i >= 0; i--) pts.push({ x: -right[i].x, y: right[i].y });
  return pts;
}

/**
 * Square holes on a log-spiral grid. In log-polar space (u = ln ρ, θ) two families of lines,
 * θ − u = a·k and θ + u = a·m with a = 2π / n, cut the plane into squares; mapped back, they are
 * spiral arms turning both ways, and every cell is a near-square that grows with its radius. Each
 * cell becomes a straight-edged square hole, shrunk about its centre to leave a gap of at least
 * `bar` (a third of the cell further out). Cells too small to cut leave the centre solid.
 */
function spiralLattice(cx: number, cy: number, reach: number, cell: number, bar: number): Poly[] {
  // A cell's side is about ρ·a/√2; size the grid so the outermost cells are `cell` across.
  const n = Math.max(16, Math.min(96, Math.round((TAU * reach) / (cell * Math.SQRT2))));
  const a = TAU / n;
  const minHole = Math.max(1.5, bar * 0.6);
  const toXY = (k: number, m: number) => {
    const u = (a * (m - k)) / 2;
    const th = (a * (m + k)) / 2;
    const rho = Math.exp(u);
    return { x: cx + rho * Math.cos(th), y: cy + rho * Math.sin(th) };
  };
  const holes: Poly[] = [];
  // q = m − k picks the ring (u = a·q / 2); the n cells of a ring are p = k + m of q's parity.
  const qMax = Math.ceil((2 * (Math.log(reach) + a)) / a);
  for (let q = qMax; q > -4 * n; q--) {
    let anyCut = false;
    for (let t = 0; t < n; t++) {
      const p = (((q % 2) + 2) % 2) + 2 * t;
      const k = (p - q) / 2;
      const m = (p + q) / 2;
      const corners = [toXY(k, m), toXY(k + 1, m), toXY(k + 1, m + 1), toXY(k, m + 1)];
      const c = { x: corners.reduce((s, v) => s + v.x, 0) / 4, y: corners.reduce((s, v) => s + v.y, 0) / 4 };
      const side = (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) +
        Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y)) / 2;
      const gap = Math.max(bar, side * 0.35);
      if (side - gap < minHole) continue;
      const f = (side - gap) / side;
      holes.push(corners.map((v) => ({ x: c.x + (v.x - c.x) * f, y: c.y + (v.y - c.y) * f })));
      anyCut = true;
    }
    // Rings only get smaller inward; once a whole ring is too small, every ring inside it is too.
    if (!anyCut && q < 0) break;
  }
  return holes;
}

/**
 * Holes for a `width × height` region (origin top-left, y down), centred on it and clipped to the
 * region inset by `paddingMm` with rounded corners. Slivers thinner than 1 mm are dropped.
 */
export function generatePatternHoles(spec: FacePatternSettings, width: number, height: number): Poly[] {
  if (spec.style === 'none') return [];
  const cell = Math.max(4, spec.cellMm);
  const bar = Math.max(0.8, Math.min(spec.barMm, cell * 0.6));
  const pad = Math.max(0, spec.paddingMm);
  const x0 = pad;
  const y0 = pad;
  const x1 = width - pad;
  const y1 = height - pad;
  if (x1 - x0 < cell * 0.75 || y1 - y0 < cell * 0.75) return [];
  const window = roundedWindow(x0, y0, x1, y1, Math.min(3, (x1 - x0) / 2, (y1 - y0) / 2));
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(x1 - x0, y1 - y0) / 2;
  const out: Poly[] = [];
  for (const raw of rawHoles(spec.style, cx, cy, reach, cell, bar)) {
    // Cheap reject: holes wholly outside the window's box.
    if (raw.every((p) => p.x < x0) || raw.every((p) => p.x > x1) || raw.every((p) => p.y < y0) || raw.every((p) => p.y > y1)) continue;
    const clipped = clipConvex(raw, window);
    if (clipped.length < 3) continue;
    const area = Math.abs(polyArea(clipped));
    if (area < 1 || (2 * area) / polyPerimeter(clipped) < 0.5) continue;
    out.push(clipped);
  }
  return out;
}

/** A face that can take a pattern: where it sits on the sheet, and how to carry a point to its 3D panel. */
export interface PatternFaceTarget {
  faceId: string;
  panel2DId: string;
  /** The face's region in the 2D panel's frame. */
  region: { x: number; y: number; width: number; height: number };
  panel3DId: string;
  /** Region-local point (origin at the region's top-left) to the 3D panel's outline frame. */
  to3D: (p: Point2D) => Point2D;
}

const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/** The panel's orientation with every fold in the chain at its flat angle. */
function flatQuaternion(p: Panel3DTransform, byId: Map<string, Panel3DTransform>): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rotation[0], p.rotation[1], p.rotation[2]));
  let cur: Panel3DTransform | undefined = p;
  while (cur?.foldRig) {
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(AXES[cur.foldRig.axis], cur.foldRig.flatAngleRad));
    cur = cur.foldRig.parentId ? byId.get(cur.foldRig.parentId) : undefined;
  }
  return q;
}

/**
 * The faces of this model that can take a pattern. A face qualifies when it has a region on the
 * sheet, a 3D panel of its own (id `face` or `base-face`), and no holes of its own already (divider
 * slots, hinge holes). Finger panels share their 2D and 3D outline frame, shifted by the outline's
 * minimum corner. Cardboard faces go through the flat fold: laid flat, the 3D rig lies on the sheet
 * as seen from above, so a face's flat orientation says how its sheet region turns into its panel.
 */
export function resolvePatternFaces(
  panels2D: BoxPanel2D[],
  panels3D: Panel3DTransform[],
  params: BoxParameters,
): PatternFaceTarget[] {
  if (params.category === '3d-print') return [];
  const byId = new Map(panels3D.map((p) => [p.id, p]));
  const targets: PatternFaceTarget[] = [];
  for (const faceId of PATTERN_FACE_IDS) {
    const ids = [faceId, `base-${faceId}`];
    const p3 = panels3D.find((p) => ids.includes(p.id));
    if (!p3 || (p3.holeContours && p3.holeContours.length > 0)) continue;
    let panel2DId: string | undefined;
    let region: PatternFaceTarget['region'] | undefined;
    const direct = panels2D.find((p) => p.id === p3.id);
    if (direct) {
      panel2DId = direct.id;
      region = { ...direct.safeRect };
    } else {
      for (const p of panels2D) {
        const sub = p.subFaces?.find((s) => s.id === faceId);
        if (sub) {
          panel2DId = p.id;
          region = { x: sub.x, y: sub.y, width: sub.width, height: sub.height };
          break;
        }
      }
    }
    if (!panel2DId || !region) continue;
    const r = region;

    if (params.category === 'wood-finger') {
      if (!p3.outlinePoints || !direct) continue;
      const minX = Math.min(...p3.outlinePoints.map((p) => p.x));
      const minY = Math.min(...p3.outlinePoints.map((p) => p.y));
      targets.push({ faceId, panel2DId, region: r, panel3DId: p3.id, to3D: (p) => ({ x: r.x + p.x + minX, y: r.y + p.y + minY }) });
      continue;
    }

    const q = flatQuaternion(p3, byId);
    const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const ey = new THREE.Vector3(0, -1, 0).applyQuaternion(q); // outline y runs down the mesh
    if (Math.abs(ex.y) > 1e-6 || Math.abs(ey.y) > 1e-6) continue;
    // Sheet (u, v) ↔ flat world (x, z); outline delta = Aᵀ · sheet delta, A orthonormal.
    const turned = Math.abs(ex.z) > 0.5;
    const w3 = turned ? r.height : r.width;
    const h3 = turned ? r.width : r.height;
    if (w3 > p3.widthMm + 0.5 || h3 > p3.heightMm + 0.5) continue;
    targets.push({
      faceId,
      panel2DId,
      region: r,
      panel3DId: p3.id,
      to3D: (p) => {
        const du = p.x - r.width / 2;
        const dv = p.y - r.height / 2;
        return {
          x: p3.widthMm / 2 + du * ex.x + dv * ex.z,
          y: p3.heightMm / 2 + du * ey.x + dv * ey.z,
        };
      },
    });
  }
  return targets;
}

/** Cuts each face's own pattern into it, on the sheet and in 3D. */
export function applyFacePatterns(
  panels2D: BoxPanel2D[],
  panels3D: Panel3DTransform[],
  params: BoxParameters,
  targets: PatternFaceTarget[],
): { panels2D: BoxPanel2D[]; panels3D: Panel3DTransform[] } {
  const chosen = targets.filter((t) => {
    const spec = params.facePatterns[t.faceId];
    return spec !== undefined && spec.style !== 'none';
  });
  if (chosen.length === 0) return { panels2D, panels3D };
  const out2D = panels2D.map((p) => ({ ...p, paths: [...p.paths] }));
  const out3D = panels3D.map((p) => ({ ...p }));
  for (const t of chosen) {
    const holes = generatePatternHoles(params.facePatterns[t.faceId], t.region.width, t.region.height);
    if (holes.length === 0) continue;
    const p2 = out2D.find((p) => p.id === t.panel2DId)!;
    holes.forEach((h, i) =>
      p2.paths.push({
        id: `${t.panel2DId}-pattern-${t.faceId}-${i + 1}`,
        layer: 'cut',
        d: pointsToSvgPath(h.map((p) => ({ x: t.region.x + p.x, y: t.region.y + p.y })), true),
        closed: true,
      }),
    );
    const p3 = out3D.find((p) => p.id === t.panel3DId)!;
    p3.outlinePoints = p3.outlinePoints ?? [
      { x: 0, y: 0 },
      { x: p3.widthMm, y: 0 },
      { x: p3.widthMm, y: p3.heightMm },
      { x: 0, y: p3.heightMm },
    ];
    p3.holeContours = [...(p3.holeContours ?? []), ...holes.map((h) => h.map(t.to3D))];
  }
  return { panels2D: out2D, panels3D: out3D };
}
