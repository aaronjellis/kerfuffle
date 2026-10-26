import * as THREE from 'three';
import {
  BoxDims,
  BoxPanel2D,
  BoxParameters,
  DielinePath,
  Panel3DTransform,
  Point2D,
} from './types';
import { fmt, pointsToSvgPath } from './fingerJointEngine';
import { computePrintBoxDims } from './printParts';

export function buildRoundedRectPoints(
  w: number,
  h: number,
  r: number,
  segmentsPerCorner = 8
): Point2D[] {
  const radius = Math.max(0, Math.min(r, w / 2 - 0.1, h / 2 - 0.1));
  if (radius < 0.05) {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
  }

  const pts: Point2D[] = [];
  const corners = [
    { cx: w - radius, cy: h - radius, startAngle: 0 },
    { cx: radius, cy: h - radius, startAngle: Math.PI / 2 },
    { cx: radius, cy: radius, startAngle: Math.PI },
    { cx: w - radius, cy: radius, startAngle: (3 * Math.PI) / 2 },
  ];

  for (const c of corners) {
    for (let i = 0; i <= segmentsPerCorner; i++) {
      const theta = c.startAngle + (i / segmentsPerCorner) * (Math.PI / 2);
      pts.push({
        x: c.cx + Math.cos(theta) * radius,
        y: c.cy + Math.sin(theta) * radius,
      });
    }
  }
  return pts;
}

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
  // prints. Mechanism footprints sit outside the outline: knuckles behind the back edge
  // (y outerD..outerD + 2R), clasp in front of the front edge (y < 0). Each plan is shifted down by
  // its front feature's depth so the whole drawing stays inside the panel's 0..heightMm.
  const knuckleDepth = hinge ? 2 * hinge.R : 0;
  const rectPath = (x0: number, y0: number, x1: number, y1: number) =>
    `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)} L ${fmt(x0)} ${fmt(y1)} Z`;

  const buildPlan = (part: 'base' | 'lid'): { paths: DielinePath[]; oy: number; heightMm: number } => {
    const frontDepth = clasp ? (part === 'base' ? clasp.hookProud : clasp.standoff + clasp.tongueT) : 0;
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
        const [x0, x1] = part === 'base' ? [seg.x0, seg.x1] : [outerW - seg.x1, outerW - seg.x0];
        paths.push({
          id: `3d-hinge-knuckle-${i}`,
          layer: 'cut',
          d: rectPath(x0, outerD + oy, x1, outerD + knuckleDepth + oy),
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
    faceLabel: '3D BASE SHELL (PRINT BED)',
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
    faceLabel: '3D LID SHELL (PRINT BED)',
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
        // The real hinge axis sits R behind the back face at the seam; without a hinge, the back edge.
        pivotOffset: [0, seamY, -outerD / 2 - (hinge ? hinge.R : 0)],
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

/**
 * Generates an ASCII STL file string for the parametric 3D-printed box (Base + Lid arranged side-by-side on the print bed).
 */
export function export3DPrintBoxStl(params: BoxParameters): string {
  // Same clamps as computePrintBoxDims, so the STL and the model agree below 1.2 mm inputs.
  const T = Math.max(1.2, params.wallThickness3dMm);
  const floor = Math.max(1.2, params.floorThickness3dMm);
  const innerW =
    params.dimensionReference === 'inner' ? params.widthMm : Math.max(10, params.widthMm - 2 * T);
  const innerD =
    params.dimensionReference === 'inner' ? params.depthMm : Math.max(10, params.depthMm - 2 * T);
  const innerH =
    params.dimensionReference === 'inner'
      ? params.heightMm
      : Math.max(10, params.heightMm - 2 * floor);

  const outerW = innerW + 2 * T;
  const outerD = innerD + 2 * T;
  const { baseH, lidH } = computePrintBoxDims(params, innerW, innerD, innerH);

  const group = new THREE.Group();

  const buildShellMesh = (shellH: number, xOffset: number, isLid: boolean) => {
    const rOut = Math.min(params.outerFilletMm, Math.min(outerW, outerD) * 0.25);
    const rIn = Math.min(params.innerFilletMm, Math.max(0.5, rOut - T * 0.5));

    const outerPts = buildRoundedRectPoints(outerW, outerD, rOut, 8);
    const innerPts = buildRoundedRectPoints(innerW, innerD, rIn, 8).map((p) => ({
      x: p.x + T,
      y: p.y + T,
    }));

    // 1. Solid floor plate (Z from 0 to floor)
    const floorShape = new THREE.Shape(outerPts.map((p) => new THREE.Vector2(p.x, p.y)));
    const floorGeom = new THREE.ExtrudeGeometry(floorShape, {
      depth: floor,
      bevelEnabled: params.outerChamferMm > 0,
      bevelSize: Math.min(params.outerChamferMm, T * 0.4),
      bevelThickness: Math.min(params.outerChamferMm, floor * 0.5),
      bevelSegments: 1,
    });
    floorGeom.translate(xOffset, 0, 0);
    group.add(new THREE.Mesh(floorGeom));

    // 2. Perimeter walls (Z from floor to shellH)
    const wallShape = new THREE.Shape(outerPts.map((p) => new THREE.Vector2(p.x, p.y)));
    const holePath = new THREE.Path(innerPts.slice().reverse().map((p) => new THREE.Vector2(p.x, p.y)));
    wallShape.holes.push(holePath);

    const wallGeom = new THREE.ExtrudeGeometry(wallShape, {
      depth: Math.max(2, shellH - floor),
      bevelEnabled: false,
    });
    wallGeom.translate(xOffset, 0, floor);
    group.add(new THREE.Mesh(wallGeom));

    // 3. Snap clasp feature
    if (params.includeSnapClasp) {
      const claspW = Math.min(24, outerW * 0.28);
      const claspGeom = new THREE.BoxGeometry(claspW, 3.6, isLid ? 10 : 5);
      claspGeom.translate(
        xOffset + outerW / 2,
        outerD + 1.8,
        shellH - (isLid ? 3 : 2.5)
      );
      group.add(new THREE.Mesh(claspGeom));
    }

    // 4. Rear hinge lugs
    if (params.include3dHinge) {
      const lugW = Math.min(28, outerW * 0.35);
      const lugGeom = new THREE.BoxGeometry(lugW, 4.4, 5.0);
      lugGeom.translate(xOffset + outerW / 2, -2.2, shellH - 2.5);
      group.add(new THREE.Mesh(lugGeom));
    }
  };

  buildShellMesh(baseH, 0, false);
  buildShellMesh(lidH, outerW + 12, true);

  // Serialize all triangles in group to ASCII STL
  const lines: string[] = ['solid BoxerTool_3DPrint_Box'];
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const geom: THREE.BufferGeometry = obj.geometry.index
        ? obj.geometry.toNonIndexed()
        : obj.geometry;
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        vA.fromBufferAttribute(pos, i);
        vB.fromBufferAttribute(pos, i + 1);
        vC.fromBufferAttribute(pos, i + 2);
        cb.subVectors(vC, vB);
        ab.subVectors(vA, vB);
        cb.cross(ab).normalize();
        lines.push(`  facet normal ${fmt(cb.x)} ${fmt(cb.y)} ${fmt(cb.z)}`);
        lines.push('    outer loop');
        lines.push(`      vertex ${fmt(vA.x)} ${fmt(vA.y)} ${fmt(vA.z)}`);
        lines.push(`      vertex ${fmt(vB.x)} ${fmt(vB.y)} ${fmt(vB.z)}`);
        lines.push(`      vertex ${fmt(vC.x)} ${fmt(vC.y)} ${fmt(vC.z)}`);
        lines.push('    endloop');
        lines.push('  endfacet');
      }
    }
  });

  lines.push('endsolid BoxerTool_3DPrint_Box');
  return lines.join('\n');
}
