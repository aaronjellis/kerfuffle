import {
  BoxDims,
  BoxPanel2D,
  BoxParameters,
  DielinePath,
  Panel3DTransform,
  Point2D,
} from './types';
import { fmt, pointsToSvgPath } from './fingerJointEngine';
import { CLASP_THUMB_FLARE, computePrintBoxDims, lidPrintRange } from './printParts';
import { buildRoundedRectPoints } from './roundedRect';

export function generate3DPrintBox(
  params: BoxParameters,
  innerW: number,
  innerD: number,
  innerH: number
): {
  panels2D: BoxPanel2D[];
  panels3D: Panel3DTransform[];
  summary: string;
  outerDims: BoxDims;
} {
  const dims = computePrintBoxDims(params, innerW, innerD, innerH);
  const { wall, floor, outerW, outerD, baseH, lidH: lidTotalH, rOut, rIn, hinge, clasp } = dims;

  // 2D plan blueprints, one per part, each drawn in that part's print frame (plate on the bed):
  // front face at y = 0, back at y = outerD. The lid's hinge segments are mirrored in x, as it
  // prints. Mechanism footprints sit outside the outline: knuckles behind the back edge, standing
  // off it by the radial clearance (y outerD + 0.3..outerD + 0.3 + 2R), clasp in front of the front
  // edge (y < 0). Each plan is shifted down by its front feature's depth so the whole drawing stays
  // inside the panel's 0..heightMm.
  const knuckleGap = hinge ? hinge.axisY - outerD - hinge.R : 0;
  const knuckleDepth = hinge ? knuckleGap + 2 * hinge.R : 0;
  const rectPath = (x0: number, y0: number, x1: number, y1: number) =>
    `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)} L ${fmt(x0)} ${fmt(y1)} Z`;

  const buildPlan = (part: 'base' | 'lid'): { paths: DielinePath[]; oy: number; heightMm: number } => {
    // Base: the catch ridge. Lid: boss, tongue and the thumb lip that flares past the tongue.
    const frontDepth = clasp
      ? part === 'base'
        ? clasp.hookProud
        : clasp.standoff + clasp.tongueT + CLASP_THUMB_FLARE
      : 0;
    const oy = frontDepth;
    const shift = (pts: Point2D[]) => pts.map((p) => ({ x: p.x, y: p.y + oy }));
    const outerPts = shift(buildRoundedRectPoints(outerW, outerD, rOut, 8));
    const innerPts = shift(
      buildRoundedRectPoints(innerW, innerD, rIn, 8).map((p) => ({ x: p.x + wall, y: p.y + wall }))
    );
    const paths: DielinePath[] = [
      { id: `3d-${part}-outer`, layer: 'cut', d: pointsToSvgPath(outerPts, true), closed: true },
      { id: `3d-${part}-inner`, layer: 'score', d: pointsToSvgPath(innerPts, true), closed: true },
    ];

    if (hinge) {
      hinge.segments.forEach((seg, i) => {
        if (seg.owner !== part) return;
        const [x0, x1] = part === 'base' ? [seg.x0, seg.x1] : lidPrintRange(seg, outerW);
        paths.push({
          id: `3d-hinge-knuckle-${i}`,
          layer: 'cut',
          d: rectPath(x0, outerD + knuckleGap + oy, x1, outerD + knuckleDepth + oy),
          closed: true,
        });
      });
      if (part === 'base') {
        const first = hinge.segments[0];
        const last = hinge.segments[hinge.segments.length - 1];
        const y = hinge.axisY + oy;
        paths.push({
          id: '3d-hinge-pin',
          layer: 'score',
          d: `M ${fmt(first.x0)} ${fmt(y)} L ${fmt(last.x1)} ${fmt(y)}`,
          closed: false,
        });
      }
    }

    if (clasp) {
      const w = part === 'base' ? clasp.width + 1 : clasp.width + 2;
      const x0 = (outerW - w) / 2;
      paths.push({
        id: part === 'base' ? '3d-clasp-catch' : '3d-clasp-boss',
        layer: 'cut',
        d: rectPath(x0, oy - frontDepth, x0 + w, oy),
        closed: true,
      });
    }

    return { paths, oy, heightMm: frontDepth + outerD + knuckleDepth };
  };

  const basePlan = buildPlan('base');
  const lidPlan = buildPlan('lid');

  const basePanel2D: BoxPanel2D = {
    id: 'base-3d-plan',
    name: `3D Print Base Shell (${fmt(outerW)}×${fmt(outerD)}×${fmt(baseH)} mm)`,
    faceLabel: '3D base shell (print bed)',
    widthMm: outerW,
    heightMm: basePlan.heightMm,
    safeRect: { x: wall, y: wall + basePlan.oy, width: innerW, height: innerD },
    sheetX: 0,
    sheetY: 0,
    paths: basePlan.paths,
  };

  const lidPanel2D: BoxPanel2D = {
    id: 'lid-3d-plan',
    name: `3D Print Hinged Lid (${fmt(outerW)}×${fmt(outerD)}×${fmt(lidTotalH)} mm)`,
    faceLabel: '3D lid shell (print bed)',
    widthMm: outerW,
    heightMm: lidPlan.heightMm,
    safeRect: { x: wall, y: wall + lidPlan.oy, width: innerW, height: innerD },
    sheetX: 0,
    sheetY: 0,
    paths: lidPlan.paths,
  };

  const explodeDist = Math.max(outerW, outerD, innerH) * 0.45;
  const totalOuterH = baseH + lidTotalH;
  const seamY = -totalOuterH / 2 + baseH;

  const panels3D: Panel3DTransform[] = [
    {
      id: '3d-base',
      name: '3D Print Base Enclosure',
      faceId: 'bottom',
      widthMm: outerW,
      heightMm: outerD,
      thicknessMm: baseH,
      color: '#4f46e5',
      // The world geometry (printWorld.ts) is already placed, so the panel sits at the origin.
      closedPos: [0, 0, 0],
      explodedPos: [0, -explodeDist * 0.35, 0],
      rotation: [0, 0, 0],
    },
    {
      id: '3d-lid',
      name: '3D Print Snap Lid',
      faceId: 'top',
      widthMm: outerW,
      heightMm: outerD,
      thicknessMm: lidTotalH,
      color: '#6366f1',
      closedPos: [0, 0, 0],
      explodedPos: [0, explodeDist * 0.55, 0],
      rotation: [0, 0, 0],
      foldRig: {
        // The real hinge axis (axisY - outerD behind the back face, at the seam); without a hinge,
        // the back edge.
        pivotOffset: [0, seamY, -outerD / 2 - (hinge ? hinge.axisY - outerD : 0)],
        axis: 'x',
        flatAngleRad: -Math.PI * 0.58,
        foldedAngleRad: 0,
        stage: [0.45, 1.0],
      },
    },
  ];

  return {
    panels2D: [basePanel2D, lidPanel2D],
    panels3D,
    summary: `3D Print Shell (${fmt(wall)}mm wall, ${fmt(rIn)}mm inner fillet, ${fmt(params.outerChamferMm)}mm bed chamfer)`,
    outerDims: { widthMm: outerW, depthMm: outerD, heightMm: innerH + 2 * floor },
  };
}
