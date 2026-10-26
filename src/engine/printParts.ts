import * as THREE from 'three';
import { BoxParameters } from './types';
import { buildRoundedRectPoints } from './roundedRect';

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
const CLASP_HANG = 8;
/** The tongue runs this far past the hook (the thumb lip). */
const CLASP_TIP = 2;
const CATCH_CLEARANCE = 0.3;

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

  const hole = params.hingePinDiameterMm + PIN_CLEARANCE;
  const R = Math.max(MIN_HINGE_R, hole / 2 + wall);

  // One lid-height clamp for the whole 3D box. The base interior never drops below 5 mm.
  let lidInner = Math.min(innerH - 8, Math.max(10, params.lidHeightMm));
  // The knuckle's fill prism reaches 2R below each part's rim, so both lidH and baseH must be at
  // least 2R + 1 to keep it above the bed. Raise a short lid; cap a tall lid (toward its 10 mm
  // minimum) so the base keeps 2R + 1 and its 5 mm interior. If no lid height satisfies both, the
  // box is too small for the hinge and it is dropped, leaving the lid clamp untouched.
  let hingeFits = params.include3dHinge;
  if (hingeFits) {
    const hingeH = 2 * R + 1;
    const lo = hingeH - floor;
    const hi = Math.min(innerH + floor - hingeH, innerH - MIN_BASE_INNER_H);
    const target = Math.min(Math.max(lidInner, lo), hi);
    if (target >= lo && target >= Math.min(10, lidInner)) lidInner = target;
    else hingeFits = false;
  }
  const baseH = Math.max(innerH - lidInner + floor, floor + MIN_BASE_INNER_H);
  const lidH = lidInner + floor;

  const rOut = Math.min(params.outerFilletMm, Math.min(outerW, outerD) * 0.25);
  const rIn = Math.min(params.innerFilletMm, Math.max(0.5, rOut - wall * 0.5));

  let hinge: PrintBoxDims['hinge'] = null;
  if (hingeFits) {
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
  // wide it is dropped, the same as when the toggle is off. The lid's tongue reaches hang + 2 below
  // the seam, so a base shorter than that plus 0.5 mm drops it too: the tongue would pass the bed.
  const claspWidth = Math.max(
    0,
    Math.min(Math.min(18, Math.max(10, outerW * 0.25)), outerW - 2 * (params.outerFilletMm + 2))
  );
  const claspFits = baseH >= CLASP_HANG + CLASP_TIP + 0.5;
  const clasp: PrintBoxDims['clasp'] = params.includeSnapClasp && claspWidth >= 4 && claspFits
    ? {
        width: claspWidth,
        tongueT: 1.6,
        hang: 8,
        hookProud: 0.8,
        standoff: 1.0,
        ridgeH: 1.5,
        // 0.3 mm catch clearance under the ridge, to survive FDM droop on the 0.8 mm catch faces.
        ridgeTop: CLASP_HANG - 0.8 - 1.5 - CATCH_CLEARANCE,
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

export type PrintPartId = 'shell' | 'lip' | 'hinge' | 'clasp';

/**
 * One closed primitive of a printed part, in the print frame. Pieces may overlap; the slicer
 * merges them. Contract for the STL writer: every geometry is non-indexed (no `index`), and its
 * `position` attribute holds consecutive triangles, so `position.count` is divisible by 3.
 */
export interface PrintPiece {
  partId: PrintPartId;
  geometry: THREE.BufferGeometry;
}

const CORNER_SEGMENTS = 8;
/**
 * How far the lip's anchor ring reaches below the rim. The visible lip is inset from the inner wall
 * by the clearance, so on its own it would float. The anchor ring (z baseH - LIP_EMBED..baseH)
 * extends out to the wall's mid-thickness line, overlapping the wall by wall/2, and carries the lip.
 */
const LIP_EMBED = 2;
/** Overlap between pieces that would otherwise share a face. */
const OVERLAP = 0.01;

function toShape(pts: { x: number; y: number }[]): THREE.Shape {
  return new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g;
}

/** Rounded-rectangle ring (outer boundary minus an inner hole), extruded along +Z from z0. */
function extrudeRing(
  outer: { x: number; y: number }[],
  inner: { x: number; y: number }[],
  z0: number,
  depth: number
): THREE.BufferGeometry {
  const shape = toShape(outer);
  shape.holes.push(new THREE.Path(inner.slice().reverse().map((p) => new THREE.Vector2(p.x, p.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  g.translate(0, 0, z0);
  return nonIndexed(g);
}

/**
 * The shell of one printed part, open side up: a plate on the bed (z 0..floor) with a bed chamfer,
 * and the wall ring from the plate to the rim. The base also gets the registration lip.
 *
 * The plate is a separate piece from the wall ring. With a chamfer, the plate's outline is inset
 * by the bevel size so the bevel brings it back out to exactly the outer footprint at mid height,
 * and the plate stays inside z 0..floor. The ring starts one bevel thickness below the plate top so
 * it covers the plate's upper bevel (and by OVERLAP with no chamfer); otherwise the bevel would leave a ledge around the wall base.
 */
export function buildShellPieces(
  dims: PrintBoxDims,
  part: 'base' | 'lid',
  chamfer: number
): PrintPiece[] {
  const { wall, floor, innerW, innerD, outerW, outerD, rOut, rIn } = dims;
  const rimH = part === 'base' ? dims.baseH : dims.lidH;
  const pieces: PrintPiece[] = [];

  // Same bevel rule as the old STL exporter.
  const bevelOn = chamfer > 0;
  const bevelSize = bevelOn ? Math.min(chamfer, wall * 0.4) : 0;
  const bevelThickness = bevelOn ? Math.min(chamfer, floor * 0.4) : 0;

  const plateOutline = buildRoundedRectPoints(
    outerW - 2 * bevelSize,
    outerD - 2 * bevelSize,
    Math.max(0, rOut - bevelSize),
    CORNER_SEGMENTS
  ).map((p) => ({ x: p.x + bevelSize, y: p.y + bevelSize }));
  const plate = new THREE.ExtrudeGeometry(toShape(plateOutline), {
    depth: floor - 2 * bevelThickness,
    bevelEnabled: bevelOn,
    bevelSize,
    bevelThickness,
    bevelSegments: 1,
  });
  // ExtrudeGeometry's bevel starts at z = -bevelThickness; lift it onto the bed.
  plate.translate(0, 0, bevelThickness);
  pieces.push({ partId: 'shell', geometry: nonIndexed(plate) });

  const outerPts = buildRoundedRectPoints(outerW, outerD, rOut, CORNER_SEGMENTS);
  const innerPts = buildRoundedRectPoints(innerW, innerD, rIn, CORNER_SEGMENTS).map((p) => ({
    x: p.x + wall,
    y: p.y + wall,
  }));
  const ringStart = floor - Math.max(bevelThickness, OVERLAP);
  pieces.push({
    partId: 'shell',
    geometry: extrudeRing(outerPts, innerPts, ringStart, rimH - ringStart),
  });

  if (part === 'base') {
    const { thickness, clearance, height } = dims.lip;
    const w = innerW - 2 * clearance;
    const d = innerD - 2 * clearance;
    const r = Math.max(0.5, rIn - clearance);
    const lipOuter = buildRoundedRectPoints(w, d, r, CORNER_SEGMENTS).map((p) => ({
      x: p.x + wall + clearance,
      y: p.y + wall + clearance,
    }));
    const lipInner = buildRoundedRectPoints(
      w - 2 * thickness,
      d - 2 * thickness,
      Math.max(0, r - thickness),
      CORNER_SEGMENTS
    ).map((p) => ({
      x: p.x + wall + clearance + thickness,
      y: p.y + wall + clearance + thickness,
    }));
    // Anchor ring: wall mid-thickness line in, lip inner boundary out. Overlaps the wall by wall/2.
    const half = wall / 2;
    const anchorOuter = buildRoundedRectPoints(
      outerW - wall,
      outerD - wall,
      Math.max(0.5, rOut - half),
      CORNER_SEGMENTS
    ).map((p) => ({ x: p.x + half, y: p.y + half }));
    pieces.push({
      partId: 'lip',
      geometry: extrudeRing(anchorOuter, lipInner, dims.baseH - LIP_EMBED, LIP_EMBED),
    });
    // Visible ring: inset by the clearance, rising `height` above the rim.
    pieces.push({
      partId: 'lip',
      geometry: extrudeRing(lipOuter, lipInner, dims.baseH - OVERLAP, height + OVERLAP),
    });
  }

  return pieces;
}

// The bore is an inscribed 24-gon, so its effective diameter is hole * cos(7.5 deg): about 0.23 mm
// clearance on a 1.75 mm pin, not the nominal 0.25.
const KNUCKLE_SEGMENTS = 24;

/** `n` points on a circle of radius `r` centred at (cx, cy), counter-clockwise. */
function circlePoints(cx: number, cy: number, r: number, n: number): THREE.Vector2[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
  });
}

/**
 * Extrudes a shape drawn in the Y-Z plane (shape x -> world y, shape y -> world z) along +X from
 * x0 to x1. ExtrudeGeometry extrudes along local Z; the cyclic axis swap (x, y, z) -> (z, x, y) is a
 * proper rotation (det +1, so winding is preserved) that sends local Z to world +X.
 */
function extrudeAlongX(shape: THREE.Shape, x0: number, x1: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  g.translate(x0, 0, 0);
  return nonIndexed(g);
}

/**
 * The knuckles one part owns, in that part's print frame (open side up). Each knuckle is an
 * annulus (outer R, inner hole/2) around the hinge axis (y = axisY, z = rim), plus a fill prism
 * whose Y-Z cross-section is the quadrilateral (outerD - wall/2, rim - 2R) -> (outerD, rim - 2R)
 * -> (outerD + 2R, rim) -> (outerD - wall/2, rim). The prism runs from the back wall out under the
 * cylinder at 45 degrees, so nothing overhangs more than 45 degrees and the knuckle prints without
 * supports. Its wall-side edge sits at the wall's mid-thickness line, so the knuckle is embedded
 * in the wall rather than touching its face.
 *
 * `segments[].owner` and the segment x-ranges are in WORLD x. The base prints in world
 * orientation, so it uses [x0, x1] as given. The lid prints open side up and is rotated pi about
 * its front-back axis into the world, which mirrors its x; its knuckles are built at the mirrored
 * range [outerW - x1, outerW - x0] so they land on [x0, x1] once assembled.
 */
export function buildHingePieces(dims: PrintBoxDims, part: 'base' | 'lid'): PrintPiece[] {
  const { hinge, outerW, outerD } = dims;
  if (!hinge) return [];
  const { R, hole, axisY } = hinge;
  const rim = part === 'base' ? dims.baseH : dims.lidH;
  // The fill reaches into the back wall to its mid-thickness line, like the lip anchor.
  const embedY = outerD - dims.wall / 2;
  const pieces: PrintPiece[] = [];

  for (const seg of hinge.segments) {
    if (seg.owner !== part) continue;
    const [x0, x1] = part === 'base' ? [seg.x0, seg.x1] : [outerW - seg.x1, outerW - seg.x0];

    const ring = new THREE.Shape(circlePoints(axisY, rim, R, KNUCKLE_SEGMENTS));
    ring.holes.push(new THREE.Path(circlePoints(axisY, rim, hole / 2, KNUCKLE_SEGMENTS).reverse()));
    pieces.push({ partId: 'hinge', geometry: extrudeAlongX(ring, x0, x1) });

    const fill = new THREE.Shape([
      new THREE.Vector2(embedY, rim - 2 * R),
      new THREE.Vector2(outerD, rim - 2 * R),
      new THREE.Vector2(outerD + 2 * R, rim),
      new THREE.Vector2(embedY, rim),
    ]);
    pieces.push({ partId: 'hinge', geometry: extrudeAlongX(fill, x0, x1) });
  }

  return pieces;
}

/** How far the boss reaches down the lid's front face from the rim, print z. */
const BOSS_H = 4;
/** Thumb lip: the tongue's last THUMB_LEN mm flare THUMB_FLARE mm away from the box. */
const THUMB_LEN = CLASP_TIP;
const THUMB_FLARE = 1;

/** A Y-Z polygon (shape x -> world y, shape y -> world z) extruded across x0..x1. */
function yzPrism(pts: [number, number][], x0: number, x1: number): PrintPiece {
  const shape = new THREE.Shape(pts.map(([y, z]) => new THREE.Vector2(y, z)));
  return { partId: 'clasp', geometry: extrudeAlongX(shape, x0, x1) };
}

/**
 * The cantilever snap clasp on the front face (y = 0), in the part's print frame (open side up),
 * centred on x = outerW / 2 (so the lid's x mirror into the world leaves it in place).
 *
 * Base: a catch ridge, y -hookProud..wall/2 (embedded into the wall to its mid-thickness line),
 * z rim - ridgeTop - ridgeH .. rim - ridgeTop. Its outer top edge is chamfered 45 degrees (the
 * lead-in the descending hook rides over); its flat underside is the catch face.
 *
 * Lid: a boss on the front face (z rim - 4..rim, y -(standoff + tongueT)..wall/2), its underside
 * chamfered so nothing overhangs past 45 degrees; a tongue rising from the rim to rim + hang + 2
 * with its inner face `standoff` off the front face; a hook on the tongue's inner face, proud
 * `hookProud` toward the box, a 45 degree triangle at z rim + hang - hookProud .. rim + hang; and a
 * thumb lip on the tongue's outer face over its last 2 mm. The lid prints rim-down in the world, so
 * print "up" is world "down": the hook's flat face at z = rim + hang - hookProud is its top in the
 * world (it seats 0.3 mm under the ridge's underside), and its 45 degree ramp is the lead-in.
 */
export function buildClaspPieces(dims: PrintBoxDims, part: 'base' | 'lid'): PrintPiece[] {
  const { clasp, outerW, wall } = dims;
  if (!clasp) return [];
  const { width, tongueT, hang, hookProud, standoff, ridgeH, ridgeTop } = clasp;
  const cx = outerW / 2;
  const embedY = wall / 2;

  if (part === 'base') {
    const rim = dims.baseH;
    const top = rim - ridgeTop;
    const bottom = top - ridgeH;
    return [
      yzPrism(
        [
          [embedY, bottom],
          [-hookProud, bottom],
          [-hookProud, top - hookProud],
          [0, top],
          [embedY, top],
        ],
        cx - (width + 1) / 2,
        cx + (width + 1) / 2
      ),
    ];
  }

  const rim = dims.lidH;
  const outY = -(standoff + tongueT);
  const inY = -standoff;
  const tipZ = rim + hang + THUMB_LEN;
  const hookZ0 = rim + hang - hookProud;
  const hookZ1 = rim + hang;
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  return [
    // Boss: full height at the wall, chamfered 45 degrees underneath toward the tongue.
    yzPrism(
      [
        [embedY, rim - BOSS_H],
        [0, rim - BOSS_H],
        [outY, rim - BOSS_H - outY],
        [outY, rim],
        [embedY, rim],
      ],
      cx - (width + 2) / 2,
      cx + (width + 2) / 2
    ),
    // Tongue, overlapping the boss by OVERLAP.
    yzPrism(
      [
        [outY, rim - OVERLAP],
        [inY, rim - OVERLAP],
        [inY, tipZ],
        [outY, tipZ],
      ],
      x0,
      x1
    ),
    // Hook: a 45 degree triangle, flat catch face at hookZ0, ramp back to the tongue at hookZ1.
    // Engagement is hookProud - (standoff - hookProud) = 0.6 mm in Y (hook -1.0..-0.2 vs ridge
    // -0.8..0), with 0.3 mm Z clearance under the ridge after the snap: the catch face is
    // hang - hookProud = 7.2 below the seam in the world, the ridge underside 6.9. The hook's back
    // edge reaches OVERLAP into the tongue so the two do not merely share a face.
    yzPrism(
      [
        [inY - OVERLAP, hookZ0],
        [inY + hookProud, hookZ0],
        [inY, hookZ1],
        [inY - OVERLAP, hookZ1],
      ],
      x0,
      x1
    ),
    // Thumb lip on the tongue's outer face, reaching OVERLAP into the tongue.
    yzPrism(
      [
        [outY + OVERLAP, tipZ - THUMB_LEN],
        [outY + OVERLAP, tipZ],
        [outY - THUMB_FLARE, tipZ],
        [outY, tipZ - THUMB_LEN],
      ],
      x0,
      x1
    ),
  ];
}
