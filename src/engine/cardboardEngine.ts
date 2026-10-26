import {
  BoxPanel2D,
  BoxParameters,
  DielinePath,
  Panel3DTransform,
  Point2D,
} from './types';
import { fmt } from './fingerJointEngine';

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
 * 1. Roll-End Tuck Top (RETT) Corrugated Mailer Box
 *    - Tuck flap folds INSIDE the box behind the Front Wall
 *    - Locking tabs extend upward from the top edge of the Front Wall into slot cutouts
 *      located right in the joint (crease) between the Lid Top and the Inner Tuck Flap.
 */
function generateMailerBox(
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
  const tuckH = Math.max(12, params.tuckFlapMm);
  // Rollover wall bridge spans 2*T so the inner wall wraps 180° (two 90° folds) over the T-thick dust flaps without crushing
  const rollGap = Math.max(1.5, T * 2.0);
  const innerWallH = Math.max(8, H - T);
  const dustFlapW = Math.min(H * 0.85, D * 0.48);
  const dustInset = Math.max(0.8, T);

  // Score-to-score panel spans include material thickness (T) bend allowances on BOTH folding sides (+2*T):
  // - Center column spans W + 2*T (both left & right sides fold in with inner dust flaps / rollover walls)
  // - Depth spans (Lid Top & Bottom Floor) include +2*T (both front and back score edges fold in at 90°)
  // - Height spans (Back Wall, Front Wall, and Left/Right Outer Side Walls) include +2*T (both top and bottom score edges fold in at 90°)
  const wSpan = W + 2 * T;
  const dLidSpan = D + 2 * T;
  const hBackSpan = H + 2 * T;
  const dFloorSpan = D + 2 * T;
  const hFrontSpan = H + 2 * T;
  const hSideSpan = H + 2 * T;

  const lockStyle = (params.cardboardLockStyle || 'center-tongue') as string;
  const tabW = Math.min(W * 0.28, Math.max(8, params.lockTabWidthMm || 18));
  const tongueLen = Math.min(18, Math.max(6, params.lockTabDepthMm || 8));
  const recessH = Math.min(14, Math.max(8, H * 0.2));
  const reliefSlotW = Math.max(1.0, T * 0.75);
  // Material-thickness bridge (T) at the top of the front locking tab so it wraps cleanly over the lid thickness
  const tabFoldBridge = T;
  const frontTabExtraY =
    lockStyle === 'front-slot-tabs' || lockStyle === 'center-tongue'
      ? tabFoldBridge + tongueLen
      : 0;

  // Horizontal layout coordinates:
  // [Left Roll Tab] [Left Inner RollWall] [RollGap (2T)] [Left Outer Wall (H + 2T)] [Center Column (W + 2T)] [Right Outer Wall (H + 2T)] [RollGap (2T)] [Right Inner RollWall] [Right Roll Tab]
  const rollTabExt = Math.max(3, T * 1.5);
  const x0 = rollTabExt;
  const x1 = x0 + innerWallH;
  const x2 = x1 + rollGap;
  const x3 = x2 + hSideSpan;
  const x4 = x3 + wSpan;
  const x5 = x4 + hSideSpan;
  const x6 = x5 + rollGap;
  const x7 = x6 + innerWallH;

  // Vertical layout coordinates (top to bottom):
  // [0..y1: Inner Tuck Flap (tuckH)]
  // [y1..y2: Lid Top (D + 2T)]
  // [y2..y3: Back Wall (H + 2T)]
  // [y3..y4: Bottom Floor (D + 2T)]
  // [y4..y5: Front Wall (H + 2T)]
  // [y5..y5+tabFoldBridge+tongueLen: Material-Thickness Bridge + Rounded Fold-In Tongue of Lock Tab]
  const y0 = 0;
  const y1 = y0 + tuckH;
  const y2 = y1 + dLidSpan;
  const y3 = y2 + hBackSpan;
  const y4 = y3 + dFloorSpan;
  const y5 = y4 + hFrontSpan;

  const totalW = x7 + rollTabExt;
  const totalH = y5 + frontTabExtraY;

  const paths: DielinePath[] = [];
  const earW = lockStyle === 'cherry-ears' ? Math.min(18, tongueLen * 2.0) : 0;
  const rTuck = Math.min(7, tuckH * 0.4);
  // Inset the tuck flap by 2*T on both left and right so it clears both left & right folded-in rollover walls
  const tuckInset = Math.max(1.5, 2 * T);

  // Local X intervals [tx0, tx1] (in 0..wSpan across Front Wall / Lid Top) for each Front-Face Cutout Lock Tab
  const centerTongueW = Math.min(wSpan * 0.36, Math.max(16, tabW * 1.35));
  const lockTabSpans: [number, number][] =
    lockStyle === 'center-tongue'
      ? [[(wSpan - centerTongueW) / 2, (wSpan + centerTongueW) / 2]]
      : lockStyle === 'front-slot-tabs'
      ? [
          [wSpan * 0.26 - tabW / 2, wSpan * 0.26 + tabW / 2],
          [wSpan * 0.74 - tabW / 2, wSpan * 0.74 + tabW / 2],
        ]
      : [];

  // 1. Top Inner Tuck Flap perimeter (at y0..y1)
  const buildTopTuckFlapCommands = (): string[] => {
    if (lockStyle === 'cherry-ears') {
      const notch = Math.min(4, tuckH * 0.25);
      return [
        `M ${fmt(x3)} ${fmt(y1)}`,
        `L ${fmt(x3)} ${fmt(y1 - notch)}`,
        `L ${fmt(x3 - earW)} ${fmt(y1 - notch)}`,
        `L ${fmt(x3 - earW)} ${fmt(y0 + rTuck)}`,
        `Q ${fmt(x3 - earW)} ${fmt(y0)} ${fmt(x3 - earW + rTuck)} ${fmt(y0)}`,
        `L ${fmt(x4 + earW - rTuck)} ${fmt(y0)}`,
        `Q ${fmt(x4 + earW)} ${fmt(y0)} ${fmt(x4 + earW)} ${fmt(y0 + rTuck)}`,
        `L ${fmt(x4 + earW)} ${fmt(y1 - notch)}`,
        `L ${fmt(x4)} ${fmt(y1 - notch)}`,
        `L ${fmt(x4)} ${fmt(y1)}`,
      ];
    }

    // Standard inner tuck flap (inset by tuckInset so it slides neatly inside the box behind the Front Wall)
    return [
      `M ${fmt(x3)} ${fmt(y1)}`,
      `L ${fmt(x3 + tuckInset)} ${fmt(y1)}`,
      `L ${fmt(x3 + tuckInset)} ${fmt(y0 + rTuck)}`,
      `Q ${fmt(x3 + tuckInset)} ${fmt(y0)} ${fmt(x3 + tuckInset + rTuck)} ${fmt(y0)}`,
      `L ${fmt(x4 - tuckInset - rTuck)} ${fmt(y0)}`,
      `Q ${fmt(x4 - tuckInset)} ${fmt(y0)} ${fmt(x4 - tuckInset)} ${fmt(y0 + rTuck)}`,
      `L ${fmt(x4 - tuckInset)} ${fmt(y1)}`,
      `L ${fmt(x4)} ${fmt(y1)}`,
    ];
  };

  // 2. Bottom of Front Wall in 2D (y = y5, which folds up to become the TOP edge of the Front Wall in 3D!)
  //    Walks from right (x4, y5) to left (x3, y5), cutting down into the Front Wall (to y5 - recessH) on both sides
  //    of each locking tab so the tab can fold back at Score Line 1 (y5 - recessH) and fold across the T-wide score bridge (y5..y5+T) into the slot!
  const buildFrontWallTopEdgeCommands = (): string[] => {
    if (lockTabSpans.length > 0) {
      const cmds: string[] = [];
      const reversedSpans = lockTabSpans.slice().reverse();
      const tipY = y5 + tabFoldBridge + tongueLen;
      for (const [tx0, tx1] of reversedSpans) {
        const gx0 = x3 + tx0;
        const gx1 = x3 + tx1;
        const rTab = Math.min(4.5, tongueLen * 0.45, (tx1 - tx0) * 0.28);
        cmds.push(
          // Right relief cut going down into the Front Wall (from y5 to y5 - recessH)
          `L ${fmt(gx1 + reliefSlotW)} ${fmt(y5)}`,
          `L ${fmt(gx1 + reliefSlotW)} ${fmt(y5 - recessH)}`,
          `L ${fmt(gx1)} ${fmt(y5 - recessH)}`,
          // Right edge of the tab rising from Score Line 1 (y5 - recessH) past the T-wide fold bridge (y5..y5+T) out to the rounded tongue tip
          `L ${fmt(gx1)} ${fmt(tipY - rTab)}`,
          `Q ${fmt(gx1)} ${fmt(tipY)} ${fmt(gx1 - rTab)} ${fmt(tipY)}`,
          `L ${fmt(gx0 + rTab)} ${fmt(tipY)}`,
          `Q ${fmt(gx0)} ${fmt(tipY)} ${fmt(gx0)} ${fmt(tipY - rTab)}`,
          // Left edge of the tab going back down into the Front Wall to Score Line 1 (y5 - recessH)
          `L ${fmt(gx0)} ${fmt(y5 - recessH)}`,
          `L ${fmt(gx0 - reliefSlotW)} ${fmt(y5 - recessH)}`,
          `L ${fmt(gx0 - reliefSlotW)} ${fmt(y5)}`
        );
      }
      cmds.push(`L ${fmt(x3)} ${fmt(y5)}`);
      return cmds;
    }

    if (params.thumbNotch) {
      return [
        `L ${fmt((x3 + x4) / 2 + 12)} ${fmt(y5)}`,
        `A 12 12 0 0 1 ${fmt((x3 + x4) / 2 - 12)} ${fmt(y5)}`,
        `L ${fmt(x3)} ${fmt(y5)}`,
      ];
    }

    return [`L ${fmt(x3)} ${fmt(y5)}`];
  };

  const slotLen = Math.min(20, D * 0.28);
  const slotMidY = (y3 + y4) / 2;

  // Outer continuous perimeter cut path for the entire 1-piece mailer
  // Dust flaps are stepped outward by T (`x3 - T` / `x4 + T`) and inset vertically by `dustInset` (T)
  // so their fold creases clear the adjacent T-thick walls when folded!
  const outlineD = [
    ...buildTopTuckFlapCommands(),
    // Right side of Lid Top (stepped out by T for wing score clearance)
    `L ${fmt(x4 + T)} ${fmt(y1)}`,
    `L ${fmt(x4 + dustFlapW * 0.6)} ${fmt(y1 + 4)}`,
    `L ${fmt(x4 + dustFlapW * 0.6)} ${fmt(y2 - 4)}`,
    `L ${fmt(x4 + T)} ${fmt(y2)}`,
    `L ${fmt(x4)} ${fmt(y2)}`,
    // Right Back Dust Flap (score line stepped out at x4 + T, top/bottom inset by dustInset = T)
    `L ${fmt(x4 + T)} ${fmt(y2 + dustInset)}`,
    `L ${fmt(x4 + T + dustFlapW)} ${fmt(y2 + dustInset + 3)}`,
    `L ${fmt(x4 + T + dustFlapW)} ${fmt(y3 - dustInset - 1)}`,
    `L ${fmt(x4 + T)} ${fmt(y3 - dustInset)}`,
    `L ${fmt(x4)} ${fmt(y3 - dustInset)}`,
    `L ${fmt(x4)} ${fmt(y3)}`,
    // Right Rollover Wall + Inner Wall + protruding bottom lock tab
    `L ${fmt(x7)} ${fmt(y3)}`,
    `L ${fmt(x7)} ${fmt(slotMidY - slotLen / 2 + 1)}`,
    `L ${fmt(x7 + rollTabExt)} ${fmt(slotMidY - slotLen / 2 + 2)}`,
    `L ${fmt(x7 + rollTabExt)} ${fmt(slotMidY + slotLen / 2 - 2)}`,
    `L ${fmt(x7)} ${fmt(slotMidY + slotLen / 2 - 1)}`,
    `L ${fmt(x7)} ${fmt(y4)}`,
    `L ${fmt(x4)} ${fmt(y4)}`,
    `L ${fmt(x4)} ${fmt(y4 + dustInset)}`,
    `L ${fmt(x4 + T)} ${fmt(y4 + dustInset)}`,
    // Right Front Dust Flap (score line stepped out at x4 + T)
    `L ${fmt(x4 + T + dustFlapW)} ${fmt(y4 + dustInset + 1)}`,
    `L ${fmt(x4 + T + dustFlapW)} ${fmt(y5 - 3)}`,
    `L ${fmt(x4 + T)} ${fmt(y5)}`,
    `L ${fmt(x4)} ${fmt(y5)}`,
    // Top rim of Front Wall (with rounded fold-in locking tongues!)
    ...buildFrontWallTopEdgeCommands(),
    // Left Front Dust Flap (score line stepped out at x3 - T)
    `L ${fmt(x3 - T)} ${fmt(y5)}`,
    `L ${fmt(x3 - T - dustFlapW)} ${fmt(y5 - 3)}`,
    `L ${fmt(x3 - T - dustFlapW)} ${fmt(y4 + dustInset + 1)}`,
    `L ${fmt(x3 - T)} ${fmt(y4 + dustInset)}`,
    `L ${fmt(x3)} ${fmt(y4 + dustInset)}`,
    `L ${fmt(x3)} ${fmt(y4)}`,
    // Left Rollover Wall + Inner Wall + protruding bottom lock tab
    `L ${fmt(x0)} ${fmt(y4)}`,
    `L ${fmt(x0)} ${fmt(slotMidY + slotLen / 2 - 1)}`,
    `L 0 ${fmt(slotMidY + slotLen / 2 - 2)}`,
    `L 0 ${fmt(slotMidY - slotLen / 2 + 2)}`,
    `L ${fmt(x0)} ${fmt(slotMidY - slotLen / 2 + 1)}`,
    `L ${fmt(x0)} ${fmt(y3)}`,
    `L ${fmt(x3)} ${fmt(y3)}`,
    `L ${fmt(x3)} ${fmt(y3 - dustInset)}`,
    `L ${fmt(x3 - T)} ${fmt(y3 - dustInset)}`,
    // Left Back Dust Flap (score line stepped out at x3 - T)
    `L ${fmt(x3 - T - dustFlapW)} ${fmt(y3 - dustInset - 1)}`,
    `L ${fmt(x3 - T - dustFlapW)} ${fmt(y2 + dustInset + 3)}`,
    `L ${fmt(x3 - T)} ${fmt(y2 + dustInset)}`,
    `L ${fmt(x3)} ${fmt(y2)}`,
    `L ${fmt(x3 - T)} ${fmt(y2)}`,
    // Left side of Lid Top (stepped out by T for wing score clearance)
    `L ${fmt(x3 - dustFlapW * 0.6)} ${fmt(y2 - 4)}`,
    `L ${fmt(x3 - dustFlapW * 0.6)} ${fmt(y1 + 4)}`,
    `L ${fmt(x3 - T)} ${fmt(y1)}`,
    `L ${fmt(x3)} ${fmt(y1)}`,
    'Z',
  ].join(' ');

  paths.push({
    id: 'mailer-perimeter-cut',
    layer: 'cut',
    d: outlineD,
    closed: true,
  });

  // Floor lock slots (for rollover wall bottom tabs)
  paths.push({
    id: 'mailer-slot-left',
    layer: 'cut',
    d: `M ${fmt(x3 + T)} ${fmt(slotMidY - slotLen / 2)} L ${fmt(x3 + 2.2 * T)} ${fmt(slotMidY - slotLen / 2)} L ${fmt(x3 + 2.2 * T)} ${fmt(slotMidY + slotLen / 2)} L ${fmt(x3 + T)} ${fmt(slotMidY + slotLen / 2)} Z`,
    closed: true,
  });
  paths.push({
    id: 'mailer-slot-right',
    layer: 'cut',
    d: `M ${fmt(x4 - 2.2 * T)} ${fmt(slotMidY - slotLen / 2)} L ${fmt(x4 - T)} ${fmt(slotMidY - slotLen / 2)} L ${fmt(x4 - T)} ${fmt(slotMidY + slotLen / 2)} L ${fmt(x4 - 2.2 * T)} ${fmt(slotMidY + slotLen / 2)} Z`,
    closed: true,
  });

  // 3. FRONT-FACE CUTOUT SLITS + D-SHAPED JOINT CUTOUTS (in the y = y1 crease between Lid Top & Inner Tuck Flap)
  //    - On the Front Wall (y = y5): two vertical slits cut down into the front face (from y5 to y5 - recessH),
  //      with a root score line at y5 - recessH and a T-wide double-score fold bridge at y5 and y5 + T.
  //    - On the Lid-to-Tuck-Flap crease (y = y1): a D-shaped semicircular cutout extends into the Lid Top
  //      so when the front tab's rounded tongue folds 90° inward across its T-wide bridge, it seats flush inside the D-shaped cutout!
  const slotClearance = Math.max(0.8, T * 0.5);
  const cutoutDepth = tongueLen + slotClearance;
  const scores: [string, number, number, number, number][] = [];

  if (lockTabSpans.length > 0) {
    let prevScoreX = x3 + tuckInset;
    lockTabSpans.forEach(([tx0, tx1], idx) => {
      const gx0 = x3 + tx0;
      const gx1 = x3 + tx1;

      // Score Lines on the Front-Face Locking Tab (accounting for material thickness T):
      // 1. Score Line 1 at the bottom of the Front Wall cutout recess (y = y5 - recessH) so the tab folds back from the front face.
      // 2. Double-Score Bridge (y = y5 and y = y5 + T) separated by material thickness T so the rounded tongue wraps cleanly around the T-thick lid crease into the D-cutout slot!
      scores.push([`score-front-tab-root-${idx + 1}`, gx0, y5 - recessH, gx1, y5 - recessH]);
      scores.push([`score-front-tab-fold-${idx + 1}`, gx0, y5, gx1, y5]);
      if (tabFoldBridge >= 0.4) {
        scores.push([
          `score-front-tab-bridge-${idx + 1}`,
          gx0,
          y5 + tabFoldBridge,
          gx1,
          y5 + tabFoldBridge,
        ]);
      }

      // D-shaped semicircular cutout along the y = y1 crease (extending into Lid Top y1 .. y1 + cutoutDepth)
      const sL = gx0 - slotClearance;
      const sR = gx1 + slotClearance;
      const rCut = Math.min(cutoutDepth * 0.85, (sR - sL) * 0.45);
      paths.push({
        id: `joint-d-cutout-${idx + 1}`,
        layer: 'cut',
        d: [
          `M ${fmt(sL)} ${fmt(y1)}`,
          `L ${fmt(sR)} ${fmt(y1)}`,
          `L ${fmt(sR)} ${fmt(y1 + cutoutDepth - rCut)}`,
          `Q ${fmt(sR)} ${fmt(y1 + cutoutDepth)} ${fmt(sR - rCut)} ${fmt(y1 + cutoutDepth)}`,
          `L ${fmt(sL + rCut)} ${fmt(y1 + cutoutDepth)}`,
          `Q ${fmt(sL)} ${fmt(y1 + cutoutDepth)} ${fmt(sL)} ${fmt(y1 + cutoutDepth - rCut)}`,
          'Z',
        ].join(' '),
        closed: true,
      });

      if (sL > prevScoreX + 0.5) {
        scores.push([`score-tuck-seg-${idx + 1}`, prevScoreX, y1, sL, y1]);
      }
      prevScoreX = sR;
    });

    if (x4 - tuckInset > prevScoreX + 0.5) {
      scores.push(['score-tuck-seg-end', prevScoreX, y1, x4 - tuckInset, y1]);
    }
  } else {
    scores.push(['score-tuck', x3, y1, x4, y1]);
  }

  // Remaining Score Lines (with dust-flap and wing creases stepped outward by material thickness T)
  scores.push(
    ['score-lid-back', x3, y2, x4, y2],
    ['score-back-floor', x3, y3, x4, y3],
    ['score-floor-front', x3, y4, x4, y4],
    ['score-lid-wing-l', x3 - T, y1, x3 - T, y2],
    ['score-lid-wing-r', x4 + T, y1, x4 + T, y2],
    ['score-back-dust-l', x3 - T, y2 + dustInset, x3 - T, y3 - dustInset],
    ['score-back-dust-r', x4 + T, y2 + dustInset, x4 + T, y3 - dustInset],
    ['score-front-dust-l', x3 - T, y4 + dustInset, x3 - T, y5],
    ['score-front-dust-r', x4 + T, y4 + dustInset, x4 + T, y5],
    ['score-floor-side-l', x3, y3, x3, y4],
    ['score-floor-side-r', x4, y3, x4, y4],
    ['score-roll-l1', x2, y3, x2, y4],
    ['score-roll-l2', x1, y3, x1, y4],
    ['score-roll-r1', x5, y3, x5, y4],
    ['score-roll-r2', x6, y3, x6, y4]
  );

  if (lockStyle === 'cherry-ears') {
    const notch = Math.min(4, tuckH * 0.25);
    scores.push(['score-cherry-l', x3, y0, x3, y1 - notch]);
    scores.push(['score-cherry-r', x4, y0, x4, y1 - notch]);
  }

  for (const [id, sx1, sy1, sx2, sy2] of scores) {
    paths.push(...buildScoreLinePaths(id, sx1, sy1, sx2, sy2, params));
  }

  const panel2D: BoxPanel2D = {
    id: 'mailer-sheet',
    name: '1-Piece Mailer Dieline (RETT)',
    faceLabel: 'MAILER DIELINE',
    widthMm: totalW,
    heightMm: totalH,
    safeRect: {
      x: x3 + T,
      y: y1 + T,
      width: W,
      height: D,
    },
    sheetX: 0,
    sheetY: 0,
    paths,
    subFaces: [
      { id: 'top', name: 'Lid Top (Outside)', x: x3 + T, y: y1 + T, width: W, height: D },
      { id: 'back', name: 'Back Spine', x: x3 + T, y: y2 + T, width: W, height: H },
      { id: 'bottom', name: 'Bottom Floor', x: x3 + T, y: y3 + T, width: W, height: D },
      { id: 'front', name: 'Front Wall', x: x3 + T, y: y4 + T, width: W, height: H },
      { id: 'left', name: 'Left Side Wall', x: x2 + T, y: y3 + T, width: H, height: D },
      { id: 'right', name: 'Right Side Wall', x: x4 + T, y: y3 + T, width: H, height: D },
    ],
  };

  // Build 3D outlines for:
  // 1. Front Wall (with vertical slits / recessed cutout notches at the top edge where the locking tab is cut out of the front face!)
  // 2. Lid Top (with matching D-shaped semicircular cutouts along the front fold joint at Z = +D/2!)
  // 3. Inward-Folding Lock Tab Tongue(s) (folding 90° inward into the box at Y = +H/2, matching the orange carton!)
  const front3DOutline: Point2D[] = [];
  const lid3DOutline: Point2D[] = [];
  const lockTabPanels3D: Panel3DTransform[] = [];
  const lockTabSpans3D: [number, number][] = lockTabSpans.map(([tx0, tx1]) => [tx0 - T, tx1 - T]);

  if (lockTabSpans3D.length > 0) {
    // 1. Front Wall 3D Outline: y = 0 is the TOP rim (Y = +H/2), y = H is the BOTTOM fold (Y = -H/2).
    //    Cut the full rectangular recess [tx0 - reliefSlotW .. tx1 + reliefSlotW] x [0 .. recessH] out of the stationary Front Wall
    //    so the articulated 2-score-line locking tab (`front-lock-root` + `front-lock-tongue`) can fold back from the rest of the front face!
    front3DOutline.push({ x: 0, y: 0 });
    for (const [tx0, tx1] of lockTabSpans3D) {
      front3DOutline.push(
        { x: tx0 - reliefSlotW, y: 0 },
        { x: tx0 - reliefSlotW, y: recessH },
        { x: tx1 + reliefSlotW, y: recessH },
        { x: tx1 + reliefSlotW, y: 0 }
      );
    }
    front3DOutline.push({ x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H });

    // 2. Lid Top 3D Outline: p.y = 0 is World -Z (Back Spine), p.y = D is World +Z (Front crease).
    //    Carve the smooth D-shaped semicircular cutout inward from p.y = D to p.y = D - cutoutDepth!
    lid3DOutline.push({ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D });
    const reversedSpans = lockTabSpans3D.slice().reverse();
    for (const [tx0, tx1] of reversedSpans) {
      const sL = tx0 - slotClearance;
      const sR = tx1 + slotClearance;
      const rCut = Math.min(cutoutDepth * 0.85, (sR - sL) * 0.45);
      lid3DOutline.push({ x: sR, y: D });
      // Smooth rounded D-arch from (sR, D) inward to D - cutoutDepth and back to (sL, D)
      const archSteps = 8;
      for (let s = 0; s <= archSteps; s++) {
        const u = s / archSteps; // 0 (right) -> 1 (left)
        const angle = u * Math.PI; // 0 -> PI
        const midX = (sL + sR) / 2;
        const halfSpan = (sR - sL) / 2;
        const px = midX + Math.cos(angle) * halfSpan;
        const py = D - Math.sin(angle) * (cutoutDepth - rCut * 0.15);
        lid3DOutline.push({ x: px, y: py });
      }
      lid3DOutline.push({ x: sL, y: D });
    }
    lid3DOutline.push({ x: 0, y: D });

    // 3. Articulated 2-Score-Line Locking Tab Panels on the Front Wall:
    //    - `front-lock-root`: Hinged at Score Line 1 (`Y = H/2 - recessH`), folding back from the front face!
    //    - `front-lock-tongue`: Hinged at Score Line 2 (top of `front-lock-root`), folding 90° inward into the D-shaped cutout slot!
    const rootTiltRad = 0.28; // Folds ~16° back/inward from the front face (matching the orange reference carton!)
    const rootPivotY = H / 2 - recessH;
    const rootPivotZ = D / 2;
    const topRootY = rootPivotY + recessH * Math.cos(rootTiltRad);
    const topRootZ = rootPivotZ - recessH * Math.sin(rootTiltRad);

    lockTabSpans3D.forEach(([tx0, tx1], idx) => {
      const wTab = tx1 - tx0;
      const tabCenterX = (tx0 + tx1) / 2 - W / 2;
      const rTab = Math.min(4.5, tongueLen * 0.45, wTab * 0.28);

      const rootId = `front-lock-root-${idx + 1}`;
      lockTabPanels3D.push({
        id: rootId,
        name: 'Front Lock Tab Root (Score 1 — Folds Back from Face)',
        faceId: 'front',
        widthMm: wTab,
        heightMm: recessH,
        thicknessMm: T,
        color: '#c89e70',
        closedPos: [
          tabCenterX,
          rootPivotY + (recessH / 2) * Math.cos(rootTiltRad),
          rootPivotZ - (recessH / 2) * Math.sin(rootTiltRad),
        ],
        explodedPos: [tabCenterX, -H / 2, D / 2 + H - recessH / 2],
        rotation: [-rootTiltRad, 0, 0],
        foldRig: {
          parentId: 'front',
          pivotOffset: [tabCenterX, rootPivotY, rootPivotZ],
          axis: 'x',
          flatAngleRad: rootTiltRad,
          foldedAngleRad: 0,
          stage: [0.76, 0.96],
        },
      });

      // With rotation [Math.PI / 2, 0, 0], p.y = 0 maps to World +Z (Score Line 2 crease)
      // and p.y = tongueLen maps to World -Z (rounded inward tip seated inside the D-shaped lid cutout)!
      const tonguePts: Point2D[] = [
        { x: 0, y: 0 },
        { x: wTab, y: 0 },
        { x: wTab, y: tongueLen - rTab },
      ];
      const cornerSteps = 5;
      for (let s = 1; s <= cornerSteps; s++) {
        const a = (s / cornerSteps) * (Math.PI / 2);
        tonguePts.push({
          x: wTab - rTab + Math.cos(a) * rTab,
          y: tongueLen - rTab + Math.sin(a) * rTab,
        });
      }
      for (let s = 0; s <= cornerSteps; s++) {
        const a = Math.PI / 2 + (s / cornerSteps) * (Math.PI / 2);
        tonguePts.push({
          x: rTab + Math.cos(a) * rTab,
          y: tongueLen - rTab + Math.sin(a) * rTab,
        });
      }
      tonguePts.push({ x: 0, y: tongueLen - rTab });

      lockTabPanels3D.push({
        id: `front-lock-tab-${idx + 1}`,
        name: 'Front Lock Tab Tongue (Score 2 — Folds Into Slot)',
        faceId: 'front',
        widthMm: wTab,
        heightMm: tongueLen,
        thicknessMm: T,
        color: '#dfa56e',
        closedPos: [tabCenterX, topRootY, topRootZ - tongueLen / 2],
        explodedPos: [tabCenterX, -H / 2, D / 2 + H + tongueLen / 2],
        rotation: [Math.PI / 2, 0, 0],
        outlinePoints: tonguePts,
        foldRig: {
          parentId: rootId,
          pivotOffset: [tabCenterX, topRootY, topRootZ],
          axis: 'x',
          flatAngleRad: Math.PI / 2 - rootTiltRad,
          foldedAngleRad: 0,
          // Folds 90° inward at Score Line 2 into the D-cutout after the lid & inner tuck flap close!
          stage: [0.78, 1.0],
        },
      });
    });
  }

  // 3D Folding Rig Panels for the Mailer (Sequential Non-Overlapping Fold Stages):
  // 1. [0.00..0.24]: `front` & `back` walls fold up 90°
  // 2. [0.24..0.44]: 4 Side Dust Flaps (`back-dust-l/r`, `front-dust-l/r`) fold 90° inward
  // 3. [0.30..0.55]: `left` & `right` outer side walls fold up 90°
  // 4. [0.50..0.76]: `left-roll-bridge`/`right-roll-bridge` & `left-roll-inner`/`right-roll-inner` roll 180° over the dust flaps into the box
  // 5. [0.46..0.72]: `tuck-flap` folds 90° down, while [0.54..0.82] `top` closes over the box
  // 6. [0.76..1.00]: `front-lock-root` + `front-lock-tab` fold back & 90° inward into the D-shaped lid cutout
  const dustH3D = Math.max(8, H - 2 * dustInset);
  const panels3D: Panel3DTransform[] = [
    {
      id: 'bottom',
      name: 'Bottom Floor',
      faceId: 'bottom',
      widthMm: W,
      heightMm: D,
      thicknessMm: T,
      color: '#c69c6d',
      closedPos: [0, -H / 2, 0],
      explodedPos: [0, -H / 2, 0],
      rotation: [Math.PI / 2, 0, 0],
    },
    {
      id: 'front',
      name: 'Front Wall (With Joint Lock Tabs)',
      faceId: 'front',
      widthMm: W,
      heightMm: H,
      thicknessMm: T,
      color: '#d1a778',
      closedPos: [0, 0, D / 2],
      explodedPos: [0, -H / 2, D / 2 + H / 2],
      rotation: [0, 0, 0],
      outlinePoints: front3DOutline.length > 0 ? front3DOutline : undefined,
      foldRig: {
        pivotOffset: [0, -H / 2, D / 2],
        axis: 'x',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.0, 0.24],
      },
    },
    {
      id: 'back',
      name: 'Back Spine',
      faceId: 'back',
      widthMm: W,
      heightMm: H,
      thicknessMm: T,
      color: '#d1a778',
      closedPos: [0, 0, -D / 2],
      explodedPos: [0, -H / 2, -D / 2 - H / 2],
      rotation: [0, Math.PI, 0],
      foldRig: {
        pivotOffset: [0, -H / 2, -D / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.0, 0.24],
      },
    },
    // 4 Side Dust Flaps (attached to Back & Front walls; fold 90° inward after Front & Back reach vertical at t = 0.24)
    {
      id: 'back-dust-l',
      name: 'Left Back Dust Flap',
      faceId: 'back',
      widthMm: dustFlapW,
      heightMm: dustH3D,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [-W / 2, 0, -D / 2 + dustFlapW / 2],
      explodedPos: [-W / 2 - dustFlapW / 2, -H / 2, -D / 2 - H / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [-W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    {
      id: 'back-dust-r',
      name: 'Right Back Dust Flap',
      faceId: 'back',
      widthMm: dustFlapW,
      heightMm: dustH3D,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [W / 2, 0, -D / 2 + dustFlapW / 2],
      explodedPos: [W / 2 + dustFlapW / 2, -H / 2, -D / 2 - H / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'back',
        pivotOffset: [W / 2, 0, -D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    {
      id: 'front-dust-l',
      name: 'Left Front Dust Flap',
      faceId: 'front',
      widthMm: dustFlapW,
      heightMm: dustH3D,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [-W / 2, 0, D / 2 - dustFlapW / 2],
      explodedPos: [-W / 2 - dustFlapW / 2, -H / 2, D / 2 + H / 2],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'front',
        pivotOffset: [-W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    {
      id: 'front-dust-r',
      name: 'Right Front Dust Flap',
      faceId: 'front',
      widthMm: dustFlapW,
      heightMm: dustH3D,
      thicknessMm: T,
      color: '#b88c5d',
      closedPos: [W / 2, 0, D / 2 - dustFlapW / 2],
      explodedPos: [W / 2 + dustFlapW / 2, -H / 2, D / 2 + H / 2],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'front',
        pivotOffset: [W / 2, 0, D / 2],
        axis: 'y',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.24, 0.44],
      },
    },
    // Left & Right Outer Walls + Rollover Bridges + Inner Rollover Walls
    {
      id: 'left',
      name: 'Left Outer Wall',
      faceId: 'left',
      widthMm: D,
      heightMm: H,
      thicknessMm: T,
      color: '#bc9162',
      closedPos: [-W / 2, 0, 0],
      explodedPos: [-W / 2 - H / 2, -H / 2, 0],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        pivotOffset: [-W / 2, -H / 2, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.30, 0.55],
      },
    },
    {
      id: 'left-roll-bridge',
      name: 'Left Rollover Top Bridge',
      faceId: 'left',
      widthMm: rollGap,
      heightMm: D,
      thicknessMm: T,
      color: '#b38758',
      closedPos: [-W / 2 + rollGap / 2, H / 2, 0],
      explodedPos: [-W / 2 - H - rollGap / 2, -H / 2, 0],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'left',
        pivotOffset: [-W / 2, H / 2, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.48, 0.72],
      },
    },
    {
      id: 'left-roll-inner',
      name: 'Left Inner Rollover Wall',
      faceId: 'left',
      widthMm: D,
      heightMm: innerWallH,
      thicknessMm: T,
      color: '#ab7f50',
      closedPos: [-W / 2 + rollGap, H / 2 - innerWallH / 2, 0],
      explodedPos: [-W / 2 - H - rollGap - innerWallH / 2, -H / 2, 0],
      rotation: [0, -Math.PI / 2, 0],
      foldRig: {
        parentId: 'left-roll-bridge',
        pivotOffset: [-W / 2 + rollGap, H / 2, 0],
        axis: 'z',
        flatAngleRad: Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.54, 0.78],
      },
    },
    {
      id: 'right',
      name: 'Right Outer Wall',
      faceId: 'right',
      widthMm: D,
      heightMm: H,
      thicknessMm: T,
      color: '#bc9162',
      closedPos: [W / 2, 0, 0],
      explodedPos: [W / 2 + H / 2, -H / 2, 0],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        pivotOffset: [W / 2, -H / 2, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.30, 0.55],
      },
    },
    {
      id: 'right-roll-bridge',
      name: 'Right Rollover Top Bridge',
      faceId: 'right',
      widthMm: rollGap,
      heightMm: D,
      thicknessMm: T,
      color: '#b38758',
      closedPos: [W / 2 - rollGap / 2, H / 2, 0],
      explodedPos: [W / 2 + H + rollGap / 2, -H / 2, 0],
      rotation: [Math.PI / 2, 0, 0],
      foldRig: {
        parentId: 'right',
        pivotOffset: [W / 2, H / 2, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.48, 0.72],
      },
    },
    {
      id: 'right-roll-inner',
      name: 'Right Inner Rollover Wall',
      faceId: 'right',
      widthMm: D,
      heightMm: innerWallH,
      thicknessMm: T,
      color: '#ab7f50',
      closedPos: [W / 2 - rollGap, H / 2 - innerWallH / 2, 0],
      explodedPos: [W / 2 + H + rollGap + innerWallH / 2, -H / 2, 0],
      rotation: [0, Math.PI / 2, 0],
      foldRig: {
        parentId: 'right-roll-bridge',
        pivotOffset: [W / 2 - rollGap, H / 2, 0],
        axis: 'z',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.54, 0.78],
      },
    },
    {
      id: 'top',
      name: 'Mailer Lid Top (With D-Cutout)',
      faceId: 'top',
      widthMm: W,
      heightMm: D,
      thicknessMm: T,
      color: '#dbb386',
      closedPos: [0, H / 2, 0],
      explodedPos: [0, -H / 2, -D / 2 - H - D / 2],
      rotation: [-Math.PI / 2, 0, 0],
      outlinePoints: lid3DOutline.length > 0 ? lid3DOutline : undefined,
      foldRig: {
        parentId: 'back',
        pivotOffset: [0, H / 2, -D / 2],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        stage: [0.54, 0.82],
      },
    },
    {
      id: 'tuck-flap',
      name:
        lockStyle === 'cherry-ears'
          ? 'Inner Tuck Flap (With Cherry-Lock Side Ears)'
          : 'Inner Tuck Flap (Inside Front Wall)',
      faceId: 'tuck-flap',
      widthMm: lockStyle === 'cherry-ears' ? W + 2 * earW : W - 2 * tuckInset,
      heightMm: tuckH,
      thicknessMm: T,
      color: '#b5895a',
      // Sits INSIDE the box at Z = D/2 - T (behind Front Wall at Z = D/2)
      closedPos: [0, H / 2 - tuckH / 2, D / 2 - T],
      explodedPos: [0, -H / 2, -D / 2 - H - D - tuckH / 2],
      rotation: [0, 0, 0],
      outlinePoints:
        lockStyle === 'cherry-ears'
          ? [
              { x: earW, y: 0 },
              { x: earW + W, y: 0 },
              { x: earW + W, y: Math.min(4, tuckH * 0.25) },
              { x: 2 * earW + W, y: Math.min(4, tuckH * 0.25) },
              { x: 2 * earW + W, y: tuckH - rTuck },
              { x: 2 * earW + W - rTuck, y: tuckH },
              { x: rTuck, y: tuckH },
              { x: 0, y: tuckH - rTuck },
              { x: 0, y: Math.min(4, tuckH * 0.25) },
              { x: earW, y: Math.min(4, tuckH * 0.25) },
            ]
          : undefined,
      foldRig: {
        parentId: 'top',
        pivotOffset: [0, H / 2, D / 2 - T],
        axis: 'x',
        flatAngleRad: -Math.PI / 2,
        foldedAngleRad: 0,
        // Folds down FIRST before the lid finishes closing and before the front locking tab folds inward!
        stage: [0.46, 0.72],
      },
    },
    ...lockTabPanels3D,
  ];

  return {
    panels2D: [panel2D],
    panels3D,
    summary: `RETT Mailer (${fmt(totalW)} × ${fmt(totalH)} mm flat blank, inner tuck flap + front-wall tabs into joint cutouts)`,
  };
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
