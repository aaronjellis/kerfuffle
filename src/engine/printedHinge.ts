import * as THREE from 'three';
import { BoxParameters } from './types';
import { hingeHoleLayout } from './fingerJointEngine';
import { geometriesToAsciiStl } from './stl';

/**
 * A 3D-printed butt hinge for the laser-cut clamshell. Each leaf press-fits into the two 3.0 mm
 * holes the laser cuts 5 mm from the seam; a 1.75 mm filament pin runs through the knuckles.
 */
export interface PrintedHingeSpec {
  /** Distance between a hinge's two laser-cut holes (centre to centre). */
  spacing: number;
  /** Filament pin diameter. */
  pinMm: number;
  /** Board thickness: the pegs are this long. */
  boardT: number;
}

const PLATE_T = 1.6;
const PLATE_DEPTH = 10;
const PEG_D = 3.1;
const PEG_Y = 5;
const KNUCKLE_R = 2.5;
const KNUCKLE_GAP = 0.3;
const SEGMENTS = 24;
/** Pegs sink this far into the plate so they do not share a face with it. */
const OVERLAP = 0.01;

function circlePoints(cx: number, cy: number, r: number, n: number): THREE.Vector2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g;
}

/** A shape drawn in X-Y, extruded along +Z from z0. */
function extrudeZ(shape: THREE.Shape, z0: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, z0);
  return nonIndexed(g);
}

/**
 * A shape drawn in the Y-Z plane (shape x -> world y, shape y -> world z), extruded along +X from
 * x0 to x1. The cyclic axis swap is a proper rotation, so winding (and outward normals) survive.
 */
function extrudeAlongX(shape: THREE.Shape, x0: number, x1: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  g.translate(x0, 0, 0);
  return nonIndexed(g);
}

/** Concatenates the position attributes of non-indexed geometries into one geometry. */
function mergePositions(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrays = parts.map((g) => g.getAttribute('position').array as ArrayLike<number>);
  const merged = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    merged.set(a, offset);
    offset += a.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  out.computeVertexNormals();
  return out;
}

/** One knuckle segment from x0 to x1: the annulus plus a fill block that ties it to the plate. */
function knuckle(x0: number, x1: number, holeR: number): THREE.BufferGeometry[] {
  const axisZ = KNUCKLE_R;
  const ring = new THREE.Shape(circlePoints(0, axisZ, KNUCKLE_R, SEGMENTS));
  ring.holes.push(new THREE.Path(circlePoints(0, axisZ, holeR, SEGMENTS).reverse()));

  // Fill block y 0..R, z 0..R under the knuckle, minus the quarter of the bore it would otherwise
  // plug: the boundary follows the bore (on the same 24-gon vertices) from (holeR, axisZ) down to
  // (0, axisZ - holeR).
  const fillPts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(KNUCKLE_R, 0),
    new THREE.Vector2(KNUCKLE_R, axisZ),
  ];
  for (let k = 0; k <= SEGMENTS / 4; k++) {
    const a = -(k / SEGMENTS) * Math.PI * 2;
    fillPts.push(new THREE.Vector2(holeR * Math.cos(a), axisZ + holeR * Math.sin(a)));
  }
  const fill = new THREE.Shape(fillPts);

  return [extrudeAlongX(ring, x0, x1), extrudeAlongX(fill, x0, x1)];
}

/**
 * The two hinge leaves, each laid flat for printing (Z up), pegs up. The plate spans
 * x 0..spacing + 8, y 0..10, z 0..1.6 with its knuckle edge at y = 0; the pegs sit at
 * x = centre ± spacing/2, y = 5. The knuckle axis runs along X at y = 0, z = 2.5, split into three
 * segments with 0.3 mm gaps: leaf A owns the outer two, leaf B the middle one, at the same X in
 * both frames so they interleave once B is turned to face A across the seam.
 */
export function buildPrintedHingeLeaves(spec: PrintedHingeSpec): THREE.BufferGeometry[] {
  const L = spec.spacing + 8;
  const holeR = (spec.pinMm + 0.25) / 2;
  const seg = (L - 2 * KNUCKLE_GAP) / 3;
  const ranges: [number, number][] = [
    [0, seg],
    [seg + KNUCKLE_GAP, 2 * seg + KNUCKLE_GAP],
    [2 * seg + 2 * KNUCKLE_GAP, L],
  ];

  const base = (): THREE.BufferGeometry[] => {
    const plate = new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(L, 0),
      new THREE.Vector2(L, PLATE_DEPTH),
      new THREE.Vector2(0, PLATE_DEPTH),
    ]);
    const parts = [extrudeZ(plate, 0, PLATE_T)];
    for (const dx of [-spec.spacing / 2, spec.spacing / 2]) {
      const peg = new THREE.Shape(circlePoints(L / 2 + dx, PEG_Y, PEG_D / 2, SEGMENTS));
      parts.push(extrudeZ(peg, PLATE_T - OVERLAP, spec.boardT + OVERLAP));
    }
    return parts;
  };

  const leafA = [...base(), ...knuckle(...ranges[0], holeR), ...knuckle(...ranges[2], holeR)];
  const leafB = [...base(), ...knuckle(...ranges[1], holeR)];
  return [mergePositions(leafA), mergePositions(leafB)];
}

/** Both leaves side by side in one STL: A at the origin, B 8 mm to its right. */
export function printedHingeStl(spec: PrintedHingeSpec): string {
  const [a, b] = buildPrintedHingeLeaves(spec);
  b.translate(spec.spacing + 8 + 8, 0, 0);
  return geometriesToAsciiStl('Kerfuffle_Printed_Hinge', [a, b]);
}

/** The printed hinge sized to the clamshell's laser-cut holes. One STL is one hinge; print two. */
export function exportPrintedHingeStl(params: BoxParameters, innerW: number): string {
  return printedHingeStl({
    spacing: hingeHoleLayout(params, innerW).spacing,
    pinMm: params.hingePinDiameterMm,
    boardT: params.materialThicknessMm,
  });
}
