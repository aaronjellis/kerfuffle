/**
 * Cardboard score-and-fold templates: the retail tuck carton and the telescoping tray and lid,
 * plus the shared score-line helper and the template dispatcher.
 *
 * The roll-end mailer lives in `mailerEngine.ts` (ply model, 2D sheet and 3D rig).
 */
import {
  BoxDims,
  BoxPanel2D,
  BoxParameters,
  DielinePath,
  Panel3DTransform,
  Point2D,
} from './types';
import { fmt } from './fingerJointEngine';
import { generateMailerBox } from './mailerEngine';

/**
 * Converts a straight score segment (x1,y1)->(x2,y2) into either a single score path
 * or a series of perforated cut-gap-cut segments when scoreLineMode === 'dashed-perf'.
 */
export function buildScoreLinePaths(
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  params: BoxParameters
): DielinePath[] {
  if (params.scoreLineMode === 'solid-score') {
    return [
      {
        id,
        layer: 'score',
        d: `M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)}`,
        closed: false,
        isFoldScore: true,
      },
    ];
  }

  const totalLen = Math.hypot(x2 - x1, y2 - y1);
  if (totalLen < 1e-3) return [];
  const cutLen = Math.max(1.0, params.perfCutMm);
  const gapLen = Math.max(0.8, params.perfGapMm);
  const ux = (x2 - x1) / totalLen;
  const uy = (y2 - y1) / totalLen;

  const subCommands: string[] = [];
  let dist = gapLen * 0.5;
  while (dist < totalLen - gapLen * 0.5) {
    const segEnd = Math.min(dist + cutLen, totalLen - gapLen * 0.5);
    if (segEnd > dist) {
      const sx = x1 + ux * dist;
      const sy = y1 + uy * dist;
      const ex = x1 + ux * segEnd;
      const ey = y1 + uy * segEnd;
      subCommands.push(`M ${fmt(sx)} ${fmt(sy)} L ${fmt(ex)} ${fmt(ey)}`);
    }
    dist += cutLen + gapLen;
  }

  return [
    {
      id,
      layer: 'score',
      d: subCommands.join(' '),
      closed: false,
      isFoldScore: true,
    },
  ];
}

export function generateCardboardBox(
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
  if (params.templateId === 'cardboard-tuck-carton') {
    return generateTuckCarton(params, innerW, innerD, innerH);
  }
  if (params.templateId === 'cardboard-telescope') {
    return generateTelescopingBox(params, innerW, innerD, innerH);
  }
  return generateMailerBox(params, innerW, innerD, innerH);
}

/**
 * 2. Standard Retail Folding Carton (Reverse Tuck End / Straight Tuck End)
 */
function generateTuckCarton(
  params: BoxParameters,
  W: number,
  D: number,
  H: number
): {
  panels2D: BoxPanel2D[];
  panels3D: Panel3DTransform[];
  summary: string;
  outerDims: BoxDims;
} {
  const T = params.materialThicknessMm;
  const glueW = Math.max(10, params.glueFlapMm);
  // Ply model: the typed size is the clear inside, and the board builds outward around it.
  // - Walls straddle their creases, so a wall's crease-to-crease span is inner + T.
  // - At each end the dust flaps fold in first and the lid closes over them. The dust flaps' inner
  //   faces sit at the typed height, the lid one ply above them. So the side walls run H + T between
  //   their dust creases, the front and back H + 3T between their lid creases, and each dust crease
  //   sits one ply inside the lid crease.
  // - Each lid runs D between its creases, which puts its tuck one ply inside the far wall.
  // - The glue flap lies one ply inside the back, so the glue-side wall runs D, not D + T.
  // - Dust flaps stand clear of the wall creases by half a ply to the wall's inner face, the tuck's
  //   ply, and 0.5 mm of play, so a tuck slides down past them.
  const dSpan = D + T;
  const wSpan = W + T;
  const hSpan = H + 3 * T;
  // A straight tuck puts both tucks inside the front wall; each stops 1 mm short of the middle.
  const tuckCap = params.tuckCartonStyle === 'straight-tuck' ? hSpan / 2 - 1 : Infinity;
  const tuckH = Math.min(Math.max(12, params.tuckFlapMm), Math.max(8, tuckCap));
  const dustH = Math.min(D * 0.75, W * 0.45);
  const dustRoom = 1.5 * T + 0.5;
  const tuckInset = Math.max(0.8, T);

  const x0 = 0;
  const x1 = x0 + glueW;
  const x2 = x1 + D;
  const x3 = x2 + wSpan;
  const x4 = x3 + dSpan;
  const x5 = x4 + wSpan;

  const y0 = 0;
  const y1 = y0 + tuckH;
  const y2 = y1 + D;
  const y3 = y2 + hSpan;
  const y4 = y3 + D;
  const y5 = y4 + tuckH;
  // Dust flap creases, one ply inside the lid creases.
  const yTd = y2 + T;
  const yBd = y3 - T;

  const isReverse = params.tuckCartonStyle === 'reverse-tuck';
  const botStartX = isReverse ? x2 : x4;
  const botEndX = isReverse ? x3 : x5;

  const paths: DielinePath[] = [];
  // The glue flap's tapered ends start below the dust creases.
  const taper = Math.min(12, Math.max(H * 0.18, T + 1));

  // A dust flap stands dustRoom in from its wall's creases and leans in 2 mm more at its tip. The cut
  // runs along the dust crease line out to the wall creases, then up the shared edge to the lid
  // crease's level, freeing the flap from the taller front and back.
  const topDust = (xa: number, xb: number) => [
    `L ${fmt(xa)} ${fmt(yTd)}`,
    `L ${fmt(xa + dustRoom)} ${fmt(yTd)}`,
    `L ${fmt(xa + dustRoom + 2)} ${fmt(yTd - dustH)}`,
    `L ${fmt(xb - dustRoom - 2)} ${fmt(yTd - dustH)}`,
    `L ${fmt(xb - dustRoom)} ${fmt(yTd)}`,
    `L ${fmt(xb)} ${fmt(yTd)}`,
    `L ${fmt(xb)} ${fmt(y2)}`,
  ];
  const botDust = (xa: number, xb: number) => [
    `L ${fmt(xb)} ${fmt(yBd)}`,
    `L ${fmt(xb - dustRoom)} ${fmt(yBd)}`,
    `L ${fmt(xb - dustRoom - 2)} ${fmt(yBd + dustH)}`,
    `L ${fmt(xa + dustRoom + 2)} ${fmt(yBd + dustH)}`,
    `L ${fmt(xa + dustRoom)} ${fmt(yBd)}`,
    `L ${fmt(xa)} ${fmt(yBd)}`,
    `L ${fmt(xa)} ${fmt(y3)}`,
  ];
  // The bottom lid and its tuck, traced right to left.
  const botLid = (xa: number, xb: number) => [
    `L ${fmt(xb)} ${fmt(y4)}`,
    `L ${fmt(xb - tuckInset)} ${fmt(y4)}`,
    `Q ${fmt(xb - tuckInset)} ${fmt(y5)} ${fmt(xb - tuckInset - 10)} ${fmt(y5)}`,
    `L ${fmt(xa + tuckInset + 10)} ${fmt(y5)}`,
    `Q ${fmt(xa + tuckInset)} ${fmt(y5)} ${fmt(xa + tuckInset)} ${fmt(y4)}`,
    `L ${fmt(xa)} ${fmt(y4)}`,
    `L ${fmt(xa)} ${fmt(y3)}`,
  ];

  const bodyPerimeter = [
    `M ${fmt(x1)} ${fmt(yTd)}`,
    ...topDust(x1, x2),
    `L ${fmt(x3)} ${fmt(y2)}`, // the front's top edge: the top lid hangs off the back
    ...topDust(x3, x4),
    `L ${fmt(x4)} ${fmt(y1)}`,
    `L ${fmt(x4 + tuckInset)} ${fmt(y1)}`,
    `Q ${fmt(x4 + tuckInset)} ${fmt(y0)} ${fmt(x4 + tuckInset + 10)} ${fmt(y0)}`,
    `L ${fmt(x5 - tuckInset - 10)} ${fmt(y0)}`,
    `Q ${fmt(x5 - tuckInset)} ${fmt(y0)} ${fmt(x5 - tuckInset)} ${fmt(y1)}`,
    `L ${fmt(x5)} ${fmt(y1)}`,
    ...(isReverse
      ? [`L ${fmt(x5)} ${fmt(y3)}`, `L ${fmt(x4)} ${fmt(y3)}`, ...botDust(x3, x4), ...botLid(x2, x3)]
      : [`L ${fmt(x5)} ${fmt(y3)}`, ...botLid(x4, x5), ...botDust(x3, x4), `L ${fmt(x2)} ${fmt(y3)}`]),
    // The glue side has no tall wall to free the flap from: it ends on the dust crease.
    ...botDust(x1, x2).slice(0, -1),
    `L ${fmt(x0)} ${fmt(y3 - taper)}`,
    `L ${fmt(x0)} ${fmt(y2 + taper)}`,
    'Z',
  ].join(' ');

  paths.push({
    id: 'carton-perimeter-cut',
    layer: 'cut',
    d: bodyPerimeter,
    closed: true,
  });

  const slitLen = Math.min(14, W * 0.18);
  paths.push(
    {
      id: 'carton-top-lock-slit-l',
      layer: 'cut',
      d: `M ${fmt(x4 + tuckInset)} ${fmt(y1)} L ${fmt(x4 + tuckInset + slitLen)} ${fmt(y1)}`,
      closed: false,
    },
    {
      id: 'carton-top-lock-slit-r',
      layer: 'cut',
      d: `M ${fmt(x5 - tuckInset - slitLen)} ${fmt(y1)} L ${fmt(x5 - tuckInset)} ${fmt(y1)}`,
      closed: false,
    },
    {
      id: 'carton-bot-lock-slit-l',
      layer: 'cut',
      d: `M ${fmt(botStartX + tuckInset)} ${fmt(y4)} L ${fmt(botStartX + tuckInset + slitLen)} ${fmt(y4)}`,
      closed: false,
    },
    {
      id: 'carton-bot-lock-slit-r',
      layer: 'cut',
      d: `M ${fmt(botEndX - tuckInset - slitLen)} ${fmt(y4)} L ${fmt(botEndX - tuckInset)} ${fmt(y4)}`,
      closed: false,
    }
  );

  // Only edges that fold get a score. The wall creases run the side walls' height; above and below
  // it are the dust slits.
  const scores: [string, number, number, number, number][] = [
    ['score-glue', x1, yTd, x1, yBd],
    ['score-l-f', x2, yTd, x2, yBd],
    ['score-f-r', x3, yTd, x3, yBd],
    ['score-r-b', x4, yTd, x4, yBd],
    ['score-top-dust-l', x1 + dustRoom, yTd, x2 - dustRoom, yTd],
    ['score-top-dust-r', x3 + dustRoom, yTd, x4 - dustRoom, yTd],
    ['score-top-lid', x4, y2, x5, y2],
    ['score-bot-dust-l', x1 + dustRoom, yBd, x2 - dustRoom, yBd],
    ['score-bot-dust-r', x3 + dustRoom, yBd, x4 - dustRoom, yBd],
    ['score-bot-lid', botStartX, y3, botEndX, y3],
    ['score-top-tuck', x4 + tuckInset + slitLen, y1, x5 - tuckInset - slitLen, y1],
    ['score-bot-tuck', botStartX + tuckInset + slitLen, y4, botEndX - tuckInset - slitLen, y4],
  ];

  for (const [id, sx1, sy1, sx2, sy2] of scores) {
    paths.push(...buildScoreLinePaths(id, sx1, sy1, sx2, sy2, params));
  }

  const panel2D: BoxPanel2D = {
    id: 'tuck-carton-sheet',
    name: `Folding Carton (${isReverse ? 'Reverse Tuck RTE' : 'Straight Tuck STE'})`,
    faceLabel: 'Carton dieline',
    widthMm: x5,
    heightMm: y5,
    safeRect: { x: x2 + T / 2, y: y2 + T / 2, width: W, height: H + 2 * T },
    sheetX: 0,
    sheetY: 0,
    paths,
    subFaces: [
      { id: 'front', name: 'Front Face', x: x2 + T / 2, y: y2 + T / 2, width: W, height: H + 2 * T },
      { id: 'back', name: 'Back Face', x: x4 + T / 2, y: y2 + T / 2, width: W, height: H + 2 * T },
      { id: 'left', name: 'Left Side', x: x1 + T / 2, y: yTd + T / 2, width: D - T, height: H },
      { id: 'right', name: 'Right Side', x: x3 + T / 2, y: yTd + T / 2, width: D, height: H },
      { id: 'top', name: 'Top Lid', x: x4 + T / 2, y: y1, width: W, height: D },
      { id: 'bottom', name: 'Bottom Closure', x: botStartX + T / 2, y: y3, width: W, height: D },
    ],
  };

  // Dedicated 3D Folding Rig for the Retail Tuck-End Carton (RTE / STE):
  // - Root `back` rotates onto the horizontal floor plane (Y = -H / 2) at progress = 0 so the entire blank unfolds flat on the table!
  // - Non-overlapping sequential fold stages avoid any cross-axis skew:
  //   Stage 1 [0.00..0.20]: Root `back` lifts from flat table (Y = -H/2) to vertical (Z = -D/2)
  //   Stage 2 [0.20..0.52]: Side walls (`left`, `right`), `front`, and `glue-flap` wrap around Y to form the carton tube
  //   Stage 3 [0.52..0.72]: Top & Bottom side dust flaps (`top-dust-l/r`, `bot-dust-l/r`) fold inward around Z
  //   Stage 4 [0.68..0.86]: Top & Bottom closure lids (`top`, `bottom`) fold closed around X
  //   Stage 5 [0.84..1.00]: Top & Bottom rounded tuck flaps (`top-tuck`, `bot-tuck`) tuck inside around X
  const cBody = T < 1.0 ? '#e6dec8' : '#d2a87a';
  const cSide = T < 1.0 ? '#d8ceb4' : '#bf9466';
  const cFlap = T < 1.0 ? '#eee7d3' : '#dbb386';
  const cTuck = T < 1.0 ? '#cfc3a6' : '#b5895a';
  // Same width the sheet cuts for the tuck flap: the wall span less a tuckInset on each side.
  const tuckW = wSpan - 2 * tuckInset;
  const rTuckCorner = Math.min(8, tuckH * 0.45);
  const roundedTuckOutline: Point2D[] = [
    { x: 0, y: 0 },
    { x: tuckW, y: 0 },
    { x: tuckW, y: tuckH - rTuckCorner },
    { x: tuckW - rTuckCorner, y: tuckH },
    { x: rTuckCorner, y: tuckH },
    { x: 0, y: tuckH - rTuckCorner },
  ];

  // Walls straddle their creases: a single-ply wall centres half a ply outside the inner face,
  // so the rig runs on W + T and D + T and the clear distance between opposite walls is W and D.
  // W and D are the wall spans here. The dust flaps' inner faces sit at the typed height, so their
  // mid-plane is half a ply above it and the lid's a ply above that; each lid is D − T (the inner
  // depth) long between its creases. The left wall runs from the front's crease to the glue crease,
  // which sits on the glue flap's plane one ply inside the back: D − T long, centred T/2 forward.
  const yLid = (H + 3 * T) / 2;
  const yDust = (H + T) / 2;
  const carton3D = ((W: number, D: number): Panel3DTransform[] => [
    {
      id: 'back',
      name: 'Back Face',
      faceId: 'back',
      widthMm: W,
      heightMm: H + 3 * T,
      thicknessMm: T,
      color: cBody,
      closedPos: [0, 0, -D / 2],
      explodedPos: [0, 0, -D / 2],
      rotation: [0, Math.PI, 0],
      foldRig: {
        pivotOffset: [0, -yLid, -D / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.0, 0.20],
      },
    },
    {
      id: 'right',
      name: 'Right Side Wall',
      faceId: 'right',
      widthMm: D,
      heightMm: H + T,
      thicknessMm: T,
      color: cSide,
      closedPos: [W / 2, 0, 0],
      explodedPos: [W / 2 + D / 2, 0, -D / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.20, 0.45],
      },
    },
    {
      id: 'front',
      name: 'Front Face',
      faceId: 'front',
      widthMm: W,
      heightMm: H + 3 * T,
      thicknessMm: T,
      color: cBody,
      closedPos: [0, 0, D / 2],
      explodedPos: [W + D, 0, -D / 2],
      rotation: [0, 0, 0],
      foldRig: {
        parentId: 'right',
        pivotOffset: [W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.25, 0.52],
      },
    },
    {
      id: 'left',
      name: 'Left Side Wall',
      faceId: 'left',
      widthMm: D - T,
      heightMm: H + T,
      thicknessMm: T,
      color: cSide,
      closedPos: [-W / 2, 0, T / 2],
      explodedPos: [-W / 2 - D / 2, 0, -D / 2],
      rotation: [0, -Math.PI / 2, 0],
      // Hinged on the front, as on the sheet (glue | left | front | right | back).
      foldRig: {
        parentId: 'front',
        pivotOffset: [-W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.30, 0.55],
      },
    },
    {
      id: 'glue-flap',
      name: 'Side Seam Glue Flap',
      faceId: 'left',
      widthMm: glueW,
      heightMm: Math.max(10, hSpan - 2 * taper),
      thicknessMm: T,
      color: cTuck,
      // It closes the tube on the back's free edge, glued one ply inside the back wall.
      closedPos: [-W / 2 + glueW / 2, 0, -D / 2 + T],
      explodedPos: [-W / 2 - D - glueW / 2, 0, -D / 2],
      rotation: [0, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, 0, -D / 2 + T],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.22, 0.42],
      },
    },
    // Top Left & Right Dust Flaps
    {
      id: 'top-dust-l',
      name: 'Top Left Dust Flap',
      faceId: 'left',
      widthMm: dustH,
      heightMm: D - T - 2 * dustRoom,
      thicknessMm: T,
      color: cTuck,
      closedPos: [-W / 2 + dustH / 2, yDust, T / 2],
      explodedPos: [-W / 2 - D / 2, H / 2 + dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, yDust, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.52, 0.72],
      },
    },
    {
      id: 'top-dust-r',
      name: 'Top Right Dust Flap',
      faceId: 'right',
      widthMm: dustH,
      heightMm: D - 2 * dustRoom,
      thicknessMm: T,
      color: cTuck,
      closedPos: [W / 2 - dustH / 2, yDust, 0],
      explodedPos: [W / 2 + D / 2, H / 2 + dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'right',
        pivotOffset: [W / 2, yDust, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.52, 0.72],
      },
    },
    // Top Lid (hinged from Back Face) + Top Tuck Flap
    {
      id: 'top',
      name: 'Top Closure Lid',
      faceId: 'top',
      widthMm: W,
      heightMm: D - T,
      thicknessMm: T,
      color: cFlap,
      closedPos: [0, yLid, -T / 2],
      explodedPos: [0, H / 2 + D / 2, -D / 2],
      rotation: [-Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [0, yLid, -D / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.68, 0.86],
      },
    },
    {
      id: 'top-tuck',
      name: 'Top Tuck Flap',
      faceId: 'top',
      widthMm: tuckW,
      heightMm: tuckH,
      thicknessMm: T,
      color: cTuck,
      closedPos: [0, yLid - tuckH / 2, D / 2 - T],
      explodedPos: [0, H / 2 + D + tuckH / 2, -D / 2],
      rotation: [0, 0, 0],
      outlinePoints: roundedTuckOutline,
      foldRig: {
        parentId: 'top',
        pivotOffset: [0, yLid, D / 2 - T],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.84, 1.0],
      },
    },
    // Bottom Left & Right Dust Flaps
    {
      id: 'bot-dust-l',
      name: 'Bottom Left Dust Flap',
      faceId: 'left',
      widthMm: dustH,
      heightMm: D - T - 2 * dustRoom,
      thicknessMm: T,
      color: cTuck,
      closedPos: [-W / 2 + dustH / 2, -yDust, T / 2],
      explodedPos: [-W / 2 - D / 2, -H / 2 - dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, -yDust, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.52, 0.72],
      },
    },
    {
      id: 'bot-dust-r',
      name: 'Bottom Right Dust Flap',
      faceId: 'right',
      widthMm: dustH,
      heightMm: D - 2 * dustRoom,
      thicknessMm: T,
      color: cTuck,
      closedPos: [W / 2 - dustH / 2, -yDust, 0],
      explodedPos: [W / 2 + D / 2, -H / 2 - dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'right',
        pivotOffset: [W / 2, -yDust, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.52, 0.72],
      },
    },
    // Bottom Closure Lid + Bottom Tuck Flap (switches between Front-hinged for Reverse Tuck RTE vs Back-hinged for Straight Tuck STE!)
    ...(isReverse
      ? ([
          {
            id: 'bottom',
            name: 'Bottom Closure Lid (Reverse Tuck — Hinged on Front)',
            faceId: 'bottom',
            widthMm: W,
            heightMm: D - T,
            thicknessMm: T,
            color: cFlap,
            closedPos: [0, -yLid, T / 2],
            explodedPos: [0, -H / 2 - D / 2, D / 2],
            rotation: [Math.PI / 2, 0, 0],
            foldRig: {
              parentId: 'front',
              pivotOffset: [0, -yLid, D / 2],
              axis: 'x',
              flatAngleRad: -Math.PI / 2,
              foldedAngleRad: 0,
              stage: [0.68, 0.86],
            },
          },
          {
            id: 'bot-tuck',
            name: 'Bottom Tuck Flap (Reverse Tuck)',
            faceId: 'bottom',
            widthMm: tuckW,
            heightMm: tuckH,
            thicknessMm: T,
            color: cTuck,
            closedPos: [0, -yLid + tuckH / 2, -D / 2 + T],
            explodedPos: [0, -H / 2 - D - tuckH / 2, D / 2],
            rotation: [Math.PI, 0, 0],
            outlinePoints: roundedTuckOutline,
            foldRig: {
              parentId: 'bottom',
              pivotOffset: [0, -yLid, -D / 2 + T],
              axis: 'x',
              flatAngleRad: -Math.PI / 2,
              foldedAngleRad: 0,
              stage: [0.84, 1.0],
            },
          },
        ] as Panel3DTransform[])
      : ([
          {
            id: 'bottom',
            name: 'Bottom Closure Lid (Straight Tuck — Hinged on Back)',
            faceId: 'bottom',
            widthMm: W,
            heightMm: D - T,
            thicknessMm: T,
            color: cFlap,
            closedPos: [0, -yLid, -T / 2],
            explodedPos: [0, -H / 2 - D / 2, -D / 2],
            rotation: [Math.PI / 2, 0, 0],
            foldRig: {
              parentId: 'back',
              pivotOffset: [0, -yLid, -D / 2],
              axis: 'x',
              flatAngleRad: Math.PI / 2,
              foldedAngleRad: 0,
              stage: [0.68, 0.86],
            },
          },
          {
            id: 'bot-tuck',
            name: 'Bottom Tuck Flap (Straight Tuck)',
            faceId: 'bottom',
            widthMm: tuckW,
            heightMm: tuckH,
            thicknessMm: T,
            color: cTuck,
            closedPos: [0, -yLid + tuckH / 2, D / 2 - T],
            explodedPos: [0, -H / 2 - D - tuckH / 2, -D / 2],
            rotation: [Math.PI, 0, 0],
            outlinePoints: roundedTuckOutline,
            foldRig: {
              parentId: 'bottom',
              pivotOffset: [0, -yLid, D / 2 - T],
              axis: 'x',
              flatAngleRad: Math.PI / 2,
              foldedAngleRad: 0,
              stage: [0.84, 1.0],
            },
          },
        ] as Panel3DTransform[])),
  ])(W + T, D + T);

  return {
    panels2D: [panel2D],
    panels3D: carton3D,
    summary: `${isReverse ? 'Reverse' : 'Straight'} Tuck Carton (${fmt(x5)} × ${fmt(y5)} mm flat blank)`,
    // Spans are mid-plane to mid-plane; each outside face adds half a ply.
    outerDims: { widthMm: wSpan + T, depthMm: dSpan + T, heightMm: hSpan + T },
  };
}

/**
 * 3. Two-Piece Telescoping Tray & Lid Box (Shoebox / Board Game Box)
 */
function generateTelescopingBox(
  params: BoxParameters,
  W: number,
  D: number,
  H: number
): {
  panels2D: BoxPanel2D[];
  panels3D: Panel3DTransform[];
  summary: string;
  outerDims: BoxDims;
} {
  const T = params.materialThicknessMm;
  const clearance = params.telescopeClearanceMm;
  const lidH = Math.min(H, Math.max(15, params.lidHeightMm));

  const buildTrayBlank = (
    id: string,
    name: string,
    faceLabel: string,
    trayW: number,
    trayD: number,
    trayH: number
  ): BoxPanel2D => {
    // Single-ply walls straddle their creases, so score-to-score floor spans are inner + T; corner glue tabs step out by T
    const wSpan = trayW + T;
    const dSpan = trayD + T;
    const hSpan = trayH + T;
    const totalW = wSpan + 2 * hSpan;
    const totalH = dSpan + 2 * hSpan;
    const x1 = hSpan;
    const x2 = hSpan + wSpan;
    const y1 = hSpan;
    const y2 = hSpan + dSpan;
    const tabW = Math.min(22, trayH * 0.75);

    const outlineD = [
      `M ${fmt(x1 - T - tabW)} ${fmt(y1 - 2)}`,
      `L ${fmt(x1 - T)} 0`,
      `L ${fmt(x2 + T)} 0`,
      `L ${fmt(x2 + T + tabW)} ${fmt(y1 - 2)}`,
      `L ${fmt(x2 + T)} ${fmt(y1)}`,
      `L ${fmt(totalW)} ${fmt(y1)}`,
      `L ${fmt(totalW)} ${fmt(y2)}`,
      `L ${fmt(x2 + T)} ${fmt(y2)}`,
      `L ${fmt(x2 + T + tabW)} ${fmt(y2 + 2)}`,
      `L ${fmt(x2 + T)} ${fmt(totalH)}`,
      `L ${fmt(x1 - T)} ${fmt(totalH)}`,
      `L ${fmt(x1 - T - tabW)} ${fmt(y2 + 2)}`,
      `L ${fmt(x1 - T)} ${fmt(y2)}`,
      `L 0 ${fmt(y2)}`,
      `L 0 ${fmt(y1)}`,
      `L ${fmt(x1 - T)} ${fmt(y1)}`,
      'Z',
    ].join(' ');

    const paths: DielinePath[] = [
      { id: `${id}-cut`, layer: 'cut', d: outlineD, closed: true },
      ...buildScoreLinePaths(`${id}-s1`, x1, y1, x2, y1, params),
      ...buildScoreLinePaths(`${id}-s2`, x2, y1, x2, y2, params),
      ...buildScoreLinePaths(`${id}-s3`, x1, y2, x2, y2, params),
      ...buildScoreLinePaths(`${id}-s4`, x1, y1, x1, y2, params),
      // Corner glue flap score lines stepped outward by material thickness T so they fold inside the left/right walls
      ...buildScoreLinePaths(`${id}-s5`, x1 - T, 0, x1 - T, y1, params),
      ...buildScoreLinePaths(`${id}-s6`, x2 + T, 0, x2 + T, y1, params),
      ...buildScoreLinePaths(`${id}-s7`, x1 - T, y2, x1 - T, totalH, params),
      ...buildScoreLinePaths(`${id}-s8`, x2 + T, y2, x2 + T, totalH, params),
    ];

    return {
      id,
      name,
      faceLabel,
      widthMm: totalW,
      heightMm: totalH,
      safeRect: { x: x1 + T / 2, y: y1 + T / 2, width: trayW, height: trayD },
      sheetX: 0,
      sheetY: 0,
      paths,
    };
  };

  const baseTray = buildTrayBlank('bottom', 'Base Tray Blank', 'BASE TRAY', W, D, H);
  const lidW = W + 2 * T + 2 * clearance;
  const lidD = D + 2 * T + 2 * clearance;
  const topLid = buildTrayBlank('top', 'Telescoping Lid Blank', 'SLIP LID', lidW, lidD, lidH);

  // Dedicated 3D Two-Piece Telescoping Tray + Slip Lid Rig:
  // 1. Base Tray (`bottom`, `base-front`, `base-back`, 4 corner glue tabs, `base-left`, `base-right`)
  // 2. Oversized Telescoping Slip Lid (`top`, `lid-front`, `lid-back`, 4 corner glue tabs, `lid-left`, `lid-right`) that fits over the Base Tray and lifts off + unfolds!
  const lidRoofY = H / 2 + T;
  const lidWallMidY = lidRoofY - lidH / 2;
  const lidExplodeY = lidRoofY + Math.max(60, H * 1.35);
  const baseTabW = Math.min(22, H * 0.75);
  const lidTabW = Math.min(22, lidH * 0.75);

  /**
   * Four corner glue tabs, hinged off the front and back walls, cut as on the sheet: a triangle with
   * the wall's full height on the hinge and its point `tabW` out, 2 mm short of the crease the wall
   * folds from (the floor's, at the bottom, or the lid roof's, at the top).
   * Closed, each sits inside its side wall (mid-plane T in from the wall's); flat, its hinge meets the
   * front or back wall's end, which runs T past the side crease. W, D are crease-to-crease spans.
   */
  const cornerTabs = (
    prefix: string,
    label: string,
    W: number,
    D: number,
    h: number,
    midY: number,
    tabW: number,
    color: string,
    stage: [number, number],
    creaseAtTop: boolean
  ): Panel3DTransform[] =>
    ([
      ['fl', 'Front-Left', -1, 1],
      ['fr', 'Front-Right', 1, 1],
      ['bl', 'Back-Left', -1, -1],
      ['br', 'Back-Right', 1, -1],
    ] as const).map(([corner, cornerName, sx, sz]) => {
      const x = sx * (W / 2 - T);
      // Local +x runs to world +z on the left (−π/2 about y) and to −z on the right, so the hinge
      // edge is local x = tabW at the front-left and back-right corners, x = 0 at the other two.
      const hx = sx * sz < 0 ? tabW : 0;
      return {
        id: `${prefix}-tab-${corner}`,
        name: `${label} ${cornerName} Glue Tab`,
        faceId: sx < 0 ? 'left' : 'right',
        widthMm: tabW,
        heightMm: h,
        thicknessMm: T,
        color,
        closedPos: [x, midY, sz * (D / 2 - tabW / 2)],
        explodedPos: [x, midY, sz * (D / 2 - tabW / 2)],
        rotation: [0, (sx * Math.PI) / 2, 0],
        outlinePoints: [
          { x: hx, y: 0 },
          { x: hx, y: h },
          { x: tabW - hx, y: creaseAtTop ? 2 : h - 2 },
        ],
        foldRig: {
          parentId: `${prefix}-${sz > 0 ? 'front' : 'back'}`,
          pivotOffset: [x, midY, (sz * D) / 2],
          axis: 'y',
          flatAngleRad: (-sx * sz * Math.PI) / 2,
          foldedAngleRad: 0,
          stage,
          flatSlide: [0, 0, -sz * 2 * T],
        },
      };
    });

  // Same straddle rule as the carton: wall centres sit half a ply outside the inner face.
  const telescope3D = ((W: number, D: number, lidW: number, lidD: number): Panel3DTransform[] => [
    // Base Tray
    {
      id: 'bottom',
      name: 'Base Tray Floor',
      faceId: 'bottom',
      widthMm: W,
      heightMm: D,
      thicknessMm: T,
      color: '#c49a6c',
      closedPos: [0, -H / 2, 0],
      explodedPos: [0, -H / 2, 0],
      rotation: [Math.PI / 2, 0, 0],
    },
    {
      id: 'base-front',
      name: 'Base Tray Front Wall',
      faceId: 'front',
      widthMm: W + 2 * T,
      heightMm: H,
      thicknessMm: T,
      color: '#cfa577',
      closedPos: [0, 0, D / 2],
      explodedPos: [0, -H / 2, D / 2 + H / 2],
      rotation: [0, 0, 0],
      foldRig: {
        pivotOffset: [0, -H / 2, D / 2],
        axis: 'x',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.0, 0.35],
      },
    },
    {
      id: 'base-back',
      name: 'Base Tray Back Wall',
      faceId: 'back',
      widthMm: W + 2 * T,
      heightMm: H,
      thicknessMm: T,
      color: '#cfa577',
      closedPos: [0, 0, -D / 2],
      explodedPos: [0, -H / 2, -D / 2 - H / 2],
      rotation: [0, Math.PI, 0],
      foldRig: {
        pivotOffset: [0, -H / 2, -D / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.0, 0.35],
      },
    },
    ...cornerTabs('base', 'Base', W, D, H, 0, baseTabW, '#b08556', [0.35, 0.65], false),
    {
      id: 'base-left',
      name: 'Base Tray Left Wall',
      faceId: 'left',
      widthMm: D,
      heightMm: H,
      thicknessMm: T,
      color: '#ba8f60',
      closedPos: [-W / 2, 0, 0],
      explodedPos: [-W / 2 - H / 2, -H / 2, 0],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        pivotOffset: [-W / 2, -H / 2, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.55, 0.90],
      },
    },
    {
      id: 'base-right',
      name: 'Base Tray Right Wall',
      faceId: 'right',
      widthMm: D,
      heightMm: H,
      thicknessMm: T,
      color: '#ba8f60',
      closedPos: [W / 2, 0, 0],
      explodedPos: [W / 2 + H / 2, -H / 2, 0],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        pivotOffset: [W / 2, -H / 2, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.55, 0.90],
      },
    },
    // Telescoping Slip Lid (oversized by 2*T + 2*clearance to slip over the Base Tray)
    {
      id: 'top',
      name: 'Telescoping Slip Lid Top',
      faceId: 'top',
      widthMm: lidW,
      heightMm: lidD,
      thicknessMm: T,
      color: '#e6ccb0',
      closedPos: [0, lidRoofY, 0],
      explodedPos: [0, lidExplodeY, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
    {
      id: 'lid-front',
      name: 'Slip Lid Front Skirt',
      faceId: 'front',
      widthMm: lidW + 2 * T,
      heightMm: lidH,
      thicknessMm: T,
      color: '#dec1a0',
      closedPos: [0, lidWallMidY, lidD / 2],
      explodedPos: [0, lidExplodeY, lidD / 2 + lidH / 2],
      rotation: [0, 0, 0],
      foldRig: {
        parentId: 'top',
        pivotOffset: [0, lidRoofY, lidD / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.10, 0.45],
      },
    },
    {
      id: 'lid-back',
      name: 'Slip Lid Back Skirt',
      faceId: 'back',
      widthMm: lidW + 2 * T,
      heightMm: lidH,
      thicknessMm: T,
      color: '#dec1a0',
      closedPos: [0, lidWallMidY, -lidD / 2],
      explodedPos: [0, lidExplodeY, -lidD / 2 - lidH / 2],
      rotation: [0, Math.PI, 0],
      foldRig: {
        parentId: 'top',
        pivotOffset: [0, lidRoofY, -lidD / 2],
        axis: 'x',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.10, 0.45],
      },
    },
    ...cornerTabs('lid', 'Lid', lidW, lidD, lidH, lidWallMidY, lidTabW, '#c8a987', [0.45, 0.72], true),
    {
      id: 'lid-left',
      name: 'Slip Lid Left Skirt',
      faceId: 'left',
      widthMm: lidD,
      heightMm: lidH,
      thicknessMm: T,
      color: '#d4b592',
      closedPos: [-lidW / 2, lidWallMidY, 0],
      explodedPos: [-lidW / 2 - lidH / 2, lidExplodeY, 0],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'top',
        pivotOffset: [-lidW / 2, lidRoofY, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.65, 0.98],
      },
    },
    {
      id: 'lid-right',
      name: 'Slip Lid Right Skirt',
      faceId: 'right',
      widthMm: lidD,
      heightMm: lidH,
      thicknessMm: T,
      color: '#d4b592',
      closedPos: [lidW / 2, lidWallMidY, 0],
      explodedPos: [lidW / 2 + lidH / 2, lidExplodeY, 0],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'top',
        pivotOffset: [lidW / 2, lidRoofY, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.65, 0.98],
      },
    },
  ])(W + T, D + T, lidW + T, lidD + T);

  return {
    panels2D: [baseTray, topLid],
    panels3D: telescope3D,
    summary: `2-Piece Telescoping Box (Lid +${fmt(2 * T + 2 * clearance)}mm clearance over base)`,
    // The slip lid is outermost across and front to back: its span (lidW + T) plus half a ply each side.
    // Height runs from the base floor's underside to the lid roof's top: the base span (H + T) plus a ply.
    outerDims: { widthMm: lidW + 2 * T, depthMm: lidD + 2 * T, heightMm: H + 2 * T },
  };
}
