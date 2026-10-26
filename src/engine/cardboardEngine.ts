import {
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
} {
  const T = params.materialThicknessMm;
  const glueW = Math.max(10, params.glueFlapMm);
  const tuckH = Math.max(12, params.tuckFlapMm);
  const dustH = Math.min(D * 0.75, W * 0.45);
  const dustInset = Math.max(0.8, T);
  const tuckInset = Math.max(0.8, T);

  // Score-to-score panel spans include material thickness on BOTH folding sides (+2*T)
  const dSpan = D + 2 * T;
  const wSpan = W + 2 * T;
  const hSpan = H + 2 * T;

  const x0 = 0;
  const x1 = x0 + glueW;
  const x2 = x1 + dSpan;
  const x3 = x2 + wSpan;
  const x4 = x3 + dSpan;
  const x5 = x4 + wSpan;

  const y0 = 0;
  const y1 = y0 + tuckH;
  const y2 = y1 + dSpan;
  const y3 = y2 + hSpan;
  const y4 = y3 + dSpan;
  const y5 = y4 + tuckH;

  const isReverse = params.tuckCartonStyle === 'reverse-tuck';
  const botStartX = isReverse ? x2 : x4;
  const botEndX = isReverse ? x3 : x5;

  const paths: DielinePath[] = [];
  const taper = Math.min(12, H * 0.18);

  // Top & bottom dust flaps are stepped inward by dustInset (T) and tuck flaps are inset by tuckInset (T) on both sides
  const bodyPerimeter = [
    `M ${fmt(x1)} ${fmt(y2)}`,
    `L ${fmt(x1)} ${fmt(y2 - dustInset)}`,
    `L ${fmt(x1 + 3)} ${fmt(y2 - dustH)}`,
    `L ${fmt(x2 - 3)} ${fmt(y2 - dustH)}`,
    `L ${fmt(x2)} ${fmt(y2 - dustInset)}`,
    `L ${fmt(x2)} ${fmt(y2)}`,
    `L ${fmt(x3)} ${fmt(y2)}`,
    `L ${fmt(x3)} ${fmt(y2 - dustInset)}`,
    `L ${fmt(x3 + 3)} ${fmt(y2 - dustH)}`,
    `L ${fmt(x4 - 3)} ${fmt(y2 - dustH)}`,
    `L ${fmt(x4)} ${fmt(y2 - dustInset)}`,
    `L ${fmt(x4)} ${fmt(y2)}`,
    `L ${fmt(x4)} ${fmt(y1)}`,
    `L ${fmt(x4 + tuckInset)} ${fmt(y1)}`,
    `Q ${fmt(x4 + tuckInset)} ${fmt(y0)} ${fmt(x4 + tuckInset + 10)} ${fmt(y0)}`,
    `L ${fmt(x5 - tuckInset - 10)} ${fmt(y0)}`,
    `Q ${fmt(x5 - tuckInset)} ${fmt(y0)} ${fmt(x5 - tuckInset)} ${fmt(y1)}`,
    `L ${fmt(x5)} ${fmt(y1)}`,
    `L ${fmt(x5)} ${fmt(y3)}`,
    ...(isReverse
      ? [
          `L ${fmt(x4)} ${fmt(y3)}`,
          `L ${fmt(x4)} ${fmt(y3 + dustInset)}`,
          `L ${fmt(x4 - 3)} ${fmt(y3 + dustH)}`,
          `L ${fmt(x3 + 3)} ${fmt(y3 + dustH)}`,
          `L ${fmt(x3)} ${fmt(y3 + dustInset)}`,
          `L ${fmt(x3)} ${fmt(y3)}`,
          `L ${fmt(x3)} ${fmt(y4)}`,
          `L ${fmt(x3 - tuckInset)} ${fmt(y4)}`,
          `Q ${fmt(x3 - tuckInset)} ${fmt(y5)} ${fmt(x3 - tuckInset - 10)} ${fmt(y5)}`,
          `L ${fmt(x2 + tuckInset + 10)} ${fmt(y5)}`,
          `Q ${fmt(x2 + tuckInset)} ${fmt(y5)} ${fmt(x2 + tuckInset)} ${fmt(y4)}`,
          `L ${fmt(x2)} ${fmt(y4)}`,
          `L ${fmt(x2)} ${fmt(y3)}`,
        ]
      : [
          `L ${fmt(x5)} ${fmt(y4)}`,
          `L ${fmt(x5 - tuckInset)} ${fmt(y4)}`,
          `Q ${fmt(x5 - tuckInset)} ${fmt(y5)} ${fmt(x5 - tuckInset - 10)} ${fmt(y5)}`,
          `L ${fmt(x4 + tuckInset + 10)} ${fmt(y5)}`,
          `Q ${fmt(x4 + tuckInset)} ${fmt(y5)} ${fmt(x4 + tuckInset)} ${fmt(y4)}`,
          `L ${fmt(x4)} ${fmt(y4)}`,
          `L ${fmt(x4)} ${fmt(y3)}`,
          `L ${fmt(x4)} ${fmt(y3 + dustInset)}`,
          `L ${fmt(x4 - 3)} ${fmt(y3 + dustH)}`,
          `L ${fmt(x3 + 3)} ${fmt(y3 + dustH)}`,
          `L ${fmt(x3)} ${fmt(y3 + dustInset)}`,
          `L ${fmt(x3)} ${fmt(y3)}`,
          `L ${fmt(x2)} ${fmt(y3)}`,
        ]),
    `L ${fmt(x2)} ${fmt(y3 + dustInset)}`,
    `L ${fmt(x2 - 3)} ${fmt(y3 + dustH)}`,
    `L ${fmt(x1 + 3)} ${fmt(y3 + dustH)}`,
    `L ${fmt(x1)} ${fmt(y3 + dustInset)}`,
    `L ${fmt(x1)} ${fmt(y3)}`,
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

  // Dust flap score lines are stepped by dustInset (T) so the dust flaps clear the main top/bottom lid folds
  const scores: [string, number, number, number, number][] = [
    ['score-glue', x1, y2, x1, y3],
    ['score-l-f', x2, y2, x2, y3],
    ['score-f-r', x3, y2, x3, y3],
    ['score-r-b', x4, y2, x4, y3],
    ['score-top-dust-l', x1, y2 - dustInset, x2, y2 - dustInset],
    ['score-top-front', x2, y2, x3, y2],
    ['score-top-dust-r', x3, y2 - dustInset, x4, y2 - dustInset],
    ['score-top-lid', x4, y2, x5, y2],
    ['score-bot-dust-l', x1, y3 + dustInset, x2, y3 + dustInset],
    ['score-bot-front', x2, y3, x3, y3],
    ['score-bot-dust-r', x3, y3 + dustInset, x4, y3 + dustInset],
    ['score-bot-back', x4, y3, x5, y3],
    ['score-top-tuck', x4 + tuckInset + slitLen, y1, x5 - tuckInset - slitLen, y1],
    ['score-bot-tuck', botStartX + tuckInset + slitLen, y4, botEndX - tuckInset - slitLen, y4],
  ];

  for (const [id, sx1, sy1, sx2, sy2] of scores) {
    paths.push(...buildScoreLinePaths(id, sx1, sy1, sx2, sy2, params));
  }

  const panel2D: BoxPanel2D = {
    id: 'tuck-carton-sheet',
    name: `Folding Carton (${isReverse ? 'Reverse Tuck RTE' : 'Straight Tuck STE'})`,
    faceLabel: 'CARTON DIELINE',
    widthMm: x5,
    heightMm: y5,
    safeRect: { x: x2 + T, y: y2 + T, width: W, height: H },
    sheetX: 0,
    sheetY: 0,
    paths,
    subFaces: [
      { id: 'front', name: 'Front Face', x: x2 + T, y: y2 + T, width: W, height: H },
      { id: 'back', name: 'Back Face', x: x4 + T, y: y2 + T, width: W, height: H },
      { id: 'left', name: 'Left Side', x: x1 + T, y: y2 + T, width: D, height: H },
      { id: 'right', name: 'Right Side', x: x3 + T, y: y2 + T, width: D, height: H },
      { id: 'top', name: 'Top Lid', x: x4 + T, y: y1 + T, width: W, height: D },
      { id: 'bottom', name: 'Bottom Closure', x: botStartX + T, y: y3 + T, width: W, height: D },
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
  const rTuckCorner = Math.min(8, tuckH * 0.45);
  const roundedTuckOutline: Point2D[] = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: tuckH - rTuckCorner },
    { x: W - rTuckCorner, y: tuckH },
    { x: rTuckCorner, y: tuckH },
    { x: 0, y: tuckH - rTuckCorner },
  ];

  const carton3D: Panel3DTransform[] = [
    {
      id: 'back',
      name: 'Back Face',
      faceId: 'back',
      widthMm: W,
      heightMm: H,
      thicknessMm: T,
      color: cBody,
      closedPos: [0, 0, -D / 2],
      explodedPos: [0, 0, -D / 2],
      rotation: [0, Math.PI, 0],
      foldRig: {
        pivotOffset: [0, -H / 2, -D / 2],
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
      heightMm: H,
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
      heightMm: H,
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
      widthMm: D,
      heightMm: H,
      thicknessMm: T,
      color: cSide,
      closedPos: [-W / 2, 0, 0],
      explodedPos: [-W / 2 - D / 2, 0, -D / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [-W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.20, 0.45],
      },
    },
    {
      id: 'glue-flap',
      name: 'Side Seam Glue Flap',
      faceId: 'left',
      widthMm: glueW,
      heightMm: Math.max(10, H - 2 * taper),
      thicknessMm: T,
      color: cTuck,
      closedPos: [-W / 2 + glueW / 2, 0, D / 2],
      explodedPos: [-W / 2 - D - glueW / 2, 0, -D / 2],
      rotation: [0, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.28, 0.52],
      },
    },
    // Top Left & Right Dust Flaps
    {
      id: 'top-dust-l',
      name: 'Top Left Dust Flap',
      faceId: 'left',
      widthMm: dustH,
      heightMm: D - 2 * dustInset,
      thicknessMm: T,
      color: cTuck,
      closedPos: [-W / 2 + dustH / 2, H / 2, 0],
      explodedPos: [-W / 2 - D / 2, H / 2 + dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, H / 2, 0],
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
      heightMm: D - 2 * dustInset,
      thicknessMm: T,
      color: cTuck,
      closedPos: [W / 2 - dustH / 2, H / 2, 0],
      explodedPos: [W / 2 + D / 2, H / 2 + dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'right',
        pivotOffset: [W / 2, H / 2, 0],
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
      heightMm: D,
      thicknessMm: T,
      color: cFlap,
      closedPos: [0, H / 2, 0],
      explodedPos: [0, H / 2 + D / 2, -D / 2],
      rotation: [-Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [0, H / 2, -D / 2],
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
      widthMm: W,
      heightMm: tuckH,
      thicknessMm: T,
      color: cTuck,
      closedPos: [0, H / 2 - tuckH / 2, D / 2],
      explodedPos: [0, H / 2 + D + tuckH / 2, -D / 2],
      rotation: [0, 0, 0],
      outlinePoints: roundedTuckOutline,
      foldRig: {
        parentId: 'top',
        pivotOffset: [0, H / 2, D / 2],
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
      heightMm: D - 2 * dustInset,
      thicknessMm: T,
      color: cTuck,
      closedPos: [-W / 2 + dustH / 2, -H / 2, 0],
      explodedPos: [-W / 2 - D / 2, -H / 2 - dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, -H / 2, 0],
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
      heightMm: D - 2 * dustInset,
      thicknessMm: T,
      color: cTuck,
      closedPos: [W / 2 - dustH / 2, -H / 2, 0],
      explodedPos: [W / 2 + D / 2, -H / 2 - dustH / 2, -D / 2],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'right',
        pivotOffset: [W / 2, -H / 2, 0],
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
            heightMm: D,
            thicknessMm: T,
            color: cFlap,
            closedPos: [0, -H / 2, 0],
            explodedPos: [0, -H / 2 - D / 2, D / 2],
            rotation: [Math.PI / 2, 0, 0],
            foldRig: {
              parentId: 'front',
              pivotOffset: [0, -H / 2, D / 2],
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
            widthMm: W,
            heightMm: tuckH,
            thicknessMm: T,
            color: cTuck,
            closedPos: [0, -H / 2 + tuckH / 2, -D / 2],
            explodedPos: [0, -H / 2 - D - tuckH / 2, D / 2],
            rotation: [Math.PI, 0, 0],
            outlinePoints: roundedTuckOutline,
            foldRig: {
              parentId: 'bottom',
              pivotOffset: [0, -H / 2, -D / 2],
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
            heightMm: D,
            thicknessMm: T,
            color: cFlap,
            closedPos: [0, -H / 2, 0],
            explodedPos: [0, -H / 2 - D / 2, -D / 2],
            rotation: [Math.PI / 2, 0, 0],
            foldRig: {
              parentId: 'back',
              pivotOffset: [0, -H / 2, -D / 2],
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
            widthMm: W,
            heightMm: tuckH,
            thicknessMm: T,
            color: cTuck,
            closedPos: [0, -H / 2 + tuckH / 2, D / 2],
            explodedPos: [0, -H / 2 - D - tuckH / 2, -D / 2],
            rotation: [Math.PI, 0, 0],
            outlinePoints: roundedTuckOutline,
            foldRig: {
              parentId: 'bottom',
              pivotOffset: [0, -H / 2, D / 2],
              axis: 'x',
              flatAngleRad: Math.PI / 2,
              foldedAngleRad: 0,
              stage: [0.84, 1.0],
            },
          },
        ] as Panel3DTransform[])),
  ];

  return {
    panels2D: [panel2D],
    panels3D: carton3D,
    summary: `${isReverse ? 'Reverse' : 'Straight'} Tuck Carton (${fmt(x5)} × ${fmt(y5)} mm flat blank)`,
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
    // Score-to-score tray floor spans include +2*T bend allowance (both opposite walls fold inward); corner glue tabs step out by T
    const wSpan = trayW + 2 * T;
    const dSpan = trayD + 2 * T;
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
      safeRect: { x: x1 + T, y: y1 + T, width: trayW, height: trayD },
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

  const telescope3D: Panel3DTransform[] = [
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
      widthMm: W,
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
      widthMm: W,
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
    // 4 Base Tray Corner Glue Flaps (hinged off base-front and base-back)
    {
      id: 'base-tab-fl',
      name: 'Base Front-Left Glue Tab',
      faceId: 'left',
      widthMm: baseTabW,
      heightMm: Math.max(8, H - 4),
      thicknessMm: T,
      color: '#b08556',
      closedPos: [-W / 2, 0, D / 2 - baseTabW / 2],
      explodedPos: [-W / 2 - baseTabW / 2, -H / 2, D / 2 + H / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'base-front',
        pivotOffset: [-W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.35, 0.65],
      },
    },
    {
      id: 'base-tab-fr',
      name: 'Base Front-Right Glue Tab',
      faceId: 'right',
      widthMm: baseTabW,
      heightMm: Math.max(8, H - 4),
      thicknessMm: T,
      color: '#b08556',
      closedPos: [W / 2, 0, D / 2 - baseTabW / 2],
      explodedPos: [W / 2 + baseTabW / 2, -H / 2, D / 2 + H / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'base-front',
        pivotOffset: [W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.35, 0.65],
      },
    },
    {
      id: 'base-tab-bl',
      name: 'Base Back-Left Glue Tab',
      faceId: 'left',
      widthMm: baseTabW,
      heightMm: Math.max(8, H - 4),
      thicknessMm: T,
      color: '#b08556',
      closedPos: [-W / 2, 0, -D / 2 + baseTabW / 2],
      explodedPos: [-W / 2 - baseTabW / 2, -H / 2, -D / 2 - H / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'base-back',
        pivotOffset: [-W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.35, 0.65],
      },
    },
    {
      id: 'base-tab-br',
      name: 'Base Back-Right Glue Tab',
      faceId: 'right',
      widthMm: baseTabW,
      heightMm: Math.max(8, H - 4),
      thicknessMm: T,
      color: '#b08556',
      closedPos: [W / 2, 0, -D / 2 + baseTabW / 2],
      explodedPos: [W / 2 + baseTabW / 2, -H / 2, -D / 2 - H / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'base-back',
        pivotOffset: [W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.35, 0.65],
      },
    },
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
      widthMm: lidW,
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
      widthMm: lidW,
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
    // 4 Slip Lid Corner Glue Flaps (hinged off lid-front and lid-back)
    {
      id: 'lid-tab-fl',
      name: 'Lid Front-Left Glue Tab',
      faceId: 'left',
      widthMm: lidTabW,
      heightMm: Math.max(8, lidH - 4),
      thicknessMm: T,
      color: '#c8a987',
      closedPos: [-lidW / 2, lidWallMidY, lidD / 2 - lidTabW / 2],
      explodedPos: [-lidW / 2 - lidTabW / 2, lidExplodeY, lidD / 2 + lidH / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'lid-front',
        pivotOffset: [-lidW / 2, lidWallMidY, lidD / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.45, 0.72],
      },
    },
    {
      id: 'lid-tab-fr',
      name: 'Lid Front-Right Glue Tab',
      faceId: 'right',
      widthMm: lidTabW,
      heightMm: Math.max(8, lidH - 4),
      thicknessMm: T,
      color: '#c8a987',
      closedPos: [lidW / 2, lidWallMidY, lidD / 2 - lidTabW / 2],
      explodedPos: [lidW / 2 + lidTabW / 2, lidExplodeY, lidD / 2 + lidH / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'lid-front',
        pivotOffset: [lidW / 2, lidWallMidY, lidD / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.45, 0.72],
      },
    },
    {
      id: 'lid-tab-bl',
      name: 'Lid Back-Left Glue Tab',
      faceId: 'left',
      widthMm: lidTabW,
      heightMm: Math.max(8, lidH - 4),
      thicknessMm: T,
      color: '#c8a987',
      closedPos: [-lidW / 2, lidWallMidY, -lidD / 2 + lidTabW / 2],
      explodedPos: [-lidW / 2 - lidTabW / 2, lidExplodeY, -lidD / 2 - lidH / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'lid-back',
        pivotOffset: [-lidW / 2, lidWallMidY, -lidD / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.45, 0.72],
      },
    },
    {
      id: 'lid-tab-br',
      name: 'Lid Back-Right Glue Tab',
      faceId: 'right',
      widthMm: lidTabW,
      heightMm: Math.max(8, lidH - 4),
      thicknessMm: T,
      color: '#c8a987',
      closedPos: [lidW / 2, lidWallMidY, -lidD / 2 + lidTabW / 2],
      explodedPos: [lidW / 2 + lidTabW / 2, lidExplodeY, -lidD / 2 - lidH / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'lid-back',
        pivotOffset: [lidW / 2, lidWallMidY, -lidD / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.45, 0.72],
      },
    },
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
  ];

  return {
    panels2D: [baseTray, topLid],
    panels3D: telescope3D,
    summary: `2-Piece Telescoping Box (Lid +${fmt(2 * T + 2 * clearance)}mm clearance over base)`,
  };
}
