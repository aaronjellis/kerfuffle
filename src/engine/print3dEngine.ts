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
  const wall = Math.max(1.2, params.wallThickness3dMm);
  const floor = Math.max(1.2, params.floorThickness3dMm);
  const outerW = innerW + 2 * wall;
  const outerD = innerD + 2 * wall;
  const { baseH, lidH: lidTotalH } = computePrintBoxDims(params, innerW, innerD, innerH);

  const rOut = Math.min(params.outerFilletMm, Math.min(outerW, outerD) * 0.25);
  const rIn = Math.min(params.innerFilletMm, Math.max(0.5, rOut - wall * 0.5));

  // Generate 2D Orthographic Top & Cross-Section Blueprints so the 2D view is also super informative
  const baseOuterPts = buildRoundedRectPoints(outerW, outerD, rOut, 8);
  const baseInnerPts = buildRoundedRectPoints(innerW, innerD, rIn, 8).map((p) => ({
    x: p.x + wall,
    y: p.y + wall,
  }));

  const basePaths: DielinePath[] = [
    {
      id: '3d-base-outer',
      layer: 'cut',
      d: pointsToSvgPath(baseOuterPts, true),
      closed: true,
    },
    {
      id: '3d-base-inner',
      layer: 'score',
      d: pointsToSvgPath(baseInnerPts, true),
      closed: true,
    },
  ];

  // Add snap clasp and hinge lug profiles on the 2D blueprint
  if (params.includeSnapClasp) {
    const claspW = Math.min(28, outerW * 0.32);
    const claspDepth = 4.2;
    const x0 = (outerW - claspW) / 2;
    basePaths.push({
      id: '3d-clasp-catch',
      layer: 'cut',
      d: `M ${fmt(x0)} ${fmt(outerD)} L ${fmt(x0 + claspW)} ${fmt(outerD)} L ${fmt(x0 + claspW - 2)} ${fmt(outerD + claspDepth)} L ${fmt(x0 + 2)} ${fmt(outerD + claspDepth)} Z`,
      closed: true,
    });
  }

  if (params.include3dHinge) {
    const knuckleW = Math.min(36, outerW * 0.45);
    const knuckleDepth = 5.0;
    const x0 = (outerW - knuckleW) / 2;
    basePaths.push({
      id: '3d-hinge-knuckle',
      layer: 'cut',
      d: `M ${fmt(x0)} 0 L ${fmt(x0 + knuckleW)} 0 L ${fmt(x0 + knuckleW)} ${fmt(-knuckleDepth)} L ${fmt(x0)} ${fmt(-knuckleDepth)} Z`,
      closed: true,
    });
  }

  const basePanel2D: BoxPanel2D = {
    id: 'base-3d-plan',
    name: `3D Print Base Shell (${fmt(outerW)}×${fmt(outerD)}×${fmt(baseH)} mm)`,
    faceLabel: '3D BASE SHELL (PRINT BED)',
    widthMm: outerW,
    heightMm: outerD + 10,
    safeRect: { x: wall, y: wall, width: innerW, height: innerD },
    sheetX: 0,
    sheetY: 0,
    paths: basePaths,
  };

  const lidPanel2D: BoxPanel2D = {
    id: 'lid-3d-plan',
    name: `3D Print Hinged Lid (${fmt(outerW)}×${fmt(outerD)}×${fmt(lidTotalH)} mm)`,
    faceLabel: '3D LID SHELL (PRINT BED)',
    widthMm: outerW,
    heightMm: outerD + 10,
    safeRect: { x: wall, y: wall, width: innerW, height: innerD },
    sheetX: 0,
    sheetY: 0,
    paths: [
      {
        id: '3d-lid-outer',
        layer: 'cut',
        d: pointsToSvgPath(baseOuterPts, true),
        closed: true,
      },
      {
        id: '3d-lid-inner',
        layer: 'score',
        d: pointsToSvgPath(baseInnerPts, true),
        closed: true,
      },
    ],
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
      closedPos: [0, -totalOuterH / 2 + baseH / 2, 0],
      explodedPos: [0, -totalOuterH / 2 + baseH / 2 - explodeDist * 0.35, 0],
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
      closedPos: [0, seamY + lidTotalH / 2, 0],
      explodedPos: [0, seamY + lidTotalH / 2 + explodeDist * 0.55, 0],
      rotation: [0, 0, 0],
      foldRig: {
        pivotOffset: [0, seamY, -outerD / 2],
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
  const T = params.wallThickness3dMm;
  const floor = params.floorThickness3dMm;
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
