import * as THREE from 'three';
import { BoxParameters } from './types';
import { buildRoundedRectPoints } from './roundedRect';
import { resolveDividers } from './printDividers';

/**
 * Dimensions of the 3D-printed box: two shells, a registration lip, a filament-pin knuckle
 * hinge, and a snap clasp. Pure numbers only; later code builds geometry from them.
 *
 * Print frame (shared by both parts): X runs across the front, 0..outerW. Y runs front to back,
 * with the FRONT face at y = 0 and the BACK face at y = outerD. Z is up from the bed, 0..baseH
 * (or 0..lidH). The hinge axis sits behind the back face (axisY = outerD + R + 0.3, so each knuckle
 * clears the other part's back wall by 0.3 mm radially); clasp features sit in front of the front
 * face (y < 0).
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
    tongueT: number;
    /** How far the hook's lower end hangs below the seam. */
    hang: number;
    /** How far the hook stands in from the tongue toward the box. */
    hookProud: number;
    /** How far the base's ridge stands out from the front face. */
    ridgeProud: number;
    /** The tongue's inner face, off the front face: the ridge plus 0.2 mm. */
    standoff: number;
    /** The ridge's height up the wall: two 45 degree faces and a flat between. */
    ridgeH: number;
    /** Distance below the rim of the ridge's top edge. */
    ridgeTop: number;
  } | null;
  /**
   * Magnet pockets: a column standing in each front corner of both parts, a pocket in its top for
   * a disc magnet, the base's and lid's columns meeting at the seam. Positions are column centres in
   * the base's frame; they're symmetric across the box, so the lid's x mirror leaves them in place.
   */
  magnets: {
    /** Pocket diameter and depth: the magnet's plus 0.2 mm. */
    pocketD: number;
    pocketDepth: number;
    /** Column radius. */
    columnR: number;
    centres: { x: number; y: number }[];
  } | null;
  /**
   * Why a switched-on feature came out null: `hinge-height` (no lid height keeps both parts 2R + 1.3
   * tall), `clasp-width` (the flat front face leaves under 4 mm for the clasp), `clasp-height` (the
   * base cannot reach the tongue's 10.5 mm without pushing the lid under its minimum). Empty when
   * every switched-on feature is present. `magnet-room`: the front corners leave no room for the
   * magnet columns.
   */
  dropped: PrintDroppedFeature[];
}

export type PrintDroppedFeature = 'clasp-height' | 'clasp-width' | 'hinge-height' | 'magnet-room';

/**
 * Gap between neighbouring knuckles along the hinge. A printed box bound at 0.3 mm: FDM prints each
 * knuckle's ends a little proud, so they rubbed.
 */
export const KNUCKLE_GAP = 0.5;
/** Radial clearance between a knuckle and the other part's back-wall edge as the lid swings. */
export const KNUCKLE_CLEARANCE = 0.5;
const MIN_HINGE_R = 2.6;
/** The bore over the pin's diameter. Horizontal holes print small, so it's more than a vertical hole needs. */
export const PIN_CLEARANCE = 0.4;
const LIP_HEIGHT = 3;
const MIN_BASE_INNER_H = 5;
/**
 * The clasp. Both catch faces print as 45 degree slopes (a flat ledge printed in mid-air sags into a
 * slope anyway, and then the hook slides off), so the latch holds by the tongue's stiffness: the hook
 * overlaps the ridge by 1.2 mm, and opening it bends the tongue 1.2 mm out. A 12 mm tongue keeps that
 * bend under 2% strain in PLA.
 */
const CLASP_HANG = 12;
const CLASP_TONGUE_T = 1.6;
/** The hook's and the ridge's 45 degree faces each run this far in Y. */
const CLASP_PROUD = 1.4;
/** The flat between the two 45 degree faces of the hook, and of the ridge. */
const CLASP_FLAT = 0.6;
/** The tongue's inner face clears the ridge by this, and the hook's tip clears the wall by it. */
const CLASP_GAP = 0.2;
/** The tongue runs this far past the hook (the thumb lip). */
const CLASP_TIP = 2;
/** Vertical gap between the hook's catch face and the ridge's when the lid is shut. */
const CATCH_CLEARANCE = 0.3;
/** A 6 x 3 mm disc magnet's pocket: 0.2 mm over in each. */
const MAGNET_POCKET_D = 6.2;
const MAGNET_POCKET_DEPTH = 3.2;
/** The column's wall around the pocket. */
const MAGNET_WALL = 1.2;
/** The lid's columns clear the base's registration lip by this. */
const MAGNET_LIP_GAP = 0.3;
/** The lid's tongue reaches hang + tip below the seam; the base must be 0.5 mm taller than that. */
const CLASP_MIN_BASE_H = CLASP_HANG + CLASP_TIP + 0.5;

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

  const rOut = Math.min(params.outerFilletMm, Math.min(outerW, outerD) * 0.25);
  const rIn = Math.min(params.innerFilletMm, Math.max(0.5, rOut - wall * 0.5));

  const dropped: PrintDroppedFeature[] = [];
  // One lid-height clamp for the whole 3D box. The base interior never drops below 5 mm.
  let lidInner = Math.min(innerH - 8, Math.max(10, params.lidHeightMm));
  // The knuckle's fill prism reaches 2R + 0.3 below each part's rim, so both lidH and baseH must be
  // at least 2R + 0.3 + 1 to keep it above the bed. Raise a short lid; cap a tall lid (toward its
  // 10 mm minimum) so the base keeps 2R + 1.3 and its 5 mm interior. If no lid height satisfies
  // both, the box is too small for the hinge and it is dropped, leaving the lid clamp untouched.
  let hingeFits = params.include3dHinge;
  let hingeLidMin = -Infinity;
  if (hingeFits) {
    const hingeH = 2 * R + KNUCKLE_CLEARANCE + 1;
    const lo = hingeH - floor;
    const hi = Math.min(innerH + floor - hingeH, innerH - MIN_BASE_INNER_H);
    const target = Math.min(Math.max(lidInner, lo), hi);
    if (target >= lo && target >= Math.min(10, lidInner)) {
      lidInner = target;
      hingeLidMin = lo;
    } else {
      hingeFits = false;
      dropped.push('hinge-height');
    }
  }

  // The clasp sits on the flat front face, so it stays clear of the corner fillets (the real,
  // clamped radius rOut) with 2 mm to spare on each side, measured to the clasp's own width. Below 4 mm
  // wide it is dropped, the same as when the toggle is off. The lid's tongue reaches hang + 2 below
  // the seam, so the base must be at least that plus 0.5 mm tall or the tongue would pass the bed:
  // cap a tall lid the way the hinge does (not under its 10 mm minimum, nor under the hinge's
  // minimum). If that cannot be done, the clasp is dropped and the lid stays as it was.
  const claspWidth = Math.max(
    0,
    Math.min(Math.min(18, Math.max(10, outerW * 0.25)), outerW - 2 * (rOut + 2))
  );
  let claspFits = params.includeSnapClasp;
  if (claspFits && claspWidth < 4) {
    claspFits = false;
    dropped.push('clasp-width');
  }
  if (claspFits) {
    const target = Math.min(lidInner, innerH + floor - CLASP_MIN_BASE_H);
    if (target >= Math.min(10, lidInner) && target >= hingeLidMin) {
      lidInner = target;
    } else {
      claspFits = false;
      dropped.push('clasp-height');
    }
  }

  const baseH = Math.max(innerH - lidInner + floor, floor + MIN_BASE_INNER_H);
  const lidH = lidInner + floor;

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
    hinge = { R, hole, runLen, segments, axisY: outerD + R + KNUCKLE_CLEARANCE };
  }

  // The ridge's catch face sits CATCH_CLEARANCE above the hook's when shut. Its foot at the wall is
  // hang - proud - flat - (clearance - gap) below the seam (the hook's tip is `gap` off the wall),
  // and it rises at 45 degrees from there.
  const ridgeH = 2 * CLASP_PROUD + CLASP_FLAT;
  const ridgeFoot = CLASP_HANG - CLASP_PROUD - CLASP_FLAT - (CATCH_CLEARANCE - CLASP_GAP);
  const clasp: PrintBoxDims['clasp'] = claspFits
    ? {
        width: claspWidth,
        tongueT: CLASP_TONGUE_T,
        hang: CLASP_HANG,
        hookProud: CLASP_PROUD,
        ridgeProud: CLASP_PROUD,
        standoff: CLASP_PROUD + CLASP_GAP,
        ridgeH,
        ridgeTop: ridgeFoot - ridgeH,
      }
    : null;

  // Magnet columns in the front corners, inside the base's registration lip (which rises into the
  // lid) with MAGNET_LIP_GAP to spare, and clear of the lip's rounded corner.
  let magnets: PrintBoxDims['magnets'] = null;
  if (params.include3dMagnets) {
    const lipT = Math.max(1, wall / 2);
    const lipInnerR = Math.max(0, Math.max(0.5, rIn - 0.2) - lipT);
    const columnR = MAGNET_POCKET_D / 2 + MAGNET_WALL;
    const edge = 0.2 + lipT + MAGNET_LIP_GAP;
    const inset = edge + Math.max(columnR, lipInnerR - MAGNET_LIP_GAP);
    const roomW = innerW - 2 * inset;
    const roomD = innerD - inset - columnR - 1;
    if (roomW >= 1 && roomD >= 0) {
      const y = wall + inset;
      magnets = {
        pocketD: MAGNET_POCKET_D,
        pocketDepth: MAGNET_POCKET_DEPTH,
        columnR,
        centres: [
          { x: wall + inset, y },
          { x: outerW - wall - inset, y },
        ],
      };
    } else dropped.push('magnet-room');
  }

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
    magnets,
    dropped,
  };
}

export type PrintPartId = 'shell' | 'lip' | 'hinge' | 'clasp' | 'divider';

/**
 * One closed primitive of a printed part, in the print frame. Pieces may overlap; the slicer
 * merges them. Contract for the STL writer: every geometry is non-indexed (no `index`), and its
 * `position` attribute holds consecutive triangles, so `position.count` is divisible by 3.
 */
export interface PrintPiece {
  partId: PrintPartId;
  geometry: THREE.BufferGeometry;
  /** Which divider a `divider` piece is. */
  dividerId?: string;
}

const CORNER_SEGMENTS = 8;
/**
 * How far the lip's anchor ring reaches below the rim. The visible lip is inset from the inner wall
 * by the clearance, so on its own it would float. The anchor ring (z baseH - LIP_EMBED..baseH)
 * extends out to the wall's mid-thickness line, overlapping the wall by wall/2, and carries the lip.
 */
const LIP_EMBED = 2;
/**
 * The anchor ring's underside would be a flat ledge clearance + thickness wide inside the cavity.
 * A staircase of rings LIP_STEP tall, each stepping LIP_STEP further in from the inner wall face,
 * carries it at 45 degrees instead.
 */
const LIP_STEP = 0.25;
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
    // 45 degree staircase under the anchor ring: ring k (from the bottom) is inset k * LIP_STEP from
    // the inner wall outline (the last one reaches the lip's inner boundary), so no step overhangs
    // its own height. The stack spans z anchorZ - ledge..anchorZ; each ring overlaps the next.
    const anchorZ = dims.baseH - LIP_EMBED;
    const ledge = clearance + thickness;
    const steps = Math.ceil(ledge / LIP_STEP - 1e-6);
    for (let k = 1; k <= steps; k++) {
      const inset = Math.min(k * LIP_STEP, ledge);
      const z0 = anchorZ - ledge + (k - 1) * LIP_STEP;
      const z1 = Math.min(anchorZ - ledge + k * LIP_STEP, anchorZ);
      // A step wholly inside the floor plate (a very short base with a thick wall) is not needed.
      if (z1 <= floor) continue;
      const bottom = Math.max(z0, floor - OVERLAP);
      const stepInner =
        k === steps
          ? lipInner
          : buildRoundedRectPoints(
              innerW - 2 * inset,
              innerD - 2 * inset,
              Math.max(0.5, rIn - inset),
              CORNER_SEGMENTS
            ).map((p) => ({ x: p.x + wall + inset, y: p.y + wall + inset }));
      pieces.push({
        partId: 'lip',
        geometry: extrudeRing(anchorOuter, stepInner, bottom, z1 - bottom + OVERLAP),
      });
    }
    pieces.push({
      partId: 'lip',
      geometry: extrudeRing(anchorOuter, lipInner, anchorZ, LIP_EMBED),
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
 * The bore's lower semicircle from (cy + r, cz) clockwise under the axis to (cy - r, cz): the
 * KNUCKLE_SEGMENTS / 2 edges of the bore's inscribed polygon that lie below the axis.
 */
function boreUnderside(cy: number, cz: number, r: number): THREE.Vector2[] {
  const half = KNUCKLE_SEGMENTS / 2;
  return Array.from({ length: half + 1 }, (_, i) => {
    const a = -(i / half) * Math.PI;
    return new THREE.Vector2(cy + r * Math.cos(a), cz + r * Math.sin(a));
  });
}

/**
 * A pin bore that prints without sagging: round below the axis and up to 45 degrees either side,
 * then two straight 45 degree sides meeting in a point r * sqrt(2) above the axis (print up). A round
 * bore's roof is a flat bridge over the pin and droops onto it; this one's roof is two 45 degree
 * slopes. Counter-clockwise, starting at the right tangent point.
 */
function teardropPoints(cy: number, cz: number, r: number): THREE.Vector2[] {
  const steps = (KNUCKLE_SEGMENTS * 3) / 4;
  const arc = Array.from({ length: steps + 1 }, (_, i) => {
    const a = Math.PI / 4 + Math.PI / 2 + (i / steps) * (Math.PI * 3) / 2;
    return new THREE.Vector2(cy + r * Math.cos(a), cz + r * Math.sin(a));
  });
  return [...arc, new THREE.Vector2(cy, cz + r * Math.SQRT2)];
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
 * annulus (outer R, inner hole/2) around the hinge axis (y = axisY = outerD + R + 0.3, z = rim),
 * plus a fill prism whose Y-Z cross-section is (outerD - wall/2, rim - 2R - 0.3) ->
 * (outerD, rim - 2R - 0.3) -> (axisY + R, rim) -> along z = rim to the bore, under the bore's lower
 * semicircle, and on along z = rim back to (outerD - wall/2, rim). The annulus stands 0.3 mm off
 * the back face, so the other part's wall edge (on the rim, at y = outerD) is R + 0.3 from the axis
 * and clears this knuckle by 0.3 mm as the lid swings; the fill bridges that gap below the rim. The
 * prism runs from the back wall out under the
 * cylinder at 45 degrees, so nothing overhangs more than 45 degrees and the knuckle prints without
 * supports. Its wall-side edge sits at the wall's mid-thickness line, so the knuckle is embedded
 * in the wall rather than touching its face.
 *
 * `segments[].owner` and the segment x-ranges are in WORLD x. The base prints in world
 * orientation, so it uses [x0, x1] as given. The lid prints open side up and is rotated pi about
 * its front-back axis into the world, which mirrors its x; its knuckles are built at the mirrored
 * range [outerW - x1, outerW - x0] so they land on [x0, x1] once assembled.
 */
/**
 * A lid-owned knuckle's x-range in the lid's print frame. Segment ranges are in WORLD x; the lid is
 * turned pi about its front-back axis into the world, which mirrors x, so it prints at
 * [outerW - x1, outerW - x0]. Shared by the lid's geometry and its blueprint.
 */
export function lidPrintRange(seg: { x0: number; x1: number }, outerW: number): [number, number] {
  return [outerW - seg.x1, outerW - seg.x0];
}

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
    const [x0, x1] = part === 'base' ? [seg.x0, seg.x1] : lidPrintRange(seg, outerW);

    const ring = new THREE.Shape(circlePoints(axisY, rim, R, KNUCKLE_SEGMENTS));
    ring.holes.push(new THREE.Path(teardropPoints(axisY, rim, hole / 2).reverse()));
    pieces.push({ partId: 'hinge', geometry: extrudeAlongX(ring, x0, x1) });

    // The fill's top edge dips under the bore along its lower semicircle (the same vertices as the
    // bore's inscribed 24-gon), so fill and annulus together leave the whole bore open.
    // The 45 degree face runs from the back face up to the annulus's far side.
    const fillBottom = rim - (axisY - outerD) - R;
    const fill = new THREE.Shape([
      new THREE.Vector2(embedY, fillBottom),
      new THREE.Vector2(outerD, fillBottom),
      new THREE.Vector2(axisY + R, rim),
      ...boreUnderside(axisY, rim, hole / 2),
      new THREE.Vector2(embedY, rim),
    ]);
    pieces.push({ partId: 'hinge', geometry: extrudeAlongX(fill, x0, x1) });
  }

  return pieces;
}

/** How far the boss reaches down the lid's front face from the rim, print z. */
const BOSS_H = 4;
/** Thumb lip: the tongue's last THUMB_LEN mm flare CLASP_THUMB_FLARE mm away from the box. */
const THUMB_LEN = CLASP_TIP;
export const CLASP_THUMB_FLARE = 1;

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
  const { width, tongueT, hang, hookProud, ridgeProud, standoff, ridgeH, ridgeTop } = clasp;
  const cx = outerW / 2;
  const embedY = wall / 2;

  if (part === 'base') {
    const rim = dims.baseH;
    const top = rim - ridgeTop;
    const bottom = top - ridgeH;
    // Both faces at 45 degrees: the catch face underneath, the lead-in on top, a flat between.
    return [
      yzPrism(
        [
          [embedY, bottom],
          [0, bottom],
          [-ridgeProud, bottom + ridgeProud],
          [-ridgeProud, top - ridgeProud],
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
  // The hook in print z: its lead-in ends at hookZ1 (its lowest point in the world), its flat runs
  // from hookZ0 up to hookZ1 - proud, and its catch face slopes from hookZ0 down to the tongue.
  const hookZ1 = rim + hang;
  const hookZ0 = hookZ1 - hookProud - (ridgeH - 2 * hookProud);
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
    // Hook: a 45 degree catch face (it prints without support, and lies parallel to the ridge's
    // underside once shut), a flat tip, and a 45 degree lead-in back to the tongue at hookZ1. It
    // overlaps the ridge by hookProud - (standoff - ridgeProud) = 1.2 mm in Y. Its back edge reaches
    // OVERLAP into the tongue so the two do not merely share a face.
    yzPrism(
      [
        [inY - OVERLAP, hookZ0 - hookProud],
        [inY, hookZ0 - hookProud],
        [inY + hookProud, hookZ0],
        [inY + hookProud, hookZ1 - hookProud],
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
        [outY - CLASP_THUMB_FLARE, tipZ],
        [outY, tipZ - THUMB_LEN],
      ],
      x0,
      x1
    ),
  ];
}

/** A circle's outline, `n` points counter-clockwise. */
const circleXY = (cx: number, cy: number, r: number, n = 32) =>
  Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((i / n) * 2 * Math.PI), y: cy + r * Math.sin((i / n) * 2 * Math.PI) }));

/**
 * The magnet columns of one part, in its print frame (open side up): each a solid cylinder from the
 * plate up to the pocket's floor, then a ring around the pocket up to the rim. The pocket opens up,
 * so nothing overhangs. Built at the same x in both parts: the centres are symmetric across the box.
 */
export function buildMagnetPieces(dims: PrintBoxDims, part: 'base' | 'lid'): PrintPiece[] {
  const { magnets, floor } = dims;
  if (!magnets) return [];
  const rim = part === 'base' ? dims.baseH : dims.lidH;
  const pocketFloor = rim - magnets.pocketDepth;
  return magnets.centres.flatMap(({ x, y }) => {
    const solid = new THREE.ExtrudeGeometry(toShape(circleXY(x, y, magnets.columnR)), {
      depth: pocketFloor - (floor - OVERLAP),
      bevelEnabled: false,
    });
    solid.translate(0, 0, floor - OVERLAP);
    return [
      { partId: 'shell' as const, geometry: nonIndexed(solid) },
      {
        partId: 'shell' as const,
        geometry: extrudeRing(circleXY(x, y, magnets.columnR), circleXY(x, y, magnets.pocketD / 2), pocketFloor - OVERLAP, magnets.pocketDepth + OVERLAP),
      },
    ];
  });
}

/** The lowest divider worth printing. */
const MIN_DIVIDER_HEIGHT = 2;

/**
 * How tall the dividers stand above the floor: the user's height, or up to the base rim. Never
 * above the rim, so a divider can't reach into the lid.
 */
export function resolveDividerHeight(params: BoxParameters, dims: PrintBoxDims): number {
  const max = dims.baseH - dims.floor;
  if (!(params.dividerHeight3dMm > 0)) return max;
  return Math.min(max, Math.max(Math.min(MIN_DIVIDER_HEIGHT, max), params.dividerHeight3dMm));
}

/**
 * The base's dividers, one box each, in the print frame. Each box sinks OVERLAP into the floor.
 * An end on a wall runs to the wall's mid-thickness line, like the lip anchor; an end on another
 * divider already reaches that divider's centerline. The slicer merges the overlaps.
 */
export function buildDividerPieces(params: BoxParameters, dims: PrintBoxDims): PrintPiece[] {
  const { layout, space } = resolveDividers(params, dims.innerW, dims.innerD, dims.rIn);
  if (layout.length === 0) return [];
  const height = resolveDividerHeight(params, dims);
  const { wall, floor } = dims;
  return layout.map((d) => {
    const length = d.axis === 'y' ? space.d : space.w;
    const a0 = wall + d.from - (d.from <= 1e-6 ? wall / 2 : 0);
    const a1 = wall + d.to + (d.to >= length - 1e-6 ? wall / 2 : 0);
    const c0 = wall + d.pos - space.t / 2;
    const [x0, x1, y0, y1] = d.axis === 'y' ? [c0, c0 + space.t, a0, a1] : [a0, a1, c0, c0 + space.t];
    const z0 = floor - OVERLAP;
    const z1 = floor + height;
    const box = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    box.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return { partId: 'divider' as const, geometry: nonIndexed(box), dividerId: d.id };
  });
}
