import * as THREE from 'three';
import { BoxParameters } from './types';
import { hingeHoleLayout } from './fingerJointEngine';
import { geometriesToAsciiStl } from './stl';

/**
 * A 3D-printed flat offset hinge for the laser-cut clamshell. Each leaf prints flat with its bed
 * face as the mounting face against the wood; the knuckle stands proud beyond the plate's edge, so
 * its axis sits on the seam 2.5 mm off the wood. Separate printed pins pass through the leaf's
 * holes into the 3.0 mm holes the laser cuts 6 mm from the seam. A filament pin runs through the
 * knuckles; the bore follows `hingePinDiameterMm` (default 1.75 mm filament) plus 0.25 clearance,
 * with the pin capped at 3.0 mm.
 */
export interface PrintedHingeSpec {
  /** Distance between a hinge's two laser-cut holes (centre to centre). */
  spacing: number;
  /** Filament pin diameter; values above MAX_PIN_MM are clamped. */
  pinMm: number;
  /** Board thickness: the press-fit pins are plate + board long. */
  boardT: number;
}

const PLATE_T = 1.6;
const PLATE_DEPTH = 10;
/**
 * Gap between the plate's knuckle-side edge and y = 0, the plane tangent to the knuckle's back
 * (the axis is at y = -2.5).
 */
const RELIEF = 0.3;
const HOLE_D = 3.2;
/**
 * Pin holes sit 6 mm from the axis (at y = -2.5), matching the laser holes 6 mm from the seam. The
 * 3.2 mm hole then leaves a 1.6 mm ligament to the plate's knuckle-side edge at y = 0.3.
 */
const HOLE_Y = 3.5;
const KNUCKLE_R = 2.5;
const AXIS_Y = -KNUCKLE_R;
const AXIS_Z = KNUCKLE_R;
const KNUCKLE_GAP = 0.3;
// FDM prints the 3.2 hole ~0.1-0.2 under size and kerf opens the 3.0 laser hole to ~3.1: press fit in both.
const PIN_D = 3.1;
const PIN_PITCH = 6;
/** Gap between pieces laid out side by side in the STL. */
const LAYOUT_GAP = 8;
const SEGMENTS = 24;
/** Ø5 knuckle keeps >= 0.85 mm wall at a 3.25 bore. */
const MAX_PIN_MM = 3.0;

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

function rect(x0: number, y0: number, x1: number, y1: number): THREE.Shape {
  return new THREE.Shape([
    new THREE.Vector2(x0, y0),
    new THREE.Vector2(x1, y0),
    new THREE.Vector2(x1, y1),
    new THREE.Vector2(x0, y1),
  ]);
}

/**
 * One knuckle segment from x0 to x1: the annulus around the axis plus a web that ties it to the
 * plate. The web spans y from 0.3 outside the bore to 0.01 past the plate's edge, z 0..2.5, so it
 * overlaps both the knuckle solid and the plate and leaves the bore clear.
 */
function knuckle(x0: number, x1: number, boreR: number): THREE.BufferGeometry[] {
  const ring = new THREE.Shape(circlePoints(AXIS_Y, AXIS_Z, KNUCKLE_R, SEGMENTS));
  ring.holes.push(new THREE.Path(circlePoints(AXIS_Y, AXIS_Z, boreR, SEGMENTS).reverse()));
  const web = rect(AXIS_Y + boreR + 0.3, 0, RELIEF + 0.01, AXIS_Z);
  return [extrudeAlongX(ring, x0, x1), extrudeAlongX(web, x0, x1)];
}

/**
 * The two hinge leaves, each laid flat for printing (Z up, bed face = mounting face). The plate
 * spans x 0..spacing + 8, y 0.3..10, z 0..1.6, with two 3.2 mm through-holes at
 * x = centre ± spacing/2, y = 3.5. The knuckle axis runs along X at y = -2.5, z = 2.5, split into
 * three segments with 0.3 mm gaps: leaf A owns the outer two, leaf B the middle one, at the same X
 * in both frames, so they interleave once B is turned 180 degrees about Z to face A across the seam.
 */
export function buildPrintedHingeLeaves(spec: PrintedHingeSpec): THREE.BufferGeometry[] {
  const L = spec.spacing + 8;
  const boreR = (Math.min(spec.pinMm, MAX_PIN_MM) + 0.25) / 2;
  const seg = (L - 2 * KNUCKLE_GAP) / 3;
  const ranges: [number, number][] = [
    [0, seg],
    [seg + KNUCKLE_GAP, 2 * seg + KNUCKLE_GAP],
    [2 * seg + 2 * KNUCKLE_GAP, L],
  ];

  const plate = (): THREE.BufferGeometry => {
    const shape = rect(0, RELIEF, L, PLATE_DEPTH);
    for (const dx of [-spec.spacing / 2, spec.spacing / 2]) {
      shape.holes.push(new THREE.Path(circlePoints(L / 2 + dx, HOLE_Y, HOLE_D / 2, SEGMENTS).reverse()));
    }
    return extrudeZ(shape, 0, PLATE_T);
  };

  const leafA = [plate(), ...knuckle(...ranges[0], boreR), ...knuckle(...ranges[2], boreR)];
  const leafB = [plate(), ...knuckle(...ranges[1], boreR)];
  return [mergePositions(leafA), mergePositions(leafB)];
}

/**
 * Four press-fit pins (two per leaf), each 3.1 mm across and plate + board long, standing on the
 * bed in a row 6 mm apart starting at x = 0, centred on y = 5.
 */
export function buildPrintedHingePins(spec: PrintedHingeSpec): THREE.BufferGeometry[] {
  return Array.from({ length: 4 }, (_, i) => {
    const pin = new THREE.Shape(circlePoints(PIN_D / 2 + i * PIN_PITCH, PLATE_DEPTH / 2, PIN_D / 2, SEGMENTS));
    return mergePositions([extrudeZ(pin, 0, spec.boardT + PLATE_T)]);
  });
}

/** One hinge in one STL: leaf A at the origin, leaf B 8 mm to its right, then the four pins. */
export function printedHingeStl(spec: PrintedHingeSpec): string {
  const L = spec.spacing + 8;
  const [a, b] = buildPrintedHingeLeaves(spec);
  b.translate(L + LAYOUT_GAP, 0, 0);
  const pins = buildPrintedHingePins(spec);
  for (const pin of pins) pin.translate(2 * L + 2 * LAYOUT_GAP, 0, 0);
  return geometriesToAsciiStl('Kerfuffle_Printed_Hinge', [a, b, ...pins]);
}

/** The printed hinge sized to the clamshell's laser-cut holes. One STL is one hinge; print two. */
export function exportPrintedHingeStl(params: BoxParameters, innerW: number): string {
  return printedHingeStl({
    spacing: hingeHoleLayout(params, innerW).spacing,
    pinMm: params.hingePinDiameterMm,
    boardT: params.materialThicknessMm,
  });
}
