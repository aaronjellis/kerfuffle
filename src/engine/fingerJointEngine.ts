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
  const outerDims: BoxDims = {
    widthMm: innerW + 2 * T,
    depthMm: innerD + 2 * T,
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
    fingerCountSummary: `${countW} (W) × ${countD} (D) × ${countH} (H) symmetric odd fingers`,
    outerDims,
  };
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
  const countBaseH = computeOddFingerCount(baseH, params.fingerWidthMm);
  const countLidH = computeOddFingerCount(lidH, params.fingerWidthMm);
  const countHingeW = computeOddFingerCount(innerW, params.hingeFingerWidthMm || params.fingerWidthMm);

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

  // Helper to generate optional brass butt-hinge pilot screw holes along the flat rear seam
  const buildHardwareHingeHoles = (
    panelId: string,
    yHoleMm: number
  ): { paths: DielinePath[]; holes3D: Point2D[][] } => {
    const paths: DielinePath[] = [];
    const holes3D: Point2D[][] = [];
    if (params.clamshellHingeType !== 'butt-hardware' || !params.includeHingeScrewHoles) {
      return { paths, holes3D };
    }
    const r = Math.max(0.6, (params.hingePinDiameterMm || 2.0) / 2);
    // Two standard butt hinges positioned at 22% and 78% across the back wall width, each with 2 screw holes
    const hingeCentersX = [T + innerW * 0.22, T + innerW * 0.78];
    const holeSpacing = Math.min(12, Math.max(6, innerW * 0.08));
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
  const baseYCenter = -innerH / 2 + baseH / 2;
  for (const side of ['front', 'back'] as const) {
    const isFront = side === 'front';
    const topMode: EdgeJointMode =
      !isFront && params.clamshellHingeType === 'knuckle-pin' ? 'even-tabs' : 'flat-inner';
    const baseHingeHoles = !isFront
      ? buildHardwareHingeHoles('base-back', T + 5.0)
      : { paths: [], holes3D: [] };
    const res = specToPanel2D({
      id: `base-${side}`,
      name: isFront ? 'Base Front Wall' : 'Base Back Wall (Hinged)',
      faceLabel: isFront ? 'BASE FRONT' : 'BASE BACK',
      innerW,
      innerH: baseH,
      thickness: T,
      kerf,
      countX: countW,
      topCountX: !isFront && params.clamshellHingeType === 'knuckle-pin' ? countHingeW : countW,
      countY: countBaseH,
      topEdge: topMode,
      rightEdge: 'even-tabs',
      bottomEdge: 'even-tabs',
      leftEdge: 'even-tabs',
      ownCorners: true,
      extraPaths: baseHingeHoles.paths,
    });
    panels2D.push(res.panel2D);
    const zSign = isFront ? 1 : -1;
    panels3D.push({
      id: `base-${side}`,
      name: res.panel2D.name,
      faceId: side,
      widthMm: innerW + 2 * T,
      heightMm: baseH + 2 * T,
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
    if (params.clamshellHingeType === 'side-pivot') {
      const r = params.hingePinDiameterMm / 2;
      const cx = isRight ? T + innerD - T * 1.5 : T + T * 1.5;
      const cy = T + T * 1.5;
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
      innerH: baseH,
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
      heightMm: baseH + 2 * T,
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
  const seamY = -innerH / 2 + baseH;
  const lidYCenter = seamY + lidH / 2;
  const hingePivot: [number, number, number] = [0, seamY, -innerD / 2 - T / 2];

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
    const botMode: EdgeJointMode =
      !isFront && params.clamshellHingeType === 'knuckle-pin' ? 'odd-tabs' : 'flat-inner';
    // In 2D shifted coordinates for Lid Back, topEdge has tabs (height T) + lidH, so bottom flat seam is at y = T + lidH
    const lidHingeHoles = !isFront
      ? buildHardwareHingeHoles('lid-back', T + lidH - 5.0)
      : { paths: [], holes3D: [] };
    const res = specToPanel2D({
      id: `lid-${side}`,
      name: isFront ? 'Lid Front Lip' : 'Lid Back Wall (Hinge)',
      faceLabel: isFront ? 'LID FRONT' : 'LID BACK',
      innerW,
      innerH: lidH,
      thickness: T,
      kerf,
      countX: countW,
      bottomCountX: !isFront && params.clamshellHingeType === 'knuckle-pin' ? countHingeW : countW,
      countY: countLidH,
      topEdge: 'even-tabs',
      rightEdge: 'even-tabs',
      bottomEdge: botMode,
      leftEdge: 'even-tabs',
      ownCorners: true,
      extraPaths: lidHingeHoles.paths,
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
    if (params.clamshellHingeType === 'side-pivot') {
      const r = params.hingePinDiameterMm / 2;
      const cx = isRight ? T + innerD - T * 1.5 : T + T * 1.5;
      const cy = T + lidH - T * 1.5;
      extraPaths.push({
        id: `lid-${side}-pivot-hole`,
        layer: 'cut',
        d: circleSvgPath(cx, cy, r),
        closed: true,
      });
      holes3D.push(circlePts(cx, cy, r));
    }
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
    closedPos: [0, seamY, innerD / 2 + T + 0.6],
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

  return {
    panels2D,
    panels3D,
    fingerCountSummary: `Clamshell (${params.clamshellHingeType}): ${countW}×${countD} base + hinged lid`,
  };
}

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
  const hasSideArchTabs = attachMode === 'side-arch-tabs';

  // Radius of the curved top shoulders (clamped so straight lower wall is at least 15mm and top flat deck is at least 16mm)
  const bendRadius = Math.max(
    10,
    Math.min(innerH * 0.42, innerD * 0.35, innerH - 15)
  );
  const straightH = Math.max(15, innerH - bendRadius);
  const topFlatD = Math.max(10, innerD - 2 * bendRadius);
  const arcLength = (Math.PI * bendRadius) / 2; // 90-degree curved shoulder arc length
  const frontLipH = Math.min(14, straightH * 0.38);
  const catchW = Math.min(24, Math.max(10, innerW * 0.24));
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

  // 2. LOWER FRONT WALL (with horizontal Catch Slot that receives the Living-Hinge Lid's front catch tab!)
  //    & LOWER BACK WALL (separate with interlocking top fingers when 'finger-joint-back', or integrated into 1-piece wrap when 'one-piece-back')
  const lowerWallYCenter = -innerH / 2 + straightH / 2;
  const catchSlotY = T + Math.max(3.5, frontLipH - T * 1.2);
  const catchSlotPts: Point2D[] = [
    { x: T + innerW / 2 - catchW / 2, y: catchSlotY },
    { x: T + innerW / 2 + catchW / 2, y: catchSlotY },
    { x: T + innerW / 2 + catchW / 2, y: catchSlotY + T },
    { x: T + innerW / 2 - catchW / 2, y: catchSlotY + T },
  ];

  const frontRes = specToPanel2D({
    id: 'front',
    name: 'Lower Front Wall (With Lid Catch Slot)',
    faceLabel: 'LOWER FRONT',
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
    extraPaths: [
      {
        id: 'front-lid-catch-slot',
        layer: 'cut',
        d: pointsToSvgPath(catchSlotPts, true),
        closed: true,
      },
    ],
    holeContours: [catchSlotPts],
  });
  panels2D.push(frontRes.panel2D);
  panels3D.push({
    id: 'front',
    name: frontRes.panel2D.name,
    faceId: 'front',
    widthMm: innerW + 2 * T,
    heightMm: straightH + 2 * T,
    thicknessMm: T,
    color: '#dfc195',
    closedPos: [0, lowerWallYCenter, innerD / 2 + T / 2],
    explodedPos: [0, lowerWallYCenter, innerD / 2 + T / 2 + explodeDist],
    rotation: [0, 0, 0],
    outlinePoints: frontRes.outlinePoints,
    holeContours: [catchSlotPts],
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
    const rawLowerPts = buildFingerPanelPolygon(baseSpec);

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

    const restLowerPts = rawLowerPts.slice(2).map((p) => ({
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
  const zone1Start = T + frontLipH;
  const zone1End = zone1Start + arcLength;
  const zone2Start = zone1End + topFlatD;
  const zone2End = zone2Start + arcLength;

  const pitch = Math.max(1.8, params.livingHingePitchMm);
  const extraWrapPaths: DielinePath[] = [];
  const wFull = innerW + 2 * T;
  const bridge = 3.5;

  const addLivingHingeZone = (yStart: number, yEnd: number, prefix: string) => {
    let row = 0;
    for (let y = yStart; y <= yEnd; y += pitch) {
      if (row % 2 === 0) {
        const mid = wFull / 2;
        extraWrapPaths.push({
          id: `${prefix}-r${row}-a`,
          layer: 'cut',
          d: `M ${fmt(3)} ${fmt(y)} L ${fmt(mid - bridge / 2)} ${fmt(y)}`,
          closed: false,
        });
        extraWrapPaths.push({
          id: `${prefix}-r${row}-b`,
          layer: 'cut',
          d: `M ${fmt(mid + bridge / 2)} ${fmt(y)} L ${fmt(wFull - 3)} ${fmt(y)}`,
          closed: false,
        });
      } else {
        const third = wFull / 3;
        extraWrapPaths.push({
          id: `${prefix}-r${row}-c`,
          layer: 'cut',
          d: `M 0 ${fmt(y)} L ${fmt(third - bridge)} ${fmt(y)}`,
          closed: false,
        });
        extraWrapPaths.push({
          id: `${prefix}-r${row}-d`,
          layer: 'cut',
          d: `M ${fmt(third)} ${fmt(y)} L ${fmt(2 * third)} ${fmt(y)}`,
          closed: false,
        });
        extraWrapPaths.push({
          id: `${prefix}-r${row}-e`,
          layer: 'cut',
          d: `M ${fmt(2 * third + bridge)} ${fmt(y)} L ${fmt(wFull)} ${fmt(y)}`,
          closed: false,
        });
      }
      row++;
    }
  };

  addLivingHingeZone(zone1Start, zone1End, 'lh-z1');
  addLivingHingeZone(zone2Start, zone2End, 'lh-z2');

  // If `hasSideArchTabs`, add the two mating retainer slots in the flat top deck (`zone1End .. zone2Start`)
  // aligned with the Left Wall (x = 0..T) and Right Wall (x = wFull - T .. wFull)
  if (hasSideArchTabs) {
    const slotMidY = (zone1End + zone2Start) / 2;
    const sY0 = slotMidY - sideTabW / 2;
    const sY1 = slotMidY + sideTabW / 2;
    extraWrapPaths.push({
      id: 'lh-top-side-slot-l',
      layer: 'cut',
      d: `M ${fmt(0.4)} ${fmt(sY0)} L ${fmt(T)} ${fmt(sY0)} L ${fmt(T)} ${fmt(sY1)} L ${fmt(0.4)} ${fmt(sY1)} Z`,
      closed: true,
    });
    extraWrapPaths.push({
      id: 'lh-top-side-slot-r',
      layer: 'cut',
      d: `M ${fmt(wFull - T)} ${fmt(sY0)} L ${fmt(wFull - 0.4)} ${fmt(sY0)} L ${fmt(wFull - 0.4)} ${fmt(sY1)} L ${fmt(wFull - T)} ${fmt(sY1)} Z`,
      closed: true,
    });
  }

  // Build the orthogonal outer perimeter of the Living-Hinge Wrap Lid (including its Back-Wall attachment!)
  const topCatchHeaderPts: Point2D[] = [
    { x: 0, y: zone2End },
    { x: 0, y: T },
    { x: wFull / 2 - catchW / 2, y: T },
    { x: wFull / 2 - catchW / 2, y: 0 },
    { x: wFull / 2 + catchW / 2, y: 0 },
    { x: wFull / 2 + catchW / 2, y: T },
    { x: wFull, y: T },
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

  panels2D.push({
    id: 'top',
    name: isOnePieceBack
      ? '1-Piece Back Wall + Living-Hinge Wrap Lid'
      : 'Living-Hinge Wrap Lid (Finger-Jointed to Back Wall)',
    faceLabel: isOnePieceBack ? '1-PIECE BACK + LIVING HINGE LID' : 'LIVING HINGE WRAP LID',
    widthMm: wFull,
    heightMm: wrapTotalH,
    safeRect: { x: T, y: zone1End, width: innerW, height: topFlatD },
    sheetX: 0,
    sheetY: 0,
    paths: [
      {
        id: 'living-wrap-outline',
        layer: 'cut',
        d: pointsToSvgPath(wrapOutlinePts, true),
        closed: true,
      },
      ...extraWrapPaths,
    ],
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
    fingerCountSummary: `Living Hinge (${attachLabel}, R=${fmt(bendRadius)}mm curve, ${pitch}mm kerf pitch)`,
  };
}

function circleSvgPath(cx: number, cy: number, r: number): string {
  return `M ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} Z`;
}
