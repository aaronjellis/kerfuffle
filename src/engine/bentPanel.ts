/**
 * A flat panel bent along a profile, for 3D: straight runs and arcs up the panel's length (its
 * sheet y), bending about the panel's own x axis. Positive angles bend toward local −z (the panel's
 * inside, its back face); negative ones bend back out. Lengths are kept along the mid-thickness, as
 * the wood keeps them when a living hinge bends.
 *
 * Earcut puts no vertices inside a triangle, so a shape warped as it is would cut straight across
 * each bend. The flat shape is cut into bands first (thin across the arcs, whole along the straight
 * runs), each band extruded, and its vertices moved onto the profile.
 */
import * as THREE from 'three';
import { Clipper, FillRule } from 'clipper2-js';
import { fromPaths64, toPaths64, type Poly } from './geom';
import { EDGE_COLOR, EDGES_NAME, mergeBufferGeometries } from './scene3d';
import type { Panel3DTransform, Point2D } from './types';

export type BendSegment = { kind: 'straight'; lengthMm: number } | { kind: 'arc'; radiusMm: number; angleRad: number };

/** The hinge slits drawn on a bent panel, found by name to redraw them as it bends. */
export const BENT_LINES_NAME = 'bent-lines';

/** The arcs are cut into bands this long along the mid-thickness. */
const BAND_MM = 2;

const segLength = (g: BendSegment) => (g.kind === 'straight' ? g.lengthMm : g.radiusMm * Math.abs(g.angleRad));

/**
 * Where the point `s` along the mid-thickness from the panel's foot, `d` out from it toward the
 * front face, lands: `y` up from the foot, `z` toward the front face. Past the end, the last run goes on.
 */
export function bentPoint(segments: BendSegment[], s: number, d: number): { y: number; z: number } {
  let y = 0;
  let z = 0;
  // The heading: 0 straight up, growing as the panel turns toward −z.
  let th = 0;
  let left = s;
  for (let i = 0; i < segments.length; i++) {
    const g = segments[i];
    const len = segLength(g);
    const take = i === segments.length - 1 ? left : Math.min(left, len);
    if (g.kind === 'straight') {
      y += take * Math.cos(th);
      z -= take * Math.sin(th);
    } else {
      // The arc's centre sits a radius to the side it turns toward.
      const sign = Math.sign(g.angleRad) || 1;
      const nY = Math.sin(th);
      const nZ = Math.cos(th);
      const cy = y - sign * nY * g.radiusMm;
      const cz = z - sign * nZ * g.radiusMm;
      th += (sign * take) / g.radiusMm;
      y = cy + sign * Math.sin(th) * g.radiusMm;
      z = cz + sign * Math.cos(th) * g.radiusMm;
    }
    left -= take;
    if (left <= 0) break;
  }
  // The front face's normal at the heading, (sin θ, cos θ) in (y, z).
  return { y: y + d * Math.sin(th), z: z + d * Math.cos(th) };
}

/** Where each arc starts and ends along the mid-thickness. */
function arcSpans(segments: BendSegment[]): [number, number][] {
  const spans: [number, number][] = [];
  let at = 0;
  for (const g of segments) {
    const len = segLength(g);
    if (g.kind === 'arc') spans.push([at, at + len]);
    at += len;
  }
  return spans;
}

/** Shapes for a set of rings, outer rings solid and their holes cut, whichever way the rings wind. */
function shapesOf(poly: Poly): THREE.Shape[] {
  const path = new THREE.ShapePath();
  const rings = poly.filter((r) => r.length >= 3);
  if (rings.length === 0) return [];
  for (const r of rings) {
    path.moveTo(r[0].x, r[0].y);
    for (const p of r.slice(1)) path.lineTo(p.x, p.y);
    path.currentPath?.closePath();
  }
  const pts = (r: Point2D[]) => r.map((p) => new THREE.Vector2(p.x, p.y));
  const largest = rings.reduce((a, b) => (Math.abs(THREE.ShapeUtils.area(pts(b))) > Math.abs(THREE.ShapeUtils.area(pts(a))) ? b : a));
  return path.toShapes(!THREE.ShapeUtils.isClockWise(pts(largest)));
}

/**
 * The panel's flat outline and holes (`outlinePoints`, `holeContours`, in the sheet's y-down frame),
 * bent along `spec.bend`, centred across like a flat panel's extrusion and with its foot at
 * −heightMm/2. Face and side groups as `mergeBufferGeometries` makes them.
 */
export function buildBentPanelGeometry(spec: Panel3DTransform): THREE.BufferGeometry {
  const segments = spec.bend?.segments ?? [];
  const T = spec.thicknessMm;
  const w = spec.widthMm;
  const h = spec.heightMm;
  // Up from the foot, across from the centre: s along the length, x across.
  const local = (r: Point2D[]) => r.map((p) => ({ x: p.x - w / 2, y: h - p.y }));
  const outline = local(spec.outlinePoints ?? []);
  const holes = (spec.holeContours ?? []).map(local);
  const solid = fromPaths64(Clipper.Difference(toPaths64([outline]), toPaths64(holes), FillRule.NonZero));

  // Band edges: every arc's ends and its 2 mm steps; the straight runs between stay whole.
  const cuts = new Set<number>([0, h]);
  for (const [a, b] of arcSpans(segments)) {
    const n = Math.max(1, Math.ceil((b - a) / BAND_MM));
    for (let i = 0; i <= n; i++) cuts.add(a + ((b - a) * i) / n);
  }
  const edges = [...cuts].filter((v) => v >= 0 && v <= h).sort((a, b) => a - b);

  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const band = [
      { x: -w, y: edges[i] },
      { x: w, y: edges[i] },
      { x: w, y: edges[i + 1] },
      { x: -w, y: edges[i + 1] },
    ];
    const piece = fromPaths64(Clipper.Intersect(toPaths64(solid), toPaths64([band]), FillRule.NonZero));
    for (const shape of shapesOf(piece)) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const q = bentPoint(segments, pos.getY(k), pos.getZ(k) - T / 2);
        pos.setXYZ(k, pos.getX(k), q.y - h / 2, q.z);
      }
      g.computeVertexNormals();
      parts.push(g);
    }
  }
  const merged = mergeBufferGeometries(parts);
  for (const g of parts) g.dispose();
  return merged;
}

/** Lines drawn on the bent panel's front face, as the hinge slits: `paths` in the sheet's y-down frame. */
export function buildBentLines(spec: Panel3DTransform, paths: Point2D[][]): THREE.LineSegments {
  const segments = spec.bend?.segments ?? [];
  const h = spec.heightMm;
  const d = spec.thicknessMm / 2 + 0.05;
  const verts: number[] = [];
  for (const line of paths) {
    for (let i = 1; i < line.length; i++) {
      for (const p of [line[i - 1], line[i]]) {
        const q = bentPoint(segments, h - p.y, d);
        verts.push(p.x - spec.widthMm / 2, q.y - h / 2, q.z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: EDGE_COLOR }));
  lines.name = BENT_LINES_NAME;
  return lines;
}

/** A panel's bent geometry when it bends, or null for a viewer to build its flat panel as before. */
export const panelGeometryFor = (spec: Panel3DTransform): THREE.BufferGeometry | null => (spec.bend ? buildBentPanelGeometry(spec) : null);

/**
 * A panel's edges drawn from its own outline and holes, on both faces, with a line through the
 * ply at each real corner; bent along its profile when it has one. The edge finder three.js offers
 * joins holes that sit level with each other by lines across the face (the triangulation's bridges),
 * which a tabbed wall's slots would show as stripes.
 */
export function panelEdgesGeometry(spec: Panel3DTransform): THREE.BufferGeometry {
  const segments = spec.bend?.segments ?? [{ kind: 'straight' as const, lengthMm: spec.heightMm }];
  const h = spec.heightMm;
  const half = spec.thicknessMm / 2;
  const verts: number[] = [];
  const put = (p: Point2D, d: number) => {
    const q = bentPoint(segments, h - p.y, d);
    verts.push(p.x - spec.widthMm / 2, q.y - h / 2, q.z);
  };
  for (const ring of [spec.outlinePoints ?? [], ...(spec.holeContours ?? [])]) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      // On a bent panel a long edge follows the bend in short steps; one straight line would cut
      // across it through the air.
      const steps = spec.bend ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / BAND_MM)) : 1;
      for (let k = 0; k < steps; k++) {
        const p0 = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
        const p1 = { x: a.x + ((b.x - a.x) * (k + 1)) / steps, y: a.y + ((b.y - a.y) * (k + 1)) / steps };
        for (const d of [half, -half]) {
          put(p0, d);
          put(p1, d);
        }
      }
      // A line through the ply where the outline turns a real corner, not along a curve's steps.
      const prev = ring[(i - 1 + n) % n];
      const t1 = Math.atan2(a.y - prev.y, a.x - prev.x);
      const t2 = Math.atan2(b.y - a.y, b.x - a.x);
      let turn = Math.abs(t2 - t1);
      turn = Math.min(turn, 2 * Math.PI - turn);
      if (turn > Math.PI / 6) {
        put(a, half);
        put(a, -half);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geometry;
}

/**
 * The panel's profile a share of the way bent: 0 flat, 1 as closed. Each arc keeps its length, as
 * the hinge does, turning less on a wider radius.
 */
export function partlyBent(segments: BendSegment[], share: number): BendSegment[] {
  return segments.map((g) =>
    g.kind === 'straight' || share >= 1
      ? g
      : share < 1e-3
        ? { kind: 'straight', lengthMm: segLength(g) }
        : { kind: 'arc', radiusMm: g.radiusMm / share, angleRad: g.angleRad * share },
  );
}

/** Rebends a bent panel's mesh, its edges and its hinge slits a share of the way (0 flat, 1 closed). */
export function bendBentPanel(mesh: THREE.Mesh, spec: Panel3DTransform, share: number) {
  if (!spec.bend) return;
  const last = mesh.userData.bentShare as number | undefined;
  if (last === undefined ? share >= 1 : Math.abs(last - share) < 0.01) return;
  mesh.userData.bentShare = share;
  const posed: Panel3DTransform = { ...spec, bend: { ...spec.bend, segments: partlyBent(spec.bend.segments, share) } };
  mesh.geometry.dispose();
  mesh.geometry = buildBentPanelGeometry(posed);
  const edges = mesh.getObjectByName(EDGES_NAME) as THREE.LineSegments | undefined;
  if (edges) {
    edges.geometry.dispose();
    edges.geometry = panelEdgesGeometry(posed);
  }
  const slits = mesh.getObjectByName(BENT_LINES_NAME) as THREE.LineSegments | undefined;
  if (slits) {
    const fresh = buildBentLines(posed, posed.bend?.lines ?? []);
    slits.geometry.dispose();
    slits.geometry = fresh.geometry;
    (fresh.material as THREE.Material).dispose();
  }
}
