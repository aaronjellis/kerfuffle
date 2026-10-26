import { BoxParameters } from './types';

/**
 * Dimensions of the 3D-printed box: two shells, a registration lip, a filament-pin knuckle
 * hinge, and a snap clasp. Pure numbers only; later code builds geometry from them.
 *
 * Print frame (shared by both parts): X runs across the front, 0..outerW. Y runs front to back,
 * with the FRONT face at y = 0 and the BACK face at y = outerD. Z is up from the bed, 0..baseH
 * (or 0..lidH). The hinge axis sits behind the back face (axisY = outerD + R); clasp features sit
 * in front of the front face (y < 0).
 */
export interface PrintBoxDims {
  wall: number;
  floor: number;
  innerW: number;
  innerD: number;
  innerH: number;
  outerW: number;
  outerD: number;
  /** Bed to rim, includes the floor. */
  baseH: number;
  /** Bed to rim, includes the top plate. */
  lidH: number;
  rOut: number;
  rIn: number;
  lip: { height: 3; thickness: number; clearance: 0.2 };
  hinge: {
    R: number;
    hole: number;
    runLen: number;
    /**
     * Knuckles along X, in WORLD x. `owner` is who owns the knuckle in the assembled box. The lid
     * prints upside down and is rotated pi about its front-back axis into the world, which mirrors
     * its x, so Task 3 must mirror lid-owned segments' x-ranges (x -> outerW - x) when building the
     * lid's print geometry. The list is symmetric under x -> outerW - x when n is odd; for n = 2
     * the base owns index 0 and the lid index 1.
     */
    segments: { x0: number; x1: number; owner: 'base' | 'lid' }[];
    axisY: number;
  } | null;
  clasp: {
    width: number;
    tongueT: 1.6;
    hang: 8;
    hookProud: 0.8;
    standoff: 1.0;
    ridgeH: 1.5;
    /** Distance below the rim of the ridge's top edge. */
    ridgeTop: number;
  } | null;
}

const KNUCKLE_GAP = 0.3;
const MIN_HINGE_R = 2.6;
const PIN_CLEARANCE = 0.25;
const LIP_HEIGHT = 3;
const MIN_BASE_INNER_H = 5;

/** Smallest odd integer >= n. */
function oddUp(n: number): number {
  return n % 2 === 1 ? n : n + 1;
}

export function computePrintBoxDims(
  params: BoxParameters,
  innerW: number,
  innerD: number,
  innerH: number
): PrintBoxDims {
  const wall = Math.max(1.2, params.wallThickness3dMm);
  const floor = Math.max(1.2, params.floorThickness3dMm);
  const outerW = innerW + 2 * wall;
  const outerD = innerD + 2 * wall;

  // One lid-height clamp for the whole 3D box. The base interior never drops below 5 mm.
  const lidInner = Math.min(innerH - 8, Math.max(10, params.lidHeightMm));
  const baseH = Math.max(innerH - lidInner + floor, floor + MIN_BASE_INNER_H);
  const lidH = lidInner + floor;

  const rOut = Math.min(params.outerFilletMm, Math.min(outerW, outerD) * 0.25);
  const rIn = Math.min(params.innerFilletMm, Math.max(0.5, rOut - wall * 0.5));

  let hinge: PrintBoxDims['hinge'] = null;
  if (params.include3dHinge) {
    const hole = params.hingePinDiameterMm + PIN_CLEARANCE;
    const R = Math.max(MIN_HINGE_R, hole / 2 + wall);
    const runLen = Math.max(8, Math.min(outerW - 2 * (rOut + 2), 0.6 * outerW));
    const n = runLen < 24 ? 2 : Math.max(3, oddUp(Math.round(runLen / 14)));
    const knuckleW = (runLen - (n - 1) * KNUCKLE_GAP) / n;
    const start = (outerW - runLen) / 2;
    const segments = Array.from({ length: n }, (_, i) => {
      const x0 = start + i * (knuckleW + KNUCKLE_GAP);
      return { x0, x1: x0 + knuckleW, owner: (i % 2 === 0 ? 'base' : 'lid') as 'base' | 'lid' };
    });
    hinge = { R, hole, runLen, segments, axisY: outerD + R };
  }

  // The clasp sits on the flat front face, so it stays clear of the corner fillets. Below 4 mm
  // wide it is dropped, the same as when the toggle is off.
  const claspWidth = Math.max(
    0,
    Math.min(Math.min(18, Math.max(10, outerW * 0.25)), outerW - 2 * (params.outerFilletMm + 2))
  );
  const clasp: PrintBoxDims['clasp'] = params.includeSnapClasp && claspWidth >= 4
    ? {
        width: claspWidth,
        tongueT: 1.6,
        hang: 8,
        hookProud: 0.8,
        standoff: 1.0,
        ridgeH: 1.5,
        ridgeTop: 8 - 0.8 - 1.5 - 0.1,
      }
    : null;

  return {
    wall,
    floor,
    innerW,
    innerD,
    innerH,
    outerW,
    outerD,
    baseH,
    lidH,
    rOut,
    rIn,
    lip: { height: LIP_HEIGHT, thickness: Math.max(1, wall / 2), clearance: 0.2 },
    hinge,
    clasp,
  };
}
