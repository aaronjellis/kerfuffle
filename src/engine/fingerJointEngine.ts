import { polygonDifference, polygonUnion, startAtTopRight } from './polygonOps';
import { buildRoundedRectPoints } from './roundedRect';
import { hingeCuts, hingePatternInfo, hingeShapePath, type HingePatternSettings, type HingeShape } from './livingHinge';
import {
  BoxDims,
  BoxPanel2D,
  BoxParameters,
  DielinePath,
  Panel3DTransform,
  Point2D,
} from './types';

export function computeOddFingerCount(spanMm: number, targetFingerWidthMm: number): number {
  const safeTarget = Math.max(3, targetFingerWidthMm);
  let count = Math.max(3, Math.round(spanMm / safeTarget));
  if (count % 2 === 0) {
    count += 1;
  }
  return count;
}

export type EdgeJointMode =
  | 'even-tabs'
  | 'odd-tabs'
  | 'flat-inner'
  | 'flat-outer'
  | 'knuckle-hinge-base'
  | 'knuckle-hinge-lid';

export interface FingerPanelSpec {
  id: string;
  name: string;
  faceLabel: string;
  innerW: number;
  innerH: number;
  thickness: number;
  kerf: number;
  countX: number;
  countY: number;
  /** Optional independent finger count for just the top edge (e.g. Clamshell rear hinge seam) */
  topCountX?: number;
  /** Optional independent finger count for just the bottom edge (e.g. Clamshell lid rear hinge seam) */
  bottomCountX?: number;
  topEdge: EdgeJointMode;
  rightEdge: EdgeJointMode;
  bottomEdge: EdgeJointMode;
  leftEdge: EdgeJointMode;
  /** True for Front/Back panels whose corner tabs own the T x T x T 3D corner cubes */
  ownCorners: boolean;
  extraPaths?: DielinePath[];
  holeContours?: Point2D[][];
}

export function fmt(n: number): string {
  return Number(n.toFixed(3)).toString();
}

/**
 * Translates and scales an SVG path string (supporting M, L, Q, A, Z commands) directly in coordinate space,
 * avoiding SVG transform="translate(...)" attributes that some laser importers mis-scale.
 */
export function translateSvgPath(
  d: string,
  dx: number,
  dy: number,
  scale = 1
): string {
  const tokens = d.match(/[MLQAZ]|-?\d+(\.\d+)?/g);
  if (!tokens) return d;
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'M' || cmd === 'L') {
      const x = (parseFloat(tokens[i + 1] || '0') + dx) * scale;
      const y = (parseFloat(tokens[i + 2] || '0') + dy) * scale;
      out.push(`${cmd} ${fmt(x)} ${fmt(y)}`);
      i += 3;
    } else if (cmd === 'Q') {
      const x1 = (parseFloat(tokens[i + 1] || '0') + dx) * scale;
      const y1 = (parseFloat(tokens[i + 2] || '0') + dy) * scale;
      const x = (parseFloat(tokens[i + 3] || '0') + dx) * scale;
      const y = (parseFloat(tokens[i + 4] || '0') + dy) * scale;
      out.push(`Q ${fmt(x1)} ${fmt(y1)} ${fmt(x)} ${fmt(y)}`);
      i += 5;
    } else if (cmd === 'A') {
      const rx = parseFloat(tokens[i + 1] || '0') * scale;
      const ry = parseFloat(tokens[i + 2] || '0') * scale;
      const rot = tokens[i + 3] || '0';
      const large = tokens[i + 4] || '0';
      const sweep = tokens[i + 5] || '0';
      const x = (parseFloat(tokens[i + 6] || '0') + dx) * scale;
      const y = (parseFloat(tokens[i + 7] || '0') + dy) * scale;
      out.push(`A ${fmt(rx)} ${fmt(ry)} ${rot} ${large} ${sweep} ${fmt(x)} ${fmt(y)}`);
      i += 8;
    } else if (cmd === 'Z') {
      out.push('Z');
      i += 1;
    } else {
      out.push(cmd);
      i += 1;
    }
  }

  return out.join(' ');
}

export function pointsToSvgPath(pts: Point2D[], closed = true): string {
  if (pts.length === 0) return '';
  const cleaned: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = pts[i];
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 1e-4) {
      cleaned.push(curr);
    }
  }

  // CRITICAL: If the last point duplicates the first point in a closed loop, remove the duplicate
  // so collinear simplification at index 0 and index n-1 does not compute a zero-length vector and drop the corner!
  if (
    closed &&
    cleaned.length > 1 &&
    Math.hypot(
      cleaned[cleaned.length - 1].x - cleaned[0].x,
      cleaned[cleaned.length - 1].y - cleaned[0].y
    ) <= 1e-4
  ) {
    cleaned.pop();
  }

  if (cleaned.length < 3) {
    const cmds = cleaned.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`);
    if (closed) cmds.push('Z');
    return cmds.join(' ');
  }

  // Simplify collinear consecutive segments
  const simplified: Point2D[] = [];
  const n = cleaned.length;
  for (let i = 0; i < n; i++) {
    const prev = cleaned[(i - 1 + n) % n];
    const curr = cleaned[i];
    const next = cleaned[(i + 1) % n];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
    const dot = dx1 * dx2 + dy1 * dy2;
    if (cross > 1e-4 || dot < 0) {
      simplified.push(curr);
    }
  }

  const finalPts = simplified.length >= 3 ? simplified : cleaned;
  const cmds = finalPts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${fmt(p.x)} ${fmt(p.y)}`);
  if (closed) cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Builds a strictly orthogonal (all 90-degree corners) 2D outer polygon of a finger-joint panel
 * in panel-local coordinates where the outer bounding box is [0, innerW + 2T] x [0, innerH + 2T]
 * and the inner core rectangle is [T, T + innerW] x [T, T + innerH].
 */
export function buildFingerPanelPolygon(spec: FingerPanelSpec): Point2D[] {
  const {
    innerW,
    innerH,
    thickness: T,
    kerf,
    countX,
    countY,
    topEdge,
    rightEdge,
    bottomEdge,
    leftEdge,
    ownCorners,
  } = spec;

  const halfK = kerf / 2;
  const topNX = spec.topCountX || countX;
  const botNX = spec.bottomCountX || countX;
  const stepTopX = innerW / topNX;
  const stepBotX = innerW / botNX;
  const stepY = innerH / countY;
  const pts: Point2D[] = [];

  const isProtruding = (mode: EdgeJointMode, index: number): boolean => {
    if (mode === 'flat-outer') return true;
    if (mode === 'flat-inner') return false;
    if (mode === 'even-tabs' || mode === 'knuckle-hinge-base') return index % 2 === 0;
    if (mode === 'odd-tabs' || mode === 'knuckle-hinge-lid') return index % 2 === 1;
    return false;
  };

  // A corner square [0..T]x[0..T] is filled ONLY if ownCorners is true AND both adjacent edges protrude at that corner.
  const topLeftOut = ownCorners && isProtruding(topEdge, 0) && isProtruding(leftEdge, 0);
  const topRightOut =
    ownCorners && isProtruding(topEdge, topNX - 1) && isProtruding(rightEdge, 0);
  const bottomRightOut =
    ownCorners && isProtruding(bottomEdge, botNX - 1) && isProtruding(rightEdge, countY - 1);
  const bottomLeftOut =
    ownCorners && isProtruding(bottomEdge, 0) && isProtruding(leftEdge, countY - 1);

  const xLOut = 0;
  const xLIn = T;
  const xRIn = T + innerW;
  const xROut = T + innerW + T;

  const yTOut = 0;
  const yTIn = T;
  const yBIn = T + innerH;
  const yBOut = T + innerH + T;

  const pushPt = (x: number, y: number) => {
    pts.push({ x, y });
  };

  // --- 1. TOP-LEFT CORNER & TOP EDGE (left to right: i = 0 .. topNX - 1) ---
  const top0 = isProtruding(topEdge, 0);
  if (topLeftOut) {
    pushPt(xLOut, yTOut);
  } else if (top0) {
    pushPt(xLIn, yTIn);
    pushPt(xLIn, yTOut);
  } else {
    pushPt(xLIn, yTIn);
  }

  for (let i = 0; i < topNX - 1; i++) {
    const out = isProtruding(topEdge, i);
    const nextOut = isProtruding(topEdge, i + 1);
    const xBase = xLIn + (i + 1) * stepTopX;
    if (out && !nextOut) {
      const xStep = xBase + halfK;
      pushPt(xStep, yTOut);
      pushPt(xStep, yTIn);
    } else if (!out && nextOut) {
      const xStep = xBase - halfK;
      pushPt(xStep, yTIn);
      pushPt(xStep, yTOut);
    }
  }

  const topLast = isProtruding(topEdge, topNX - 1);
  if (topRightOut) {
    pushPt(xROut, yTOut);
  } else if (topLast) {
    pushPt(xRIn, yTOut);
    pushPt(xRIn, yTIn);
  } else {
    pushPt(xRIn, yTIn);
  }

  // --- 2. RIGHT EDGE (top to bottom: j = 0 .. countY - 1) ---
  const right0 = isProtruding(rightEdge, 0);
  if (!topRightOut && right0) {
    pushPt(xRIn, yTIn);
    pushPt(xROut, yTIn);
  }

  for (let j = 0; j < countY - 1; j++) {
    const out = isProtruding(rightEdge, j);
    const nextOut = isProtruding(rightEdge, j + 1);
    const yBase = yTIn + (j + 1) * stepY;
    if (out && !nextOut) {
      const yStep = yBase + halfK;
      pushPt(xROut, yStep);
      pushPt(xRIn, yStep);
    } else if (!out && nextOut) {
      const yStep = yBase - halfK;
      pushPt(xRIn, yStep);
      pushPt(xROut, yStep);
    }
  }

  const rightLast = isProtruding(rightEdge, countY - 1);
  if (bottomRightOut) {
    pushPt(xROut, yBOut);
  } else if (rightLast) {
    pushPt(xROut, yBIn);
    pushPt(xRIn, yBIn);
  } else {
    pushPt(xRIn, yBIn);
  }

  // --- 3. BOTTOM EDGE (right to left: i = botNX - 1 .. 0) ---
  const botLast = isProtruding(bottomEdge, botNX - 1);
  if (!bottomRightOut && botLast) {
    pushPt(xRIn, yBIn);
    pushPt(xRIn, yBOut);
  }

  for (let i = botNX - 1; i > 0; i--) {
    const out = isProtruding(bottomEdge, i);
    const prevOut = isProtruding(bottomEdge, i - 1);
    const xBase = xLIn + i * stepBotX;
    if (out && !prevOut) {
      const xStep = xBase - halfK;
      pushPt(xStep, yBOut);
      pushPt(xStep, yBIn);
    } else if (!out && prevOut) {
      const xStep = xBase + halfK;
      pushPt(xStep, yBIn);
      pushPt(xStep, yBOut);
    }
  }

  const bot0 = isProtruding(bottomEdge, 0);
  if (bottomLeftOut) {
    pushPt(xLOut, yBOut);
  } else if (bot0) {
    pushPt(xLIn, yBOut);
    pushPt(xLIn, yBIn);
  } else {
    pushPt(xLIn, yBIn);
  }

  // --- 4. LEFT EDGE (bottom to top: j = countY - 1 .. 0) ---
  const leftLast = isProtruding(leftEdge, countY - 1);
  if (!bottomLeftOut && leftLast) {
    pushPt(xLIn, yBIn);
    pushPt(xLOut, yBIn);
  }

  for (let j = countY - 1; j > 0; j--) {
    const out = isProtruding(leftEdge, j);
    const prevOut = isProtruding(leftEdge, j - 1);
    const yBase = yTIn + j * stepY;
    if (out && !prevOut) {
      const yStep = yBase - halfK;
      pushPt(xLOut, yStep);
      pushPt(xLIn, yStep);
    } else if (!out && prevOut) {
      const yStep = yBase + halfK;
      pushPt(xLIn, yStep);
      pushPt(xLOut, yStep);
    }
  }

  const left0 = isProtruding(leftEdge, 0);
  if (topLeftOut) {
    pushPt(xLOut, yTOut);
  } else if (left0) {
    pushPt(xLOut, yTIn);
    pushPt(xLIn, yTIn);
  } else {
    pushPt(xLIn, yTIn);
  }

  // Return deduplicated closed vertex list (without duplicate closing vertex)
  const deduped: Point2D[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) > 1e-4) {
      deduped.push(pts[i]);
    }
  }
  if (
    deduped.length > 1 &&
    Math.hypot(
      deduped[deduped.length - 1].x - deduped[0].x,
      deduped[deduped.length - 1].y - deduped[0].y
    ) <= 1e-4
  ) {
    deduped.pop();
  }

  return deduped;
}

function specToPanel2D(spec: FingerPanelSpec): { panel2D: BoxPanel2D; outlinePoints: Point2D[] } {
  const T = spec.thickness;
  const outlinePoints = buildFingerPanelPolygon(spec);

  // Compute true physical bounding box of the panel (e.g. when topEdge or bottomEdge is 'flat-inner',
  // there are no protruding tabs on that edge, so the physical height is innerH + T instead of innerH + 2T!)
  const minX = spec.leftEdge === 'flat-inner' ? T : 0;
  const maxX = spec.rightEdge === 'flat-inner' ? T + spec.innerW : spec.innerW + 2 * T;
  const minY = spec.topEdge === 'flat-inner' ? T : 0;
  const maxY = spec.bottomEdge === 'flat-inner' ? T + spec.innerH : spec.innerH + 2 * T;

  const actualW = maxX - minX;
  const actualH = maxY - minY;

  // Shift 2D points so the 2D panel starts tightly at (0, 0) with exact physical dimensions actualW x actualH
  const shiftedPts = outlinePoints.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
  }));

  const paths: DielinePath[] = [
    {
      id: `${spec.id}-outline`,
      layer: 'cut',
      d: pointsToSvgPath(shiftedPts, true),
      closed: true,
    },
    ...(spec.extraPaths || []).map((ep) => ({
      ...ep,
      d: translateSvgPath(ep.d, -minX, -minY, 1),
    })),
  ];

  const safeX = T - minX;
  const safeY = T - minY;

  paths.push({
    id: `${spec.id}-safe`,
    layer: 'guide',
    d: `M ${fmt(safeX)} ${fmt(safeY)} L ${fmt(safeX + spec.innerW)} ${fmt(safeY)} L ${fmt(safeX + spec.innerW)} ${fmt(safeY + spec.innerH)} L ${fmt(safeX)} ${fmt(safeY + spec.innerH)} Z`,
    closed: true,
  });

  return {
    outlinePoints,
    panel2D: {
      id: spec.id,
      name: spec.name,
      faceLabel: spec.faceLabel,
      widthMm: actualW,
      heightMm: actualH,
      safeRect: {
        x: safeX,
        y: safeY,
        width: spec.innerW,
        height: spec.innerH,
      },
      sheetX: 0,
      sheetY: 0,
      paths,
    },
  };
}

export function generateWoodFingerBox(
  params: BoxParameters,
  innerW: number,
  innerD: number,
  innerH: number
): {
  panels2D: BoxPanel2D[];
  panels3D: Panel3DTransform[];
  fingerCountSummary: string;
  outerDims: BoxDims;
} {
  const T = params.materialThicknessMm;
  const kerf = params.kerfMm;
  const countW = computeOddFingerCount(innerW, params.fingerWidthMm);
  const countD = computeOddFingerCount(innerD, params.fingerWidthMm);
  const countH = computeOddFingerCount(innerH, params.fingerWidthMm);
  // One ply each side; an open box and the organizer (which has no top) have no lid ply on top.
  const hasTopPly = params.templateId !== 'finger-organizer' && params.woodLidStyle !== 'open';
  // A telescoping lid is a second, shallower tray that slides down over the base: its inside is the
  // base's outside plus a slip-fit gap each side, so its skirt is the outermost wall.
  const isTelescope = params.templateId === 'finger-basic' && params.woodLidStyle === 'telescope-lid';
  const lidGap = Math.max(0, params.woodLidClearanceMm);
  const lidInnerW = innerW + 2 * T + 2 * lidGap;
  const lidInnerD = innerD + 2 * T + 2 * lidGap;
  // Lid depth inside the plate: at least 8 mm, at most the base's full outside height.
  const lidInnerH = Math.min(Math.max(8, params.lidHeightMm), innerH + T);
  const outerDims: BoxDims = {
    widthMm: isTelescope ? lidInnerW + 2 * T : innerW + 2 * T,
    depthMm: isTelescope ? lidInnerD + 2 * T : innerD + 2 * T,
    heightMm: innerH + (hasTopPly ? 2 * T : T),
  };

  const panels2D: BoxPanel2D[] = [];
  const panels3D: Panel3DTransform[] = [];

  if (params.templateId === 'finger-clamshell') {
    return { ...generateClamshellBox(params, innerW, innerD, innerH, countW, countD), outerDims };
  }

  if (params.templateId === 'finger-living-hinge') {
    return { ...generateLivingHingeBox(params, innerW, innerD, innerH, countW, countD, countH), outerDims };
  }

  const isOrganizer = params.templateId === 'finger-organizer';
  const isClosedTop = !isOrganizer && params.woodLidStyle === 'closed';
  const hasLiftLid =
    !isOrganizer &&
    (params.woodLidStyle === 'flat-lid' || params.woodLidStyle === 'inset-lid');
  const topWallEdge: EdgeJointMode = isClosedTop ? 'even-tabs' : 'flat-inner';

  const makeSlotCutouts = (
    spanMm: number,
    heightMm: number,
    numDividers: number,
    idPrefix: string
  ): { paths: DielinePath[]; holes: Point2D[][] } => {
    const paths: DielinePath[] = [];
    const holes: Point2D[][] = [];
    if (params.templateId !== 'finger-organizer' || numDividers <= 1) {
      return { paths, holes };
    }
    const slotW = Math.max(0.5, T - kerf * 0.5);
    const slotH = heightMm * 0.65;
    for (let i = 1; i < numDividers; i++) {
      const cx = T + (spanMm * i) / numDividers;
      const x0 = cx - slotW / 2;
      const x1 = cx + slotW / 2;
      const y0 = T;
      const y1 = T + slotH;
      const pts: Point2D[] = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ];
      holes.push(pts);
      paths.push({
        id: `${idPrefix}-slot-${i}`,
        layer: 'cut',
        d: pointsToSvgPath(pts, true),
        closed: true,
      });
    }
    return { paths, holes };
  };

  const fbSlots = makeSlotCutouts(innerW, innerH, params.dividerCols, 'fb');
  const lrSlots = makeSlotCutouts(innerD, innerH, params.dividerRows, 'lr');

  // 1. BOTTOM PANEL
  const bottomRes = specToPanel2D({
    id: 'bottom',
    name: 'Bottom Plate',
    faceLabel: 'BOTTOM',
    innerW,
    innerH: innerD,
    thickness: T,
    kerf,
    countX: countW,
    countY: countD,
    topEdge: 'odd-tabs',
    rightEdge: 'odd-tabs',
    bottomEdge: 'odd-tabs',
    leftEdge: 'odd-tabs',
    ownCorners: false,
  });
  panels2D.push(bottomRes.panel2D);

  const explodeDist = Math.max(innerW, innerD, innerH) * 0.55;

  panels3D.push({
    id: 'bottom',
    name: 'Bottom Plate',
    faceId: 'bottom',
    widthMm: innerW + 2 * T,
    heightMm: innerD + 2 * T,
    thicknessMm: T,
    color: '#d6b384',
    closedPos: [0, -innerH / 2 - T / 2, 0],
    explodedPos: [0, -innerH / 2 - T / 2 - explodeDist, 0],
    rotation: [Math.PI / 2, 0, 0],
    outlinePoints: bottomRes.outlinePoints,
  });

  // 2. FRONT & BACK WALLS
  for (const side of ['front', 'back'] as const) {
    const isFront = side === 'front';
    const res = specToPanel2D({
      id: side,
      name: isFront ? 'Front Wall' : 'Back Wall',
      faceLabel: isFront ? 'FRONT' : 'BACK',
      innerW,
      innerH,
      thickness: T,
      kerf,
      countX: countW,
      countY: countH,
      topEdge: topWallEdge,
      rightEdge: 'even-tabs',
      bottomEdge: 'even-tabs',
      leftEdge: 'even-tabs',
      ownCorners: true,
      extraPaths: fbSlots.paths,
      holeContours: fbSlots.holes,
    });
    panels2D.push(res.panel2D);

    const zSign = isFront ? 1 : -1;
    panels3D.push({
      id: side,
      name: isFront ? 'Front Wall' : 'Back Wall',
      faceId: side,
      widthMm: innerW + 2 * T,
      heightMm: innerH + 2 * T,
      thicknessMm: T,
      color: '#dfc195',
      closedPos: [0, 0, zSign * (innerD / 2 + T / 2)],
      explodedPos: [0, 0, zSign * (innerD / 2 + T / 2 + explodeDist)],
      rotation: [0, isFront ? 0 : Math.PI, 0],
      outlinePoints: res.outlinePoints,
      holeContours: fbSlots.holes,
    });
  }

  // 3. LEFT & RIGHT WALLS
  for (const side of ['left', 'right'] as const) {
    const isRight = side === 'right';
    const res = specToPanel2D({
      id: side,
      name: isRight ? 'Right Wall' : 'Left Wall',
      faceLabel: isRight ? 'RIGHT' : 'LEFT',
      innerW: innerD,
      innerH,
      thickness: T,
      kerf,
      countX: countD,
      countY: countH,
      topEdge: topWallEdge,
      rightEdge: 'odd-tabs',
      bottomEdge: 'even-tabs',
      leftEdge: 'odd-tabs',
      ownCorners: false,
      extraPaths: lrSlots.paths,
      holeContours: lrSlots.holes,
    });
    panels2D.push(res.panel2D);

    const xSign = isRight ? 1 : -1;
    panels3D.push({
      id: side,
      name: isRight ? 'Right Wall' : 'Left Wall',
      faceId: side,
      widthMm: innerD + 2 * T,
      heightMm: innerH + 2 * T,
      thicknessMm: T,
      color: '#cda676',
      closedPos: [xSign * (innerW / 2 + T / 2), 0, 0],
      explodedPos: [xSign * (innerW / 2 + T / 2 + explodeDist), 0, 0],
      rotation: [0, isRight ? Math.PI / 2 : -Math.PI / 2, 0],
      outlinePoints: res.outlinePoints,
      holeContours: lrSlots.holes,
    });
  }

  // 4. TOP / LID VARIATIONS
  if (isClosedTop) {
    const topRes = specToPanel2D({
      id: 'top',
      name: 'Top Plate',
      faceLabel: 'LID / TOP',
      innerW,
      innerH: innerD,
      thickness: T,
      kerf,
      countX: countW,
      countY: countD,
      topEdge: 'odd-tabs',
      rightEdge: 'odd-tabs',
      bottomEdge: 'odd-tabs',
      leftEdge: 'odd-tabs',
      ownCorners: false,
    });
    panels2D.push(topRes.panel2D);
    panels3D.push({
      id: 'top',
      name: 'Top Plate',
      faceId: 'top',
      widthMm: innerW + 2 * T,
      heightMm: innerD + 2 * T,
      thicknessMm: T,
      color: '#e5c89e',
      closedPos: [0, innerH / 2 + T / 2, 0],
      explodedPos: [0, innerH / 2 + T / 2 + explodeDist * 1.15, 0],
      rotation: [-Math.PI / 2, 0, 0],
      outlinePoints: topRes.outlinePoints,
    });
  } else if (hasLiftLid) {
    const lidOuterW = innerW + 2 * T;
    const lidOuterD = innerD + 2 * T;
    const lidOutline: Point2D[] = [
      { x: 0, y: 0 },
      { x: lidOuterW, y: 0 },
      { x: lidOuterW, y: lidOuterD },
      { x: 0, y: lidOuterD },
    ];
    const insetClearance = 0.25;
    const lipW = innerW - insetClearance * 2;
    const lipD = innerD - insetClearance * 2;

    const lidPaths: DielinePath[] = [
      {
        id: 'lid-top-cut',
        layer: 'cut',
        d: pointsToSvgPath(lidOutline, true),
        closed: true,
      },
      {
        id: 'lid-alignment-guide',
        layer: 'guide',
        d: `M ${fmt(T + insetClearance)} ${fmt(T + insetClearance)} L ${fmt(T + insetClearance + lipW)} ${fmt(T + insetClearance)} L ${fmt(T + insetClearance + lipW)} ${fmt(T + insetClearance + lipD)} L ${fmt(T + insetClearance)} ${fmt(T + insetClearance + lipD)} Z`,
        closed: true,
      },
    ];

    panels2D.push({
      id: 'top',
      name: 'Lift-Off Lid Top',
      faceLabel: 'LID TOP',
      widthMm: lidOuterW,
      heightMm: lidOuterD,
      safeRect: { x: T, y: T, width: innerW, height: innerD },
      sheetX: 0,
      sheetY: 0,
      paths: lidPaths,
    });

    panels3D.push({
      id: 'top',
      name: 'Lift-Off Lid Top',
      faceId: 'top',
      widthMm: lidOuterW,
      heightMm: lidOuterD,
      thicknessMm: T,
      color: '#e5c89e',
      closedPos: [0, innerH / 2 + T / 2, 0],
      explodedPos: [0, innerH / 2 + T / 2 + explodeDist * 1.25, 0],
      rotation: [-Math.PI / 2, 0, 0],
      outlinePoints: lidOutline,
    });

    if (params.woodLidStyle === 'inset-lid') {
      const lipOutline: Point2D[] = [
        { x: 0, y: 0 },
        { x: lipW, y: 0 },
        { x: lipW, y: lipD },
        { x: 0, y: lipD },
      ];
      const rimWidth = Math.min(12, Math.min(lipW, lipD) * 0.22);
      const innerHole: Point2D[] = [
        { x: rimWidth, y: rimWidth },
        { x: lipW - rimWidth, y: rimWidth },
        { x: lipW - rimWidth, y: lipD - rimWidth },
        { x: rimWidth, y: lipD - rimWidth },
      ];
      panels2D.push({
        id: 'lid-lip',
        name: 'Lid Retainer Lip (Glue Under Lid)',
        faceLabel: 'LID LIP',
        widthMm: lipW,
        heightMm: lipD,
        safeRect: { x: rimWidth, y: rimWidth, width: lipW - 2 * rimWidth, height: lipD - 2 * rimWidth },
        sheetX: 0,
        sheetY: 0,
        paths: [
          { id: 'lid-lip-outer', layer: 'cut', d: pointsToSvgPath(lipOutline, true), closed: true },
          { id: 'lid-lip-inner', layer: 'cut', d: pointsToSvgPath(innerHole, true), closed: true },
        ],
      });
      panels3D.push({
        id: 'lid-lip',
        name: 'Lid Retainer Lip',
        faceId: 'lid-lip',
        widthMm: lipW,
        heightMm: lipD,
        thicknessMm: T,
        color: '#c29866',
        closedPos: [0, innerH / 2 - T / 2, 0],
        explodedPos: [0, innerH / 2 - T / 2 + explodeDist * 0.9, 0],
        rotation: [-Math.PI / 2, 0, 0],
        outlinePoints: lipOutline,
        holeContours: [innerHole],
      });
    }
  }

  // 4b. TELESCOPING LID: a plate fingered all round, and four skirts whose top edges mate it and
  // whose bottom edges are left plain. The plate's inner face rests on the base walls' top edges.
  if (isTelescope) {
    const lidCountW = computeOddFingerCount(lidInnerW, params.fingerWidthMm);
    const lidCountD = computeOddFingerCount(lidInnerD, params.fingerWidthMm);
    const lidCountH = computeOddFingerCount(lidInnerH, params.fingerWidthMm);
    const lidLift = explodeDist * 1.3;
    const plate = specToPanel2D({
      id: 'top',
      name: 'Telescoping Lid Top',
      faceLabel: 'LID TOP',
      innerW: lidInnerW,
      innerH: lidInnerD,
      thickness: T,
      kerf,
      countX: lidCountW,
      countY: lidCountD,
      topEdge: 'odd-tabs',
      rightEdge: 'odd-tabs',
      bottomEdge: 'odd-tabs',
      leftEdge: 'odd-tabs',
      ownCorners: false,
    });
    panels2D.push(plate.panel2D);
    panels3D.push({
      id: 'top',
      name: 'Telescoping Lid Top',
      faceId: 'top',
      widthMm: lidInnerW + 2 * T,
      heightMm: lidInnerD + 2 * T,
      thicknessMm: T,
      color: '#e5c89e',
      closedPos: [0, innerH / 2 + T / 2, 0],
      explodedPos: [0, innerH / 2 + T / 2 + lidLift, 0],
      rotation: [-Math.PI / 2, 0, 0],
      outlinePoints: plate.outlinePoints,
    });

    // A skirt's nominal frame runs from the plate's top (y = 0) to a ply past its open edge, so its
    // centre sits (lidInnerH + 2T) / 2 below the plate's top face.
    const skirtY = innerH / 2 + T - (lidInnerH + 2 * T) / 2;
    for (const side of ['front', 'back'] as const) {
      const isFront = side === 'front';
      const res = specToPanel2D({
        id: `lid-${side}`,
        name: isFront ? 'Lid Front Skirt' : 'Lid Back Skirt',
        faceLabel: isFront ? 'LID FRONT' : 'LID BACK',
        innerW: lidInnerW,
        innerH: lidInnerH,
        thickness: T,
        kerf,
        countX: lidCountW,
        countY: lidCountH,
        topEdge: 'even-tabs',
        rightEdge: 'even-tabs',
        bottomEdge: 'flat-inner',
        leftEdge: 'even-tabs',
        ownCorners: true,
      });
      panels2D.push(res.panel2D);
      const z = (isFront ? 1 : -1) * (lidInnerD / 2 + T / 2);
      panels3D.push({
        id: `lid-${side}`,
        name: isFront ? 'Lid Front Skirt' : 'Lid Back Skirt',
        faceId: `lid-${side}`,
        widthMm: lidInnerW + 2 * T,
        heightMm: lidInnerH + 2 * T,
        thicknessMm: T,
        color: '#dfc195',
        closedPos: [0, skirtY, z],
        explodedPos: [0, skirtY + lidLift, z * 1.35],
        rotation: [0, isFront ? 0 : Math.PI, 0],
        outlinePoints: res.outlinePoints,
      });
    }
    for (const side of ['left', 'right'] as const) {
      const isRight = side === 'right';
      const res = specToPanel2D({
        id: `lid-${side}`,
        name: isRight ? 'Lid Right Skirt' : 'Lid Left Skirt',
        faceLabel: isRight ? 'LID RIGHT' : 'LID LEFT',
        innerW: lidInnerD,
        innerH: lidInnerH,
        thickness: T,
        kerf,
        countX: lidCountD,
        countY: lidCountH,
        topEdge: 'even-tabs',
        rightEdge: 'odd-tabs',
        bottomEdge: 'flat-inner',
        leftEdge: 'odd-tabs',
        ownCorners: false,
      });
      panels2D.push(res.panel2D);
      const x = (isRight ? 1 : -1) * (lidInnerW / 2 + T / 2);
      panels3D.push({
        id: `lid-${side}`,
        name: isRight ? 'Lid Right Skirt' : 'Lid Left Skirt',
        faceId: `lid-${side}`,
        widthMm: lidInnerD + 2 * T,
        heightMm: lidInnerH + 2 * T,
        thicknessMm: T,
        color: '#cda676',
        closedPos: [x, skirtY, 0],
        explodedPos: [x * 1.35, skirtY + lidLift, 0],
        rotation: [0, isRight ? Math.PI / 2 : -Math.PI / 2, 0],
        outlinePoints: res.outlinePoints,
      });
    }
  }

  // 5. ORGANIZER DIVIDERS (with interlocking half-lap notches in both 2D and 3D!)
  if (params.templateId === 'finger-organizer') {
    const divH = innerH * 0.85;
    const slotW = Math.max(0.5, T - kerf * 0.5);

    for (let c = 1; c < params.dividerCols; c++) {
      const totalLen = innerD + 2 * T * 0.6;
      // Top edge has half-lap notches going from y = 0 down to y = divH / 2
      const notchedPts: Point2D[] = [{ x: 0, y: 0 }];
      for (let r = 1; r < params.dividerRows; r++) {
        const cx = (totalLen * r) / params.dividerRows;
        notchedPts.push(
          { x: cx - slotW / 2, y: 0 },
          { x: cx - slotW / 2, y: divH / 2 },
          { x: cx + slotW / 2, y: divH / 2 },
          { x: cx + slotW / 2, y: 0 }
        );
      }
      notchedPts.push(
        { x: totalLen, y: 0 },
        { x: totalLen, y: divH },
        { x: 0, y: divH }
      );

      panels2D.push({
        id: `divider-x-${c}`,
        name: `Depth Divider #${c}`,
        faceLabel: `DIVIDER X${c}`,
        widthMm: totalLen,
        heightMm: divH,
        safeRect: { x: T, y: 4, width: innerD, height: divH - 8 },
        sheetX: 0,
        sheetY: 0,
        paths: [
          {
            id: `div-x-${c}-cut`,
            layer: 'cut',
            d: pointsToSvgPath(notchedPts, true),
            closed: true,
          },
        ],
      });

      const xOffset = -innerW / 2 + (innerW * c) / params.dividerCols;
      panels3D.push({
        id: `divider-x-${c}`,
        name: `Depth Divider #${c}`,
        faceId: `divider-x-${c}`,
        widthMm: totalLen,
        heightMm: divH,
        thicknessMm: T,
        color: '#c49a6c',
        closedPos: [xOffset, -innerH / 2 + divH / 2, 0],
        explodedPos: [xOffset, innerH * 0.7 + explodeDist * 0.7, 0],
        rotation: [0, Math.PI / 2, 0],
        outlinePoints: notchedPts,
      });
    }

    for (let r = 1; r < params.dividerRows; r++) {
      const totalLen = innerW + 2 * T * 0.6;
      // Bottom edge has half-lap notches going from y = divH up to y = divH / 2
      const notchedPts: Point2D[] = [
        { x: 0, y: 0 },
        { x: totalLen, y: 0 },
        { x: totalLen, y: divH },
      ];
      for (let c = params.dividerCols - 1; c >= 1; c--) {
        const cx = (totalLen * c) / params.dividerCols;
        notchedPts.push(
          { x: cx + slotW / 2, y: divH },
          { x: cx + slotW / 2, y: divH / 2 },
          { x: cx - slotW / 2, y: divH / 2 },
          { x: cx - slotW / 2, y: divH }
        );
      }
      notchedPts.push({ x: 0, y: divH });

      panels2D.push({
        id: `divider-y-${r}`,
        name: `Width Divider #${r}`,
        faceLabel: `DIVIDER Y${r}`,
        widthMm: totalLen,
        heightMm: divH,
        safeRect: { x: T, y: 4, width: innerW, height: divH - 8 },
        sheetX: 0,
        sheetY: 0,
        paths: [
          {
            id: `div-y-${r}-cut`,
            layer: 'cut',
            d: pointsToSvgPath(notchedPts, true),
            closed: true,
          },
        ],
      });

      const zOffset = -innerD / 2 + (innerD * r) / params.dividerRows;
      panels3D.push({
        id: `divider-y-${r}`,
        name: `Width Divider #${r}`,
        faceId: `divider-y-${r}`,
        widthMm: totalLen,
        heightMm: divH,
        thicknessMm: T,
        color: '#b88d5e',
        closedPos: [0, -innerH / 2 + divH / 2, zOffset],
        explodedPos: [0, innerH * 0.9 + explodeDist * 0.95, zOffset],
        rotation: [0, 0, 0],
        outlinePoints: notchedPts,
      });
    }
  }

  return {
    panels2D,
    panels3D,
    fingerCountSummary: isTelescope
      ? `${countW} (W) × ${countD} (D) × ${countH} (H) base fingers; telescoping lid ${fmt(lidInnerH)} mm deep, ${fmt(lidGap)} mm slip each side`
      : `${countW} (W) × ${countD} (D) × ${countH} (H) symmetric odd fingers`,
    outerDims,
  };
}

/**
 * Where the clamshell's rear hinges sit: two hinges at 22% and 78% across the back wall (2D x,
 * measured from the panel's left edge), each with two holes `spacing` apart, `fromSeam` mm from
 * the lid/base seam. Shared by the butt-hardware pilot holes (5 mm from the seam) and the printed
 * hinge's peg holes (6 mm, so the leaf's 3.2 mm hole keeps a 1.6 mm ligament to its knuckle edge).
 */
export function hingeHoleLayout(
  params: BoxParameters,
  innerW: number
): { centersX: number[]; spacing: number; fromSeam: number } {
  const T = params.materialThicknessMm;
  return {
    centersX: [T + innerW * 0.22, T + innerW * 0.78],
    spacing: Math.min(12, Math.max(6, innerW * 0.08)),
    fromSeam: params.clamshellHingeType === 'printed-hinge' ? 6 : 5,
  };
}

/**
 * How far below the seam the lid's bottom edge dips as it opens about a pivot `m` in front of the
 * back face and `k` below the seam, while it is still over the walls: every point of that edge
 * between the back face and the pivot, at every angle up to `maxAngle`, until it has swung back past
 * the back face.
 */
export function lidEdgeDip(m: number, k: number, maxAngle: number): number {
  let worst = 0;
  for (let i = 0; i <= 24; i++) {
    const dz = (-m * i) / 24;
    for (let j = 1; j <= 180; j++) {
      const a = (maxAngle * j) / 180;
      if (-k * Math.sin(a) + dz * Math.cos(a) < -m) break;
      worst = Math.max(worst, k - (k * Math.cos(a) + dz * Math.sin(a)));
    }
  }
  return worst;
}

/**
 * Generates a Clamshell / Treasure Chest Box with Base + Hinged Lid
 */
function generateClamshellBox(
  params: BoxParameters,
  innerW: number,
  innerD: number,
  innerH: number,
  countW: number,
  countD: number
): {
  panels2D: BoxPanel2D[];
  panels3D: Panel3DTransform[];
  fingerCountSummary: string;
} {
  const T = params.materialThicknessMm;
  const kerf = params.kerfMm;
  const lidH = Math.min(Math.max(12, params.lidHeightMm), innerH - 12);
  const baseH = innerH - lidH;
  const hingeType = params.clamshellHingeType;
  const seamY = -innerH / 2 + baseH;
  /** The back wall's outer face, which every hinge mounts on or turns behind. */
  const zBackFace = -(innerD / 2 + T);
  // Pivot pins turn in their holes: the hole is the pin plus 0.15 mm a side.
  const pinHoleR = params.hingePinDiameterMm / 2 + 0.15;

  // Side pivot: a plate glued outside each lid side hangs over the base side wall; one pin passes
  // through both at P, `pivotM` in from the back face (clear of the back wall's finger band) and
  // `pivotK` below the seam. Turning about a point in front of the back face, the lid's edge behind
  // P dips as it opens, until it has swung back past the back face; setting P three times as far
  // below the seam as in from the back keeps that dip near a millimetre. The base walls stop the
  // dip (plus 0.3 mm) short of the seam.
  const pivotM = T + pinHoleR + 1.5;
  const pivotK = Math.min(Math.max(2 * pinHoleR + 4, 3 * pivotM), baseH - pinHoleR - 2);
  const pivotGap = hingeType === 'side-pivot' ? lidEdgeDip(pivotM, pivotK, 0.55 * Math.PI) + 0.3 : 0;
  const baseWallH = baseH - pivotGap;

  // Knuckle plates: round-ended plates standing off the back face, the pin hole `knE` out from it,
  // the round end `knR` across. The body runs `knHk` along the wall from the seam, with a glue tab
  // into a slot in the wall.
  const knR = pinHoleR + 2;
  const knE = knR + 0.5;
  const knHk = Math.max(2 * knR + 2, Math.min(2 * knR + 4, lidH - 1, baseWallH - 1));

  // Every hinge turns the lid about one line along x at the seam, behind the back face, so each
  // point of the lid rises or swings back as it opens and nothing presses into the base: a butt
  // hinge's barrel 2 mm out, the printed hinge's knuckle 2.5 mm out, the knuckle plates' pin. The
  // side pivot's pin is the exception, set inside the side walls; the seam gap above covers it.
  const hingeAxis: [number, number] =
    hingeType === 'side-pivot'
      ? [seamY - pivotK, zBackFace + pivotM]
      : hingeType === 'printed-hinge'
        ? [seamY, zBackFace - 2.5]
        : hingeType === 'knuckle-pin'
          ? [seamY, zBackFace - knE]
          : [seamY, zBackFace - 2];
  const hingePivot: [number, number, number] = [0, hingeAxis[0], hingeAxis[1]];

  const countBaseH = computeOddFingerCount(baseWallH, params.fingerWidthMm);
  const countLidH = computeOddFingerCount(lidH, params.fingerWidthMm);

  const panels2D: BoxPanel2D[] = [];
  const panels3D: Panel3DTransform[] = [];
  const explodeDist = Math.max(innerW, innerD, innerH) * 0.5;

  const circlePts = (cx: number, cy: number, r: number, steps = 12): Point2D[] => {
    const pts: Point2D[] = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  };

  const hingeLayout = hingeHoleLayout(params, innerW);
  const isPrintedHinge = params.clamshellHingeType === 'printed-hinge';

  // Rear hinge holes along the flat seam: brass butt-hinge pilot screw holes (optional), or the
  // 3.0 mm holes the printed hinge's pegs press into (always cut for that hinge type).
  const buildHardwareHingeHoles = (
    panelId: string,
    yHoleMm: number
  ): { paths: DielinePath[]; holes3D: Point2D[][] } => {
    const paths: DielinePath[] = [];
    const holes3D: Point2D[][] = [];
    const isButt = params.clamshellHingeType === 'butt-hardware' && params.includeHingeScrewHoles;
    if (!isButt && !isPrintedHinge) {
      return { paths, holes3D };
    }
    const r = isPrintedHinge ? 1.5 : Math.max(0.6, (params.hingePinDiameterMm || 2.0) / 2);
    const hingeCentersX = hingeLayout.centersX;
    const holeSpacing = hingeLayout.spacing;
    for (let hIdx = 0; hIdx < hingeCentersX.length; hIdx++) {
      const hx = hingeCentersX[hIdx];
      for (const [sIdx, dx] of [
        [1, -holeSpacing / 2],
        [2, holeSpacing / 2],
      ] as const) {
        const cx2D = hx + dx;
        paths.push({
          id: `${panelId}-hinge-hole-${hIdx + 1}-${sIdx}`,
          layer: 'cut',
          d: circleSvgPath(cx2D, yHoleMm, r),
          closed: true,
        });
        holes3D.push(circlePts(cx2D, yHoleMm, r));
      }
    }
    return { paths, holes3D };
  };

  // World x of each hinge's centre. The back wall is turned by pi about Y, so its 2D x runs toward -x.
  const hingeWorldX = hingeLayout.centersX.map((cx2D) => innerW / 2 + T - cx2D);
  // Knuckle plates: five per hinge, alternating base, lid, base, lid, base, one ply apart plus 0.4 mm.
  const knPitch = T + 0.4;
  const knuckles = hingeType === 'knuckle-pin'
    ? hingeWorldX.flatMap((xc, g) =>
        [0, 1, 2, 3, 4].map((j) => ({ id: `hinge-knuckle-${g + 1}-${j + 1}`, x: xc + (j - 2) * knPitch, onLid: j % 2 === 1 }))
      )
    : [];
  // The slot each knuckle's glue tab goes into, in a back wall's 2D frame: `seam2D` is the seam's y,
  // `dir` +1 when the wall runs down from it (base), -1 up (lid).
  const knuckleSlots = (panelId: string, seam2D: number, dir: 1 | -1, onLid: boolean): { paths: DielinePath[]; holes3D: Point2D[][] } => {
    const paths: DielinePath[] = [];
    const holes3D: Point2D[][] = [];
    const slotW = Math.max(0.5, T - kerf * 0.5);
    const a = seam2D + dir * (knR + 1);
    const b = seam2D + dir * (knHk - 1);
    knuckles
      .filter((k) => k.onLid === onLid)
      .forEach((k, i) => {
        const cx2D = innerW / 2 + T - k.x;
        const pts = [
          { x: cx2D - slotW / 2, y: Math.min(a, b) },
          { x: cx2D + slotW / 2, y: Math.min(a, b) },
          { x: cx2D + slotW / 2, y: Math.max(a, b) },
          { x: cx2D - slotW / 2, y: Math.max(a, b) },
        ];
        paths.push({ id: `${panelId}-knuckle-slot-${i + 1}`, layer: 'cut', d: pointsToSvgPath(pts, true), closed: true });
        holes3D.push(pts);
      });
    return { paths, holes3D };
  };

  // Base Bottom
  const botRes = specToPanel2D({
    id: 'bottom',
    name: 'Chest Base Bottom',
    faceLabel: 'BASE BOTTOM',
    innerW,
    innerH: innerD,
    thickness: T,
    kerf,
    countX: countW,
    countY: countD,
    topEdge: 'odd-tabs',
    rightEdge: 'odd-tabs',
    bottomEdge: 'odd-tabs',
    leftEdge: 'odd-tabs',
    ownCorners: false,
  });
  panels2D.push(botRes.panel2D);
  panels3D.push({
    id: 'bottom',
    name: 'Chest Base Bottom',
    faceId: 'bottom',
    widthMm: innerW + 2 * T,
    heightMm: innerD + 2 * T,
    thicknessMm: T,
    color: '#c9a270',
    closedPos: [0, -innerH / 2 - T / 2, 0],
    explodedPos: [0, -innerH / 2 - T / 2 - explodeDist, 0],
    rotation: [Math.PI / 2, 0, 0],
    outlinePoints: botRes.outlinePoints,
  });

  // Base Walls (Front, Back, Left, Right)
  const baseYCenter = -innerH / 2 + baseWallH / 2;
  for (const side of ['front', 'back'] as const) {
    const isFront = side === 'front';
    const hardware = !isFront
      ? buildHardwareHingeHoles('base-back', T + hingeLayout.fromSeam)
      : { paths: [], holes3D: [] };
    const slots = !isFront ? knuckleSlots('base-back', T, 1, false) : { paths: [], holes3D: [] };
    const baseHingeHoles = { paths: [...hardware.paths, ...slots.paths], holes3D: [...hardware.holes3D, ...slots.holes3D] };
    const res = specToPanel2D({
      id: `base-${side}`,
      name: isFront ? 'Base Front Wall' : 'Base Back Wall (Hinged)',
      faceLabel: isFront ? 'BASE FRONT' : 'BASE BACK',
      innerW,
      innerH: baseWallH,
      thickness: T,
      kerf,
      countX: countW,
      countY: countBaseH,
      topEdge: 'flat-inner',
      rightEdge: 'even-tabs',
      bottomEdge: 'even-tabs',
      leftEdge: 'even-tabs',
      ownCorners: true,
      extraPaths: baseHingeHoles.paths,
      holeContours: baseHingeHoles.holes3D,
    });
    panels2D.push(res.panel2D);
    const zSign = isFront ? 1 : -1;
    panels3D.push({
      id: `base-${side}`,
      name: res.panel2D.name,
      faceId: side,
      widthMm: innerW + 2 * T,
      heightMm: baseWallH + 2 * T,
      thicknessMm: T,
      color: '#d6b384',
      closedPos: [0, baseYCenter, zSign * (innerD / 2 + T / 2)],
      explodedPos: [0, baseYCenter, zSign * (innerD / 2 + T / 2 + explodeDist)],
      rotation: [0, isFront ? 0 : Math.PI, 0],
      outlinePoints: res.outlinePoints,
      holeContours: baseHingeHoles.holes3D.length > 0 ? baseHingeHoles.holes3D : undefined,
    });
  }

  for (const side of ['left', 'right'] as const) {
    const isRight = side === 'right';
    const extraPaths: DielinePath[] = [];
    const holes3D: Point2D[][] = [];
    if (hingeType === 'side-pivot') {
      // P: pivotM in from the back face (2D x 0 on the left wall, the far end on the right) and
      // pivotK below the seam, which is pivotGap above this wall's top edge.
      const r = pinHoleR;
      const cx = isRight ? innerD + 2 * T - pivotM : pivotM;
      const cy = T + pivotK - pivotGap;
      extraPaths.push({
        id: `base-${side}-pivot-hole`,
        layer: 'cut',
        d: circleSvgPath(cx, cy, r),
        closed: true,
      });
      holes3D.push(circlePts(cx, cy, r));
    }
    const res = specToPanel2D({
      id: `base-${side}`,
      name: isRight ? 'Base Right Wall' : 'Base Left Wall',
      faceLabel: isRight ? 'BASE RIGHT' : 'BASE LEFT',
      innerW: innerD,
      innerH: baseWallH,
      thickness: T,
      kerf,
      countX: countD,
      countY: countBaseH,
      topEdge: 'flat-inner',
      rightEdge: 'odd-tabs',
      bottomEdge: 'even-tabs',
      leftEdge: 'odd-tabs',
      ownCorners: false,
      extraPaths,
    });
    panels2D.push(res.panel2D);
    const xSign = isRight ? 1 : -1;
    panels3D.push({
      id: `base-${side}`,
      name: res.panel2D.name,
      faceId: side,
      widthMm: innerD + 2 * T,
      heightMm: baseWallH + 2 * T,
      thicknessMm: T,
      color: '#cda676',
      closedPos: [xSign * (innerW / 2 + T / 2), baseYCenter, 0],
      explodedPos: [xSign * (innerW / 2 + T / 2 + explodeDist), baseYCenter, 0],
      rotation: [0, isRight ? Math.PI / 2 : -Math.PI / 2, 0],
      outlinePoints: res.outlinePoints,
      holeContours: holes3D.length > 0 ? holes3D : undefined,
    });
  }

  // HINGED LID (Top Plate + 4 Lid Skirt Walls)
  const lidYCenter = seamY + lidH / 2;

  const topRes = specToPanel2D({
    id: 'top',
    name: 'Chest Lid Top',
    faceLabel: 'LID TOP',
    innerW,
    innerH: innerD,
    thickness: T,
    kerf,
    countX: countW,
    countY: countD,
    topEdge: 'odd-tabs',
    rightEdge: 'odd-tabs',
    bottomEdge: 'odd-tabs',
    leftEdge: 'odd-tabs',
    ownCorners: false,
  });
  panels2D.push(topRes.panel2D);
  panels3D.push({
    id: 'top',
    name: 'Chest Lid Top',
    faceId: 'top',
    widthMm: innerW + 2 * T,
    heightMm: innerD + 2 * T,
    thicknessMm: T,
    color: '#e5c89e',
    closedPos: [0, seamY + lidH + T / 2, 0],
    explodedPos: [0, seamY + lidH + T / 2 + explodeDist, 0],
    rotation: [-Math.PI / 2, 0, 0],
    outlinePoints: topRes.outlinePoints,
    foldRig: {
      pivotOffset: hingePivot,
      axis: 'x',
      flatAngleRad: -Math.PI * 0.55,
      foldedAngleRad: 0,
      stage: [0.45, 1.0],
    },
  });

  for (const side of ['front', 'back'] as const) {
    const isFront = side === 'front';
    // In 2D shifted coordinates for Lid Back, topEdge has tabs (height T) + lidH, so bottom flat seam is at y = T + lidH
    const hardware = !isFront
      ? buildHardwareHingeHoles('lid-back', T + lidH - hingeLayout.fromSeam)
      : { paths: [], holes3D: [] };
    const slots = !isFront ? knuckleSlots('lid-back', T + lidH, -1, true) : { paths: [], holes3D: [] };
    const lidHingeHoles = { paths: [...hardware.paths, ...slots.paths], holes3D: [...hardware.holes3D, ...slots.holes3D] };
    const res = specToPanel2D({
      id: `lid-${side}`,
      name: isFront ? 'Lid Front Lip' : 'Lid Back Wall (Hinge)',
      faceLabel: isFront ? 'LID FRONT' : 'LID BACK',
      innerW,
      innerH: lidH,
      thickness: T,
      kerf,
      countX: countW,
      countY: countLidH,
      topEdge: 'even-tabs',
      rightEdge: 'even-tabs',
      bottomEdge: 'flat-inner',
      leftEdge: 'even-tabs',
      ownCorners: true,
      extraPaths: lidHingeHoles.paths,
      holeContours: lidHingeHoles.holes3D,
    });
    panels2D.push(res.panel2D);
    const zSign = isFront ? 1 : -1;
    panels3D.push({
      id: `lid-${side}`,
      name: res.panel2D.name,
      faceId: `lid-${side}`,
      widthMm: innerW + 2 * T,
      heightMm: lidH + 2 * T,
      thicknessMm: T,
      color: '#e0c094',
      closedPos: [0, lidYCenter, zSign * (innerD / 2 + T / 2)],
      explodedPos: [
        0,
        lidYCenter + explodeDist * 0.75,
        zSign * (innerD / 2 + T / 2 + explodeDist * 0.6),
      ],
      rotation: [0, isFront ? 0 : Math.PI, 0],
      outlinePoints: res.outlinePoints,
      holeContours: lidHingeHoles.holes3D.length > 0 ? lidHingeHoles.holes3D : undefined,
      foldRig: {
        pivotOffset: hingePivot,
        axis: 'x',
        flatAngleRad: -Math.PI * 0.55,
        foldedAngleRad: 0,
        stage: [0.45, 1.0],
      },
    });
  }

  for (const side of ['left', 'right'] as const) {
    const isRight = side === 'right';
    const extraPaths: DielinePath[] = [];
    const holes3D: Point2D[][] = [];
    const res = specToPanel2D({
      id: `lid-${side}`,
      name: isRight ? 'Lid Right Cheek' : 'Lid Left Cheek',
      faceLabel: isRight ? 'LID RIGHT' : 'LID LEFT',
      innerW: innerD,
      innerH: lidH,
      thickness: T,
      kerf,
      countX: countD,
      countY: countLidH,
      topEdge: 'even-tabs',
      rightEdge: 'odd-tabs',
      bottomEdge: 'flat-inner',
      leftEdge: 'odd-tabs',
      ownCorners: false,
      extraPaths,
    });
    panels2D.push(res.panel2D);
    const xSign = isRight ? 1 : -1;
    panels3D.push({
      id: `lid-${side}`,
      name: res.panel2D.name,
      faceId: `lid-${side}`,
      widthMm: innerD + 2 * T,
      heightMm: lidH + 2 * T,
      thicknessMm: T,
      color: '#d9b689',
      closedPos: [xSign * (innerW / 2 + T / 2), lidYCenter, 0],
      explodedPos: [
        xSign * (innerW / 2 + T / 2 + explodeDist * 0.7),
        lidYCenter + explodeDist * 0.75,
        0,
      ],
      rotation: [0, isRight ? Math.PI / 2 : -Math.PI / 2, 0],
      outlinePoints: res.outlinePoints,
      holeContours: holes3D.length > 0 ? holes3D : undefined,
      foldRig: {
        pivotOffset: hingePivot,
        axis: 'x',
        flatAngleRad: -Math.PI * 0.55,
        foldedAngleRad: 0,
        stage: [0.45, 1.0],
      },
    });
  }

  // Front Brass Clasp Plate on Clamshell Lid so the split seam and chest clasp are clearly visible in 3D!
  const claspW = Math.min(22, Math.max(12, innerW * 0.18));
  const claspH = Math.min(16, Math.max(10, lidH * 0.6));
  panels3D.push({
    id: 'clamshell-front-clasp',
    name: 'Front Chest Clasp',
    faceId: 'lid-front',
    widthMm: claspW,
    heightMm: claspH,
    thicknessMm: Math.max(1.2, T * 0.45),
    color: '#d49b3b',
    // Its inner face stands 1 mm off the base front: swinging up about the hinge, the clasp's lower
    // half drifts back a fraction of a millimetre before it clears the seam.
    closedPos: [0, seamY, innerD / 2 + T + 1 + Math.max(1.2, T * 0.45) / 2],
    explodedPos: [0, seamY + explodeDist * 0.75, innerD / 2 + T + explodeDist * 0.65],
    rotation: [0, 0, 0],
    foldRig: {
      pivotOffset: hingePivot,
      axis: 'x',
      flatAngleRad: -Math.PI * 0.55,
      foldedAngleRad: 0,
      stage: [0.45, 1.0],
    },
  });

  // Every part that turns with the lid shares the lid's fold.
  const lidRig: Panel3DTransform['foldRig'] = {
    pivotOffset: hingePivot,
    axis: 'x',
    flatAngleRad: -Math.PI * 0.55,
    foldedAngleRad: 0,
    stage: [0.45, 1.0],
  };
  const backOut = (closed: [number, number, number]): [number, number, number] => [closed[0], closed[1], closed[2] - explodeDist * 1.1];
  /** A round barrel segment on the hinge line, `len` long along x, with an optional bore. */
  const barrel = (id: string, name: string, xc: number, len: number, r: number, boreR: number, color: string, onLid: boolean): Panel3DTransform => {
    const ring = circlePts(r, r, r, 24);
    const closedPos: [number, number, number] = [xc, hingeAxis[0], hingeAxis[1]];
    return {
      id,
      name,
      faceId: id,
      widthMm: 2 * r,
      heightMm: 2 * r,
      thicknessMm: len,
      color,
      closedPos,
      explodedPos: onLid ? closedPos : backOut(closedPos),
      // Turned a quarter about Y, the disc lies across the hinge line and its thickness runs along x.
      rotation: [0, Math.PI / 2, 0],
      outlinePoints: ring,
      holeContours: boreR > 0 ? [circlePts(r, r, boreR, 24)] : undefined,
      ...(onLid ? { foldRig: lidRig } : {}),
    };
  };
  /** A flat block: `w` along x, `h` along y, `t` along z, centred at (x, y, z). */
  const block = (id: string, name: string, x: number, y: number, z: number, w: number, h: number, t: number, color: string, onLid: boolean): Panel3DTransform => {
    const closedPos: [number, number, number] = [x, y, z];
    return {
      id,
      name,
      faceId: id,
      widthMm: w,
      heightMm: h,
      thicknessMm: t,
      color,
      closedPos,
      explodedPos: onLid ? closedPos : backOut(closedPos),
      rotation: [0, 0, 0],
      ...(onLid ? { foldRig: lidRig } : {}),
    };
  };
  /** Three barrel segments with 0.3 mm gaps over [x0, x0 + L]: the base owns the outer two, the lid the middle one. */
  const barrelSegments = (L: number, x0: number) => {
    const seg = (L - 0.6) / 3;
    return [0, 1, 2].map((j) => ({ xc: x0 + j * (seg + 0.3) + seg / 2, len: seg, onLid: j === 1 }));
  };

  if (hingeType === 'printed-hinge') {
    // The printed flat offset hinge as printedHinge.ts builds it: plates 1.6 mm thick from 2.8 to
    // 12.5 mm off the hinge line, flat on the back face; a Ø5 knuckle on the line 2.5 mm out; a
    // web from each knuckle segment to its own plate.
    const L = hingeLayout.spacing + 8;
    const boreR = (Math.min(params.hingePinDiameterMm, 3) + 0.25) / 2;
    const webIn = boreR + 0.3;
    hingeWorldX.forEach((xc, idx) => {
      const i = idx + 1;
      for (const onLid of [false, true]) {
        const sgn = onLid ? 1 : -1;
        panels3D.push(
          block(`printed-hinge-${i}-${onLid ? 'lid' : 'base'}`, `Printed Hinge ${i} (${onLid ? 'Lid' : 'Base'} Leaf)`, xc, seamY + sgn * 7.65, zBackFace - 0.8, L, 9.7, 1.6, '#a3a3a3', onLid)
        );
      }
      barrelSegments(L, xc - L / 2).forEach((sg, j) => {
        panels3D.push(barrel(`printed-hinge-${i}-knuckle-${j + 1}`, `Printed Hinge ${i} (Knuckle)`, sg.xc, sg.len, 2.5, boreR, '#a3a3a3', sg.onLid));
        const sgn = sg.onLid ? 1 : -1;
        const webH = 2.8 + 0.5 - webIn;
        panels3D.push(
          block(`printed-hinge-${i}-web-${j + 1}`, `Printed Hinge ${i} (Web)`, sg.xc, seamY + sgn * (webIn + webH / 2), zBackFace - 1.25, sg.len, webH, 2.5, '#a3a3a3', sg.onLid)
        );
      });
    });
  }

  if (hingeType === 'butt-hardware') {
    // A small brass butt hinge per position: leaves 0.8 mm thick, 10 mm each side of the seam, on
    // a Ø4 barrel 2 mm out. Its screw holes are the pilot holes 5 mm from the seam.
    const L = hingeLayout.spacing + 8;
    hingeWorldX.forEach((xc, idx) => {
      const i = idx + 1;
      for (const onLid of [false, true]) {
        const sgn = onLid ? 1 : -1;
        panels3D.push(
          block(`butt-hinge-${i}-${onLid ? 'lid' : 'base'}`, `Butt Hinge ${i} (${onLid ? 'Lid' : 'Base'} Leaf)`, xc, seamY + sgn * 5.5, zBackFace - 0.4, L, 9, 0.8, '#c9a227', onLid)
        );
      }
      barrelSegments(L, xc - L / 2).forEach((sg, j) => {
        panels3D.push(barrel(`butt-hinge-${i}-barrel-${j + 1}`, `Butt Hinge ${i} (Barrel)`, sg.xc, sg.len, 2, 0, '#c9a227', sg.onLid));
      });
    });
  }

  if (hingeType === 'knuckle-pin') {
    // Knuckle plates, cut from the box's own sheet. Drawn in (u, v): u out from the back face, v up
    // from the seam (down for a base plate). The body runs knHk along the wall and out to the round
    // end around the pin; a glue tab one ply deep goes into the wall's slot.
    const plate = (dir: 1 | -1): Point2D[] => {
      const pts: Point2D[] = [
        { x: 0, y: -dir * knHk },
        { x: knE + knR, y: -dir * knHk },
        { x: knE + knR, y: 0 },
      ];
      for (let i = 1; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        pts.push({ x: knE + knR * Math.cos(a), y: dir * knR * Math.sin(a) });
      }
      pts.push(
        { x: knE - knR, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: -dir * (knR + 1) },
        { x: -T, y: -dir * (knR + 1) },
        { x: -T, y: -dir * (knHk - 1) },
        { x: 0, y: -dir * (knHk - 1) }
      );
      return pts;
    };
    for (const k of knuckles) {
      // A lid plate's body runs up from the seam; a base plate's down.
      const uv = plate(k.onLid ? -1 : 1);
      const hole = circlePts(knE, 0, pinHoleR, 16);
      const uMin = -T;
      const uMax = knE + knR;
      const vMin = Math.min(...uv.map((q) => q.y));
      const vMax = Math.max(...uv.map((q) => q.y));
      // Outline frame: x along u from its minimum, y down from the top.
      const toFrame = (q: Point2D): Point2D => ({ x: q.x - uMin, y: vMax - q.y });
      const outline = uv.map(toFrame);
      const holeFrame = hole.map(toFrame);
      const w = uMax - uMin;
      const h = vMax - vMin;
      panels2D.push({
        id: k.id,
        name: `Hinge knuckle (${k.onLid ? 'lid' : 'base'})`,
        faceLabel: '',
        widthMm: w,
        heightMm: h,
        safeRect: { x: 0, y: 0, width: w, height: h },
        sheetX: 0,
        sheetY: 0,
        paths: [
          { id: `${k.id}-cut`, layer: 'cut', d: pointsToSvgPath(outline, true), closed: true },
          { id: `${k.id}-pin`, layer: 'cut', d: pointsToSvgPath(holeFrame, true), closed: true },
        ],
      });
      const closedPos: [number, number, number] = [k.x, seamY + (vMin + vMax) / 2, zBackFace - (uMin + uMax) / 2];
      panels3D.push({
        id: k.id,
        name: `Hinge Knuckle (${k.onLid ? 'Lid' : 'Base'})`,
        faceId: k.id,
        widthMm: w,
        heightMm: h,
        thicknessMm: T,
        color: k.onLid ? '#e0c094' : '#d6b384',
        closedPos,
        explodedPos: k.onLid ? closedPos : backOut(closedPos),
        // Turned a quarter about Y: the plate stands across the back wall, u running out along -z.
        rotation: [0, Math.PI / 2, 0],
        outlinePoints: outline,
        holeContours: [holeFrame],
        ...(k.onLid ? { foldRig: lidRig } : {}),
      });
    }
  }

  if (hingeType === 'side-pivot') {
    // A cheek plate glued outside each lid side, from the lid's top face down past the seam over the
    // base side wall, with the pin hole at P. Its bottom corners are rounded.
    const plateW = innerD + 2 * T;
    const plateTop = seamY + lidH + T;
    const plateBottom = hingeAxis[0] - pivotK;
    const plateH = plateTop - plateBottom;
    const rc = Math.min(8, pivotK);
    const outline: Point2D[] = [{ x: 0, y: 0 }, { x: plateW, y: 0 }];
    for (const [cx, start] of [
      [plateW - rc, 0],
      [rc, Math.PI / 2],
    ] as const) {
      for (let i = 0; i <= 6; i++) {
        const a = start + (i / 6) * (Math.PI / 2);
        outline.push({ x: cx + rc * Math.cos(a), y: plateH - rc + rc * Math.sin(a) });
      }
    }
    for (const side of ['left', 'right'] as const) {
      const isRight = side === 'right';
      // The left plate's x runs back to front, the right plate's front to back (as the side walls).
      const holeX = isRight ? plateW - pivotM : pivotM;
      const hole = circlePts(holeX, plateTop - hingeAxis[0], pinHoleR, 16);
      const id = `lid-pivot-${side}`;
      panels2D.push({
        id,
        name: `Pivot cheek (${side})`,
        faceLabel: isRight ? 'PIVOT RIGHT' : 'PIVOT LEFT',
        widthMm: plateW,
        heightMm: plateH,
        safeRect: { x: T, y: T, width: plateW - 2 * T, height: lidH },
        sheetX: 0,
        sheetY: 0,
        paths: [
          { id: `${id}-cut`, layer: 'cut', d: pointsToSvgPath(outline, true), closed: true },
          { id: `${id}-pin`, layer: 'cut', d: pointsToSvgPath(hole, true), closed: true },
        ],
      });
      const xSign = isRight ? 1 : -1;
      panels3D.push({
        id,
        name: `Pivot Cheek (${isRight ? 'Right' : 'Left'})`,
        faceId: id,
        widthMm: plateW,
        heightMm: plateH,
        thicknessMm: T,
        color: '#d9b689',
        closedPos: [xSign * (innerW / 2 + T + T / 2), (plateTop + plateBottom) / 2, 0],
        explodedPos: [xSign * (innerW / 2 + T + T / 2 + explodeDist * 0.7), (plateTop + plateBottom) / 2 + explodeDist * 0.75, 0],
        rotation: [0, isRight ? Math.PI / 2 : -Math.PI / 2, 0],
        outlinePoints: outline,
        holeContours: [hole],
        foldRig: lidRig,
      });
    }
  }

  return {
    panels2D,
    panels3D,
    fingerCountSummary: `Clamshell (${params.clamshellHingeType}): ${countW}×${countD} base + hinged lid`,
  };
}

/**
 * The inner radius of the living-hinge wrap's curved shoulders, clamped so the straight lower wall
 * stays at least 15 mm and the flat top deck at least 10 mm.
 */
export const wrapBendRadiusMm = (innerD: number, innerH: number): number =>
  Math.max(10, Math.min(innerH * 0.42, innerD * 0.35, innerH - 15));

/** Wood the tongue keeps beside and above and below its finger hole, and the front wall below the notch. */
const TONGUE_SIDE_MM = 4;
const TONGUE_END_MM = 2.5;
const FRONT_BELOW_NOTCH_MM = 6;
/** The smallest finger hole worth cutting. */
export const MIN_THUMB_HOLE_MM = 4;

/**
 * The catch tongue on the living-hinge lid's front edge, which drops into a notch in the front wall's
 * top edge. With a finger hole it grows to hold the hole with wood round it; a hole bigger than the
 * box has room for shrinks to fit (`shrunk`), and below `MIN_THUMB_HOLE_MM` the tongue stays a plain
 * tab one thickness deep.
 */
export function livingHingeCatch(params: BoxParameters, innerW: number, frontH: number) {
  const T = params.materialThicknessMm;
  const plain = {
    width: Math.min(24, Math.max(10, innerW * 0.24)),
    height: T,
    hole: null as null | { width: number; height: number },
    shrunk: false,
  };
  if (!params.livingHingeThumbHole) return plain;
  const wantW = Math.max(MIN_THUMB_HOLE_MM, params.livingHingeThumbHoleWidthMm || 16);
  const wantH = Math.max(MIN_THUMB_HOLE_MM, params.livingHingeThumbHoleHeightMm || 8);
  // The tongue may span up to 60% of the front, and reach down to 6 mm above the bottom of the wall.
  const holeW = Math.min(wantW, innerW * 0.6 - 2 * TONGUE_SIDE_MM);
  const holeH = Math.min(wantH, frontH - FRONT_BELOW_NOTCH_MM - 2 * TONGUE_END_MM);
  if (holeW < MIN_THUMB_HOLE_MM || holeH < MIN_THUMB_HOLE_MM) return { ...plain, shrunk: true };
  return {
    width: holeW + 2 * TONGUE_SIDE_MM,
    height: holeH + 2 * TONGUE_END_MM,
    hole: { width: holeW, height: holeH },
    shrunk: holeW < wantW || holeH < wantH,
  };
}

/**
 * The catch tongue's edge as a path, origin at its root's middle, y running out toward its tip:
 * from the left end of the root line, a fillet `rootR` into the tongue's side, down to the tip with
 * its corners rounded to `tipR`, and back up the other side to the root line. A tongue `width` across
 * and `height` long; both radii shrink to what fits.
 */
export function catchTongueEdge(width: number, height: number, tipR: number, rootR: number, steps = 8): Point2D[] {
  const r = Math.max(0, Math.min(tipR, width / 2, height / 2));
  const f = Math.max(0, Math.min(rootR, height - r));
  const w = width / 2;
  const arc = (cx: number, cy: number, rad: number, a0: number, a1: number) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / steps;
      return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
    });
  const pts: Point2D[] = [
    // Root fillet, left: concave, centred off the tongue's side.
    ...(f > 0 ? arc(-w - f, f, f, -Math.PI / 2, 0) : [{ x: -w, y: 0 }]),
    // Tip corners, convex.
    ...(r > 0 ? arc(-w + r, height - r, r, Math.PI, Math.PI / 2) : [{ x: -w, y: height }]),
    ...(r > 0 ? arc(w - r, height - r, r, Math.PI / 2, 0) : [{ x: w, y: height }]),
    // Root fillet, right.
    ...(f > 0 ? arc(w + f, f, f, Math.PI, Math.PI * 1.5) : [{ x: w, y: 0 }]),
  ];
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 1e-9);
}

/** The tongue's tip corners and its root fillets, before kerf, softened for the hand. */
export const catchTongueRadii = (width: number, height: number) => ({
  tip: Math.min(3, width / 4, height / 2),
  root: Math.min(1.5, height / 3),
});

/** The hinge settings a box's parameters hold. */
export const livingHingeSettings = (params: BoxParameters): HingePatternSettings => ({
  pattern: params.livingHingePattern,
  pitchMm: params.livingHingePitchMm,
  cutMm: params.livingHingeCutMm,
  bridgeMm: params.livingHingeBridgeMm,
});

/**
 * One bend zone's cuts on the living-hinge wrap: `width` across, `arcLength` along the bend,
 * origin at the zone's start. Both zones are the same, and the 3D view draws them from this too.
 */
export const livingHingeZoneCuts = (params: BoxParameters, width: number, arcLength: number): HingeShape[] =>
  hingeCuts(livingHingeSettings(params), { x: 0, y: 0, width, height: arcLength });

/**
 * Generates a Living-Hinge Curved-Shoulder Box:
 * - Left & Right walls have rounded top-back and top-front corners of radius R
 * - Front & Back lower walls rise to H - R (meeting the bottom of the curved shoulders)
 * - Living-Hinge Wrap Cover arches over both radius-R shoulders with laser-cut kerf lattice zones
 */
function generateLivingHingeBox(
  params: BoxParameters,
  innerW: number,
  innerD: number,
  innerH: number,
  countW: number,
  countD: number,
  _countH: number
): {
  panels2D: BoxPanel2D[];
  panels3D: Panel3DTransform[];
  fingerCountSummary: string;
} {
  const T = params.materialThicknessMm;
  const kerf = params.kerfMm;

  const attachMode = params.livingHingeAttachMode || 'one-piece-back';
  const isOnePieceBack =
    attachMode === 'one-piece-back' || attachMode === 'side-arch-tabs';
  // Older projects chose the guides through the attachment; now any attachment can have them.
  const hasSideArchTabs = attachMode === 'side-arch-tabs' || params.livingHingeTopGuides;

  const bendRadius = wrapBendRadiusMm(innerD, innerH);
  const straightH = Math.max(15, innerH - bendRadius);
  const topFlatD = Math.max(10, innerD - 2 * bendRadius);
  // Each 90° shoulder's length in the flat wrap. A kerf hinge bends by its strips twisting about
  // their own middles, so the sheet keeps its length at mid-thickness: the inner face, hugging the
  // side wall's arch at bendRadius, gets shorter and the outer longer.
  const arcLength = (Math.PI * (bendRadius + T / 2)) / 2;
  const frontLipH = Math.min(14, straightH * 0.38);
  const sideTabW = Math.min(16, Math.max(6, topFlatD * 0.45));

  const countStraightH = computeOddFingerCount(straightH, params.fingerWidthMm);
  const explodeDist = Math.max(innerW, innerD, innerH) * 0.55;

  const panels2D: BoxPanel2D[] = [];
  const panels3D: Panel3DTransform[] = [];

  // 1. BOTTOM PLATE (W x D)
  const bottomRes = specToPanel2D({
    id: 'bottom',
    name: 'Bottom Plate',
    faceLabel: 'BOTTOM',
    innerW,
    innerH: innerD,
    thickness: T,
    kerf,
    countX: countW,
    countY: countD,
    topEdge: 'odd-tabs',
    rightEdge: 'odd-tabs',
    bottomEdge: 'odd-tabs',
    leftEdge: 'odd-tabs',
    ownCorners: false,
  });
  panels2D.push(bottomRes.panel2D);
  panels3D.push({
    id: 'bottom',
    name: 'Bottom Plate',
    faceId: 'bottom',
    widthMm: innerW + 2 * T,
    heightMm: innerD + 2 * T,
    thicknessMm: T,
    color: '#d6b384',
    closedPos: [0, -innerH / 2 - T / 2, 0],
    explodedPos: [0, -innerH / 2 - T / 2 - explodeDist, 0],
    rotation: [Math.PI / 2, 0, 0],
    outlinePoints: bottomRes.outlinePoints,
  });

  // 2. LOWER FRONT WALL: it stops `frontLipH` below the seam, where the closed lid's front lip
  //    comes down in the same plane and rests on it. A notch in its top edge takes the lip's catch
  //    tongue, which locates the lid side to side and front to back.
  //    & LOWER BACK WALL (separate with interlocking top fingers when 'finger-joint-back', or integrated into 1-piece wrap when 'one-piece-back')
  const frontH = straightH - frontLipH;
  const tongue = livingHingeCatch(params, innerW, frontH);
  const catchW = tongue.width;
  const countFrontH = computeOddFingerCount(frontH, params.fingerWidthMm);
  const lowerWallYCenter = -innerH / 2 + frontH / 2;
  const frontRes = specToPanel2D({
    id: 'front',
    name: 'Lower Front Wall (With Lid Catch Notch)',
    faceLabel: 'LOWER FRONT',
    innerW,
    innerH: frontH,
    thickness: T,
    kerf,
    countX: countW,
    countY: countFrontH,
    topEdge: 'flat-inner',
    rightEdge: 'even-tabs',
    bottomEdge: 'even-tabs',
    leftEdge: 'even-tabs',
    ownCorners: true,
  });
  // The notch runs from above the top edge down the tongue's height, so the tongue seats flush. It's drawn
  // a kerf narrower than the tongue and the tongue a kerf wider, as the finger joints are, so once the
  // beam has burned both they meet at catchW and press-fit like the fingers.
  // Shaped to the tongue: its tip corners rounded inside the notch, its root fillets rounding over
  // the notch's mouth. The kerf offset moves each radius by half a kerf, as it moves the edges.
  const radii = catchTongueRadii(catchW, tongue.height);
  const notchEdge = catchTongueEdge(catchW - kerf, tongue.height, radii.tip - kerf / 2, radii.root + kerf / 2).map(
    (p) => ({ x: T + innerW / 2 + p.x, y: T + p.y }),
  );
  const notch: Point2D[] = [
    { x: notchEdge[0].x, y: 0 },
    ...notchEdge,
    { x: notchEdge[notchEdge.length - 1].x, y: 0 },
  ];
  const frontOutline = polygonDifference(frontRes.outlinePoints, notch);
  frontRes.panel2D.paths = frontRes.panel2D.paths.map((path) =>
    path.id === 'front-outline'
      ? { ...path, d: pointsToSvgPath(frontOutline.map((p) => ({ x: p.x, y: p.y - T })), true) }
      : path,
  );
  panels2D.push(frontRes.panel2D);
  panels3D.push({
    id: 'front',
    name: frontRes.panel2D.name,
    faceId: 'front',
    widthMm: innerW + 2 * T,
    heightMm: frontH + 2 * T,
    thicknessMm: T,
    color: '#dfc195',
    closedPos: [0, lowerWallYCenter, innerD / 2 + T / 2],
    explodedPos: [0, lowerWallYCenter, innerD / 2 + T / 2 + explodeDist],
    rotation: [0, 0, 0],
    outlinePoints: frontOutline,
  });

  // Lower Back Spine Wall:
  // - When `isOnePieceBack` ('one-piece-back' or 'side-arch-tabs'), it is integrated directly into the 1-Piece Living-Hinge Wrap Lid in both 2D and 3D!
  // - When `finger-joint-back`, it is a separate wall with `odd-tabs` along its top edge (`Y` in `[seamY - T .. seamY]`) that interlock with the lid's rear `even-tabs` fingers!
  const backInnerH = isOnePieceBack ? straightH : Math.max(12, straightH - T);
  const countBackH = computeOddFingerCount(backInnerH, params.fingerWidthMm);
  const backRes = specToPanel2D({
    id: 'back',
    name: isOnePieceBack
      ? 'Lower Back Spine (Integrated with Wrap)'
      : 'Lower Back Spine Wall (Finger-Jointed to Lid)',
    faceLabel: 'LOWER BACK',
    innerW,
    innerH: backInnerH,
    thickness: T,
    kerf,
    countX: countW,
    countY: countBackH,
    topEdge: isOnePieceBack ? 'flat-inner' : 'odd-tabs',
    rightEdge: 'even-tabs',
    bottomEdge: 'even-tabs',
    leftEdge: 'even-tabs',
    ownCorners: true,
  });
  if (!isOnePieceBack) {
    panels2D.push(backRes.panel2D);
    const backYCenter = -innerH / 2 + backInnerH / 2;
    panels3D.push({
      id: 'back',
      name: backRes.panel2D.name,
      faceId: 'back',
      widthMm: innerW + 2 * T,
      heightMm: backInnerH + 2 * T,
      thicknessMm: T,
      color: '#dfc195',
      closedPos: [0, backYCenter, -(innerD / 2 + T / 2)],
      explodedPos: [0, backYCenter, -(innerD / 2 + T / 2 + explodeDist)],
      rotation: [0, Math.PI, 0],
      outlinePoints: backRes.outlinePoints,
    });
  }

  // 3. CURVED-SHOULDER LEFT & RIGHT SIDE WALLS
  //    Lower section (height straightH) has odd-tabs on left/right vertical edges and even-tabs on bottom;
  //    Upper section (height bendRadius) arches smoothly in a 90° curve on both top corners!
  //    When `hasSideArchTabs` is enabled, a protruding retainer tab sits at the center of the flat top deck!
  const buildCurvedSideWall = (side: 'left' | 'right') => {
    const isRight = side === 'right';
    const baseSpec: FingerPanelSpec = {
      id: side,
      name: isRight ? 'Curved Right Side Wall' : 'Curved Left Side Wall',
      faceLabel: isRight ? 'CURVED RIGHT' : 'CURVED LEFT',
      innerW: innerD,
      innerH: straightH,
      thickness: T,
      kerf,
      countX: countD,
      countY: countStraightH,
      topEdge: 'flat-inner',
      rightEdge: 'odd-tabs',
      bottomEdge: 'even-tabs',
      leftEdge: 'odd-tabs',
      ownCorners: false,
    };
    // The front edge, the right wall's left and the left wall's right, carries fingers only as high
    // as the shortened front wall; above that it stays flat, behind the lid's lip. The fingers come
    // from a panel the front wall's height laid over the bottom of a flat-fronted one, so they mate
    // with the front wall's.
    const frontEdge: keyof Pick<FingerPanelSpec, 'leftEdge' | 'rightEdge'> = isRight ? 'leftEdge' : 'rightEdge';
    const backEdge: keyof Pick<FingerPanelSpec, 'leftEdge' | 'rightEdge'> = isRight ? 'rightEdge' : 'leftEdge';
    const flatFront = buildFingerPanelPolygon({ ...baseSpec, [frontEdge]: 'flat-inner' });
    const frontFingers = buildFingerPanelPolygon({
      ...baseSpec,
      innerH: frontH,
      countY: countFrontH,
      [backEdge]: 'flat-inner',
    }).map((p) => ({ x: p.x, y: p.y + frontLipH }));
    const rawLowerPts = startAtTopRight(polygonUnion(flatFront, frontFingers), T + innerD, T);

    const archPts: Point2D[] = [];
    const arcSteps = 12;
    // Left 90° shoulder arc: angle from PI (left, x = T, y = T + bendRadius) to 1.5*PI (top, x = T + bendRadius, y = T)
    for (let s = 0; s <= arcSteps; s++) {
      const theta = Math.PI + (s / arcSteps) * (Math.PI / 2);
      archPts.push({
        x: T + bendRadius + Math.cos(theta) * bendRadius,
        y: T + bendRadius + Math.sin(theta) * bendRadius,
      });
    }
    // Optional top-deck retainer tab protruding upward (from y = T to y = 0) at center of flat top deck
    if (hasSideArchTabs) {
      const midX = T + innerD / 2;
      archPts.push(
        { x: midX - sideTabW / 2, y: T },
        { x: midX - sideTabW / 2, y: 0 },
        { x: midX + sideTabW / 2, y: 0 },
        { x: midX + sideTabW / 2, y: T }
      );
    }
    // Right 90° shoulder arc: angle from 1.5*PI (top) to 2*PI (right, x = T + innerD, y = T + bendRadius)
    for (let s = 0; s <= arcSteps; s++) {
      const theta = 1.5 * Math.PI + (s / arcSteps) * (Math.PI / 2);
      archPts.push({
        x: T + innerD - bendRadius + Math.cos(theta) * bendRadius,
        y: T + bendRadius + Math.sin(theta) * bendRadius,
      });
    }

    const restLowerPts = rawLowerPts.map((p) => ({
      x: p.x,
      y: p.y + bendRadius,
    }));
    const fullOutlinePts = [...archPts, ...restLowerPts];

    const yMinOffset = hasSideArchTabs ? 0 : T;
    const shifted2DPts = fullOutlinePts.map((p) => ({
      x: p.x,
      y: p.y - yMinOffset,
    }));
    const actualW = innerD + 2 * T;
    const actualH = hasSideArchTabs ? innerH + 2 * T : innerH + T;

    panels2D.push({
      id: side,
      name: baseSpec.name,
      faceLabel: baseSpec.faceLabel,
      widthMm: actualW,
      heightMm: actualH,
      safeRect: { x: T, y: bendRadius, width: innerD, height: straightH },
      // Patterns may use the whole inside of the wall, arch and all: the rounded top inside the
      // finger joints, down to the floor's joint line.
      patternOutline: [
        ...archPts.filter((p) => p.y >= T - 1e-9),
        { x: T + innerD, y: T + bendRadius + straightH },
        { x: T, y: T + bendRadius + straightH },
      ].map((p) => ({ x: p.x, y: p.y - yMinOffset })),
      sheetX: 0,
      sheetY: 0,
      paths: [
        {
          id: `${side}-curved-outline`,
          layer: 'cut',
          d: pointsToSvgPath(shifted2DPts, true),
          closed: true,
        },
      ],
    });

    const xSign = isRight ? 1 : -1;
    panels3D.push({
      id: side,
      name: baseSpec.name,
      faceId: side,
      widthMm: innerD + 2 * T,
      heightMm: innerH + 2 * T,
      thicknessMm: T,
      color: '#cda676',
      closedPos: [xSign * (innerW / 2 + T / 2), 0, 0],
      explodedPos: [xSign * (innerW / 2 + T / 2 + explodeDist), 0, 0],
      rotation: [0, isRight ? Math.PI / 2 : -Math.PI / 2, 0],
      outlinePoints: fullOutlinePts,
    });
  };

  buildCurvedSideWall('left');
  buildCurvedSideWall('right');

  // 4. LIVING-HINGE WRAP COVER (Connected to the Back Wall via 1-Piece Continuous Spine OR Interlocking Finger Joints!)
  //    In 2D (from top y = 0 downward):
  //    - [0 .. T]: Protruding Front Catch Tongue (width = catchW) that slots into the Lower Front Wall
  //    - [T .. T + frontLipH]: Front Overhang Lip
  //    - [T + frontLipH .. zone1End]: Front 90° Living-Hinge Kerf Zone (arcLength)
  //    - [zone1End .. zone2Start]: Flat Top Deck (topFlatD, with optional side arch retainer slots!)
  //    - [zone2Start .. zone2End]: Rear 90° Living-Hinge Kerf Zone (arcLength)
  //    - Below zone2End:
  //      * If 'one-piece-back' or 'side-arch-tabs': Continues directly into the Lower Back Spine Wall (straightH + T) with full finger joints!
  //      * If 'finger-joint-back': Rear Attach Skirt (frontLipH) with mating `even-tabs` finger joints along its bottom edge!
  const zone1Start = tongue.height + frontLipH;
  const zone1End = zone1Start + arcLength;
  const zone2Start = zone1End + topFlatD;
  const zone2End = zone2Start + arcLength;

  const extraWrapPaths: DielinePath[] = [];
  const wFull = innerW + 2 * T;

  const addLivingHingeZone = (yStart: number, prefix: string) => {
    livingHingeZoneCuts(params, wFull, arcLength).forEach((shape, i) => {
      const moved = shape.map((line) => line.map((p) => ({ x: p.x, y: p.y + yStart })));
      extraWrapPaths.push({ id: `${prefix}-${i}`, layer: 'cut', d: hingeShapePath(moved), closed: false });
    });
  };

  addLivingHingeZone(zone1Start, 'lh-z1');
  addLivingHingeZone(zone2Start, 'lh-z2');

  // The tongue's finger hole: a rounded slot through its middle.
  if (tongue.hole) {
    const { width: hw, height: hh } = tongue.hole;
    const hole = buildRoundedRectPoints(hw, hh, hh / 2).map((p) => ({
      x: p.x + wFull / 2 - hw / 2,
      y: p.y + tongue.height / 2 - hh / 2,
    }));
    extraWrapPaths.push({ id: 'lh-catch-finger-hole', layer: 'cut', d: pointsToSvgPath(hole, true), closed: true });
  }

  // Build the orthogonal outer perimeter of the Living-Hinge Wrap Lid (including its Back-Wall attachment!)
  const topCatchHeaderPts: Point2D[] = [
    { x: 0, y: zone2End },
    { x: 0, y: tongue.height },
    // The tongue, tip at y = 0, a kerf wider than the notch's and its radii half a kerf rounder.
    ...catchTongueEdge(
      catchW + kerf,
      tongue.height,
      catchTongueRadii(catchW, tongue.height).tip + kerf / 2,
      catchTongueRadii(catchW, tongue.height).root - kerf / 2,
    ).map((p) => ({ x: wFull / 2 + p.x, y: tongue.height - p.y })),
    { x: wFull, y: tongue.height },
    { x: wFull, y: zone2End },
  ];

  let wrapOutlinePts: Point2D[];
  let wrapTotalH: number;
  let rearAttachment3DPts: Point2D[];

  if (isOnePieceBack) {
    // 1-Piece Continuous Back Wall + Living-Hinge Wrap:
    // Graft the finger-jointed Lower Back Wall onto y >= zone2End!
    const rawBackPts = buildFingerPanelPolygon({
      id: 'back-integrated',
      name: 'Integrated Back Wall',
      faceLabel: 'BACK',
      innerW,
      innerH: straightH,
      thickness: T,
      kerf,
      countX: countW,
      countY: countStraightH,
      topEdge: 'flat-inner',
      rightEdge: 'even-tabs',
      bottomEdge: 'even-tabs',
      leftEdge: 'even-tabs',
      ownCorners: true,
    });
    rearAttachment3DPts = rawBackPts;
    // rawBackPts[0] is (0, T) and rawBackPts[1] is (wFull, T); shift remaining vertices down by zone2End - T
    const lowerBackChain = rawBackPts.slice(2).map((p) => ({
      x: p.x,
      y: p.y + zone2End - T,
    }));
    wrapOutlinePts = [...topCatchHeaderPts, ...lowerBackChain];
    wrapTotalH = zone2End + straightH + T;
  } else {
    // 2-Piece Finger-Jointed to Back Wall:
    // Rear attachment edge with `even-tabs` along its bottom edge that mate with `odd-tabs` on the top of `back`!
    const rawSkirtPts = buildFingerPanelPolygon({
      id: 'lid-rear-skirt',
      name: 'Lid Rear Finger Joint',
      faceLabel: 'SKIRT',
      innerW,
      innerH: 0,
      thickness: T,
      kerf,
      countX: countW,
      countY: 1,
      topEdge: 'flat-inner',
      rightEdge: 'flat-outer',
      bottomEdge: 'even-tabs',
      leftEdge: 'flat-outer',
      ownCorners: true,
    });
    rearAttachment3DPts = rawSkirtPts;
    const lowerSkirtChain = rawSkirtPts.slice(2).map((p) => ({
      x: p.x,
      y: p.y + zone2End - T,
    }));
    wrapOutlinePts = [...topCatchHeaderPts, ...lowerSkirtChain];
    wrapTotalH = zone2End + T;
  }

  // The top guides: each side wall's tab rises into a notch in the deck's edge, the wall's thickness
  // deep. Drawn at the tab's own size with no kerf offset, so after cutting they're a kerf loose
  // either side: they hold the closed lid square without gripping it.
  if (hasSideArchTabs) {
    const slotMidY = (zone1End + zone2Start) / 2;
    const sY0 = slotMidY - sideTabW / 2;
    const sY1 = slotMidY + sideTabW / 2;
    for (const [x0, x1] of [
      [-1, T],
      [wFull - T, wFull + 1],
    ]) {
      wrapOutlinePts = polygonDifference(wrapOutlinePts, [
        { x: x0, y: sY0 },
        { x: x1, y: sY0 },
        { x: x1, y: sY1 },
        { x: x0, y: sY1 },
      ]);
    }
  }

  // The wrap is built tongue first, but laid on the sheet end for end, back wall at the top: artwork
  // on the deck then reads upright from the box's front, as the 3D view shows it, and its offsets
  // run the same way as the 3D decal's.
  const endForEnd = (d: string) =>
    d.replace(/([ML])\s*(-?[\d.]+)\s+(-?[\d.]+)/g, (_, cmd: string, x: string, y: string) => `${cmd} ${x} ${fmt(wrapTotalH - Number(y))}`);
  panels2D.push({
    id: 'top',
    name: isOnePieceBack
      ? '1-Piece Back Wall + Living-Hinge Wrap Lid'
      : 'Living-Hinge Wrap Lid (Finger-Jointed to Back Wall)',
    faceLabel: isOnePieceBack ? '1-PIECE BACK + LIVING HINGE LID' : 'LIVING HINGE WRAP LID',
    widthMm: wFull,
    heightMm: wrapTotalH,
    safeRect: { x: T, y: wrapTotalH - zone1End - topFlatD, width: innerW, height: topFlatD },
    sheetX: 0,
    sheetY: 0,
    paths: (
      [
        {
          id: 'living-wrap-outline',
          layer: 'cut',
          d: pointsToSvgPath(wrapOutlinePts, true),
          closed: true,
        },
        ...extraWrapPaths,
      ] as DielinePath[]
    ).map((path) => ({ ...path, d: endForEnd(path.d) })),
  });

  // 3D Curved Living-Hinge Wrap Lid (rendered by Viewport3D as a single connected 3D mesh including its Back Wall or Rear Finger Joints!)
  panels3D.push({
    id: 'living-hinge-lid',
    name: isOnePieceBack
      ? '1-Piece Back Wall + Living-Hinge Wrap Lid'
      : 'Living-Hinge Wrap Lid (Finger-Jointed to Back)',
    faceId: 'top',
    widthMm: wFull,
    heightMm: innerD + 2 * T,
    thicknessMm: T,
    color: '#e5c89e',
    closedPos: [0, 0, 0],
    explodedPos: isOnePieceBack
      ? [0, explodeDist * 0.72, -explodeDist * 0.85]
      : [0, explodeDist * 0.95, 0],
    rotation: [0, 0, 0],
    outlinePoints: rearAttachment3DPts,
  });

  const attachLabel =
    attachMode === 'one-piece-back'
      ? '1-piece continuous back spine'
      : attachMode === 'side-arch-tabs'
      ? '1-piece back + side arch tabs'
      : 'finger-jointed to back wall';

  return {
    panels2D,
    panels3D,
    fingerCountSummary: `Living Hinge (${attachLabel}, R=${fmt(bendRadius)}mm curve, ${hingePatternInfo(params.livingHingePattern).name.toLowerCase()} kerf at ${fmt(params.livingHingePitchMm)}mm)`,
  };
}

function circleSvgPath(cx: number, cy: number, r: number): string {
  return `M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} Z`;
}
