import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HINGE_PATTERNS,
  HINGE_SHEAR_STRAIN,
  MIN_SAFE_WEB_MM,
  closestShapesMm,
  hingeBendRadiusMm,
  hingeCuts,
  hingeMinWebMm,
  hingeShapePath,
  type HingePatternSettings,
  type HingeShape,
} from '../src/engine/livingHinge';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { catchTongueEdge, catchTongueRadii, livingHingeCatch, wrapBendRadiusMm } from '../src/engine/fingerJointEngine';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { parseProject, serializeProject } from '../src/engine/projectFile';

const region = { x: 10, y: 20, width: 116, height: 36 };
const defaults = HINGE_PATTERNS.map((p) => ({ pattern: p.id, ...p.defaults }) as HingePatternSettings);

const length = (line: { x: number; y: number }[]) =>
  line.reduce((l, p, i) => (i === 0 ? 0 : l + Math.hypot(p.x - line[i - 1].x, p.y - line[i - 1].y)), 0);

describe.each(defaults)('$pattern pattern', (s) => {
  const cuts = hingeCuts(s, region);

  it('stays inside its region', () => {
    for (const shape of cuts) {
      for (const p of shape.flat()) {
        expect(p.x).toBeGreaterThanOrEqual(region.x - 1e-9);
        expect(p.x).toBeLessThanOrEqual(region.x + region.width + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(region.y - 1e-9);
        expect(p.y).toBeLessThanOrEqual(region.y + region.height + 1e-9);
      }
    }
  });

  it('never cuts the sheet in two: no cut runs from one side edge to the other', () => {
    const onSide = (p: { x: number }) => Math.abs(p.x - region.x) < 1e-6 || Math.abs(p.x - region.x - region.width) < 1e-6;
    for (const line of cuts.flat()) {
      expect(onSide(line[0]) && onSide(line[line.length - 1])).toBe(false);
    }
  });

  it('runs no cut along the top or bottom border, where the solid sheet begins', () => {
    for (const line of cuts.flat()) {
      expect(line.every((p) => p.y - region.y < 0.5)).toBe(false);
      expect(line.every((p) => region.y + region.height - p.y < 0.5)).toBe(false);
    }
  });

  it('keeps every web at least as wide as the measured narrowest web', () => {
    // Clipping only removes cuts, so the region can't come closer than the pattern itself.
    expect(closestShapesMm(cuts)).toBeGreaterThanOrEqual(hingeMinWebMm(s, 0) - 1e-6);
  });

  it('leaves at least a millimetre of wood between cuts at its default sizes', () => {
    expect(hingeMinWebMm(s, DEFAULT_BOX_PARAMETERS.kerfMm)).toBeGreaterThanOrEqual(MIN_SAFE_WEB_MM);
  });

  it('fills the region: cuts within a cell of every edge, and plenty of them', () => {
    const pts = cuts.flat(2);
    const reach = Math.max(s.pitchMm * 1.5, s.bridgeMm + 1);
    expect(Math.min(...pts.map((p) => p.x)) - region.x).toBeLessThan(reach + s.bridgeMm);
    expect(region.x + region.width - Math.max(...pts.map((p) => p.x))).toBeLessThan(reach + s.bridgeMm);
    expect(Math.min(...pts.map((p) => p.y)) - region.y).toBeLessThan(reach);
    expect(region.y + region.height - Math.max(...pts.map((p) => p.y))).toBeLessThan(reach);
    // At least a slit's worth of cut for every pitch × pitch of sheet, half that for lattices.
    const total = cuts.flat().reduce((l, line) => l + length(line), 0);
    expect(total / (region.width * region.height)).toBeGreaterThan(0.5 / s.pitchMm);
  });

  it('draws the same cuts as before', () => {
    const small = hingeCuts(s, { x: 0, y: 0, width: 40, height: 16 });
    expect(small.map(hingeShapePath).join('\n')).toMatchSnapshot();
  });
});

describe('narrowest web', () => {
  it('for straight slits is the row spacing or the bridge, less the kerf', () => {
    expect(hingeMinWebMm({ pattern: 'straight', pitchMm: 2.5, cutMm: 30, bridgeMm: 3.5 }, 0.12)).toBeCloseTo(2.38, 9);
    expect(hingeMinWebMm({ pattern: 'straight', pitchMm: 4, cutMm: 30, bridgeMm: 1.5 }, 0.1)).toBeCloseTo(1.4, 9);
  });

  it('for in-step waves and zigzags is the row spacing measured square to the slope', () => {
    for (const pattern of ['wave', 'zigzag'] as const) {
      const web = hingeMinWebMm({ pattern, pitchMm: 3, cutMm: 30, bridgeMm: 4 }, 0);
      expect(web).toBeLessThan(3);
      expect(web).toBeGreaterThan(2.4);
    }
  });

  it('for mirrored rows is the pinch, where the rows swing toward each other', () => {
    // Diamond rows swing 0.14 p each way, so neighbours pinch to p (1 − 2 · 0.14) at the tips.
    const web = hingeMinWebMm({ pattern: 'diamond', pitchMm: 2, cutMm: 36, bridgeMm: 2.5 }, 0);
    expect(web).toBeLessThanOrEqual(2 * (1 - 2 * 0.14) + 1e-6);
    expect(web).toBeGreaterThan(2 * (1 - 2 * 0.14) * 0.9);
  });
});

describe('bend radius estimate', () => {
  const T = 3;
  const kerf = 0.12;
  const lid = wrapBendRadiusMm(DEFAULT_BOX_PARAMETERS.depthMm, DEFAULT_BOX_PARAMETERS.heightMm);
  const straight = (pitchMm: number, cutMm: number, bridgeMm: number, k = kerf) =>
    hingeBendRadiusMm({ pattern: 'straight', pitchMm, cutMm, bridgeMm }, T, k);

  it('for straight slits matches the closed-form twisting-link formula', () => {
    // Links (30 − 3) / 2 long and 1.5 − 0.1 wide in 3 mm sheet: ratio 3 / 1.4, so α ≈ 0.250 and
    // β ≈ 0.236 (Roark). Each strip twists γ · α / (β c) · l, and strips sit p apart.
    const c = 1.4;
    const r = 3 / c;
    const alpha = 0.246 + ((0.258 - 0.246) * (r - 2)) / 0.5;
    const beta = 0.229 + ((0.249 - 0.229) * (r - 2)) / 0.5;
    const twist = (HINGE_SHEAR_STRAIN * alpha * 13.5) / (beta * c);
    expect(straight(1.5, 30, 3, 0.1)).toBeCloseTo(1.5 / twist, 1);
  });

  it('puts Boxes.py’s defaults, a pattern known to bend, at a tight radius', () => {
    // 3 mm sheet: rows 0.5 t apart, 1 t bridges, slits about 27 mm between bridges.
    const r = straight(1.5, 27, 3, 0.1);
    expect(r).toBeGreaterThan(12);
    expect(r).toBeLessThan(20);
  });

  it('finds the first release’s defaults too stiff for the default lid', () => {
    expect(straight(2.5, 30, 3.5)).toBeGreaterThan(lid);
    expect(hingeBendRadiusMm({ pattern: 'wave', pitchMm: 3, cutMm: 30, bridgeMm: 4 }, T, kerf)).toBeGreaterThan(lid);
  });

  it.each(defaults)('bends $pattern at its defaults tighter than the default lid', (s) => {
    expect(hingeBendRadiusMm(s, T, kerf)).toBeLessThan(lid);
  });

  it('bends tighter with closer rows, longer slits or a thinner kerf', () => {
    expect(straight(1.5, 30, 3)).toBeLessThan(straight(2, 30, 3));
    expect(straight(1.5, 40, 3)).toBeLessThan(straight(1.5, 30, 3));
    expect(straight(1.5, 30, 3, 0.05)).toBeGreaterThan(straight(1.5, 30, 3, 0.2));
  });

  it('finds mirrored rows stiffer than straight ones at the same sizes', () => {
    const at = { pitchMm: 1.6, cutMm: 36, bridgeMm: 2.5 };
    const flat = hingeBendRadiusMm({ pattern: 'straight', ...at }, T, kerf);
    for (const pattern of ['diamond', 'honeycomb', 'triangle'] as const) {
      expect(hingeBendRadiusMm({ pattern, ...at }, T, kerf)).toBeGreaterThan(flat);
    }
  });

  it('barely changes with sheet thickness once the web is thinner than the sheet', () => {
    const thin = hingeBendRadiusMm({ pattern: 'straight', pitchMm: 1.5, cutMm: 30, bridgeMm: 3 }, 3, kerf);
    const thick = hingeBendRadiusMm({ pattern: 'straight', pitchMm: 1.5, cutMm: 30, bridgeMm: 3 }, 6, kerf);
    expect(Math.abs(thick - thin) / thin).toBeLessThan(0.1);
  });

  it('is infinite when the kerf eats the whole web', () => {
    expect(straight(1, 30, 3, 1.2)).toBe(Infinity);
  });
});

describe('new row patterns', () => {
  const region = { x: 0, y: 0, width: 116, height: 30 };
  const onEdge = (pt: { x: number }) => Math.abs(pt.x) < 1e-6 || Math.abs(pt.x - region.width) < 1e-6;

  it('runs serpentine rows in from alternate side edges, one long strip across', () => {
    const cuts = hingeCuts({ pattern: 'serpentine', pitchMm: 2, cutMm: 30, bridgeMm: 4 }, region);
    const rows = cuts.map((c) => c[0]).sort((a, b) => a[0].y - b[0].y);
    rows.forEach((line, i) => {
      const left = Math.min(line[0].x, line[line.length - 1].x);
      const right = Math.max(line[0].x, line[line.length - 1].x);
      // Each row touches one side edge and stops a bridge short of the other, sides alternating.
      expect(onEdge({ x: left }) !== onEdge({ x: right })).toBe(true);
      if (i > 0) expect(onEdge({ x: left })).toBe(!onEdge({ x: Math.min(rows[i - 1][0].x, rows[i - 1][rows[i - 1].length - 1].x) }));
      expect(right - left).toBeCloseTo(region.width - 4, 6);
    });
  });

  it('bends a serpentine tighter the wider its hinge, and further than any slit pattern', () => {
    const s = { pattern: 'serpentine' as const, pitchMm: 2, cutMm: 30, bridgeMm: 4 };
    expect(hingeBendRadiusMm(s, 3, 0.12, 116)).toBeLessThan(hingeBendRadiusMm(s, 3, 0.12, 50));
    expect(hingeBendRadiusMm(s, 3, 0.12, 50)).toBeLessThan(
      hingeBendRadiusMm({ ...s, pattern: 'straight' }, 3, 0.12),
    );
  });

  it('finds brick stiffer than straight at the same sizes: its bridges a third apart make short links', () => {
    const at = { pitchMm: 1.5, cutMm: 36, bridgeMm: 3 };
    expect(hingeBendRadiusMm({ pattern: 'brick', ...at }, 3, 0.12)).toBeGreaterThan(
      hingeBendRadiusMm({ pattern: 'straight', ...at }, 3, 0.12),
    );
  });

  it('staggers brick rows in thirds of a step', () => {
    const cuts = hingeCuts({ pattern: 'brick', pitchMm: 2, cutMm: 30, bridgeMm: 3 }, { x: -200, y: 0, width: 400, height: 8 });
    const starts = (y: number) =>
      cuts
        .map((c) => c[0])
        .filter((l) => Math.abs(l[0].y - y) < 1e-6 && l[0].x > -150 && l[0].x < 150)
        .map((l) => (((l[0].x % 33) + 33) % 33).toFixed(3));
    const ys = [...new Set(cuts.map((c) => c[0][0].y.toFixed(6)))].map(Number).sort((a, b) => a - b);
    const phases = ys.slice(0, 3).map((y) => Number(starts(y)[0]));
    const diffs = [phases[1] - phases[0], phases[2] - phases[1]].map((d) => ((d % 33) + 33) % 33);
    diffs.forEach((d) => expect(d).toBeCloseTo(11, 6));
  });

  it('cuts a split bridge’s cross-cut through the middle of every bridge, clear of the next rows', () => {
    const s = { pattern: 'split' as const, pitchMm: 1.8, cutMm: 36, bridgeMm: 3 };
    const cuts = hingeCuts(s, region);
    const crosses = cuts.filter((c) => c[0].length === 2 && Math.abs(c[0][0].x - c[0][1].x) < 1e-9);
    expect(crosses.length).toBeGreaterThan(10);
    expect(hingeMinWebMm(s, 0.12)).toBeGreaterThanOrEqual(MIN_SAFE_WEB_MM);
    // The cross-cuts add bridge give the estimate leaves out, so it matches straight slits.
    expect(hingeBendRadiusMm(s, 3, 0.12)).toBeCloseTo(hingeBendRadiusMm({ ...s, pattern: 'straight' }, 3, 0.12), 9);
  });

  it('keeps chevron rows parallel, so the strips between them stay one width', () => {
    const s = { pattern: 'chevron' as const, pitchMm: 1.6, cutMm: 30, bridgeMm: 3 };
    // A V rising 2 p over half a 33 mm step slopes 3.2 / 16.5; neighbours sit p apart square to that,
    // a little less where one row's V tip points into the next.
    const square = 1.6 / Math.hypot(1, (2 * 1.6) / 16.5);
    const web = hingeMinWebMm(s, 0);
    expect(web).toBeLessThanOrEqual(square + 1e-9);
    expect(web).toBeGreaterThan(0.9 * square);
  });
});

describe('closestShapesMm', () => {
  it('ignores a shape crossing itself and measures between shapes', () => {
    const plus: HingeShape = [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      [{ x: 2, y: -2 }, { x: 2, y: 2 }],
    ];
    const bar: HingeShape = [[{ x: 7, y: -5 }, { x: 7, y: 5 }]];
    expect(closestShapesMm([plus, bar])).toBeCloseTo(3, 9);
  });
});

describe('living-hinge box closing', () => {
  /** A panel's outline in world space. */
  const world = (p: { outlinePoints?: { x: number; y: number }[]; widthMm: number; heightMm: number; rotation: [number, number, number]; closedPos: [number, number, number] }) =>
    p.outlinePoints!.map((pt) =>
      new THREE.Vector3(pt.x - p.widthMm / 2, -(pt.y - p.heightMm / 2), 0)
        .applyEuler(new THREE.Euler(...p.rotation))
        .add(new THREE.Vector3(...p.closedPos)),
    );

  it.each([
    [110, 80, 55, 'one-piece-back'],
    [160, 120, 90, 'finger-joint-back'],
    [80, 60, 40, 'side-arch-tabs'],
  ] as const)('leaves the lid’s front lip band clear at %i × %i × %i (%s)', (w, d, h, attach) => {
    const params = {
      ...DEFAULT_BOX_PARAMETERS,
      templateId: 'finger-living-hinge' as const,
      widthMm: w,
      depthMm: d,
      heightMm: h,
      kerfMm: 0,
      livingHingeAttachMode: attach,
    };
    const m = generateBoxModel(params);
    const { widthMm: innerW, depthMm: innerD, heightMm: innerH } = m.innerDims;
    const T = params.materialThicknessMm;
    const straightH = Math.max(15, innerH - wrapBendRadiusMm(innerD, innerH));
    const lipBottom = -innerH / 2 + straightH - Math.min(14, straightH * 0.38);
    const panel = (id: string) => m.panels3D.find((p) => p.id === id)!;

    // The front wall stops where the lip begins: nothing of it above the lip's bottom edge.
    const front = world(panel('front'));
    expect(Math.max(...front.map((v) => v.y))).toBeLessThanOrEqual(lipBottom + 1e-6);

    // The side walls reach into the front wall's plane only below the lip.
    for (const side of ['left', 'right']) {
      for (const v of world(panel(side))) {
        if (v.z > innerD / 2 + 1e-6) expect(v.y).toBeLessThanOrEqual(lipBottom + 1e-6);
      }
    }

    // Their front fingers still mate with the front wall's: at zero kerf every step of a side
    // wall's front fingers lands on a step of the front wall's matching edge.
    const key = (y: number) => y.toFixed(4);
    const frontSteps = (sign: number) =>
      new Set(front.filter((v) => sign * v.x > innerW / 2 + 1e-6).map((v) => key(v.y)));
    for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
      const steps = [...new Set(world(panel(side)).filter((v) => v.z > innerD / 2 + 1e-6).map((v) => key(v.y)))];
      expect(steps.length).toBeGreaterThanOrEqual(2);
      for (const y of steps) expect(frontSteps(sign).has(y)).toBe(true);
    }

    // The tongue's notch is in the middle of the front wall's top edge, the tongue's height deep.
    const tongueH = livingHingeCatch(params, innerW, straightH - Math.min(14, straightH * 0.38)).height;
    const notch = front.filter((v) => Math.abs(v.y - (lipBottom - tongueH)) < 1e-6 && Math.abs(v.x) < innerW / 2);
    expect(notch.length).toBe(2);
  });
});

describe('living-hinge wrap fit', () => {
  const params = { ...DEFAULT_BOX_PARAMETERS, templateId: 'finger-living-hinge' as const, kerfMm: 0.2 };
  const m = generateBoxModel(params);
  const { widthMm: innerW, depthMm: innerD, heightMm: innerH } = m.innerDims;
  const T = params.materialThicknessMm;
  const R = wrapBendRadiusMm(innerD, innerH);
  const straightH = Math.max(15, innerH - R);
  const lip = Math.min(14, straightH * 0.38);
  const tongue = livingHingeCatch(params, innerW, straightH - lip);
  const catchW = tongue.width;
  const wrap = m.panels2D.find((p) => p.id === 'top')!;
  const pts = (d: string) =>
    [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((x) => ({ x: Number(x[1]), y: Number(x[2]) }));
  const outline = pts(wrap.paths.find((p) => p.id === 'living-wrap-outline')!.d);

  it('cuts each shoulder to its length at mid-thickness, so the closed lid reaches the front wall', () => {
    // Tongue, lip, two shoulders, deck, back wall and its bottom fingers, end to end.
    const shoulder = (Math.PI * (R + T / 2)) / 2;
    const deck = Math.max(10, innerD - 2 * R);
    expect(wrap.heightMm).toBeCloseTo(tongue.height + lip + 2 * shoulder + deck + straightH + T, 3);
  });

  it('draws the tongue a kerf wider and the notch a kerf narrower, so they press-fit like the fingers', () => {
    // The wrap lies end for end: the tongue is at the bottom of the piece. Its width is measured
    // along its straight sides, below the root fillets.
    const { root } = catchTongueRadii(catchW, tongue.height);
    const sides = outline.filter((p) => p.y > wrap.heightMm - tongue.height + root + 1e-3);
    expect(Math.max(...sides.map((p) => p.x)) - Math.min(...sides.map((p) => p.x))).toBeCloseTo(catchW + 0.2, 3);
    const front = m.panels3D.find((p) => p.id === 'front')!.outlinePoints!;
    const notchSides = front.filter((p) => p.y > T + root + 0.1 + 1e-3 && p.y < T + tongue.height + 1e-3 && Math.abs(p.x - (T + innerW / 2)) < catchW);
    expect(Math.max(...notchSides.map((p) => p.x)) - Math.min(...notchSides.map((p) => p.x))).toBeCloseTo(catchW - 0.2, 3);
  });

  it('lays the wrap back wall up, so deck artwork reads from the front of the box', () => {
    // The deck sits nearer the tongue (bottom) than the back wall (top) by the lip less the back wall.
    const deckMid = wrap.safeRect.y + wrap.safeRect.height / 2;
    const fromTongue = wrap.heightMm - deckMid;
    expect(fromTongue).toBeCloseTo(tongue.height + lip + (Math.PI * (R + T / 2)) / 2 + wrap.safeRect.height / 2, 3);
  });
});

describe('living-hinge catch and guides', () => {
  const base = { ...DEFAULT_BOX_PARAMETERS, templateId: 'finger-living-hinge' as const, kerfMm: 0.2 };
  const wrapOf = (p: typeof base) => generateBoxModel(p).panels2D.find((x) => x.id === 'top')!;
  const outlinePts = (d: string) =>
    [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((x) => ({ x: Number(x[1]), y: Number(x[2]) }));

  it('cuts a rounded finger hole through the middle of the tongue, inside it', () => {
    const wrap = wrapOf(base);
    const hole = outlinePts(wrap.paths.find((p) => p.id === 'lh-catch-finger-hole')!.d);
    const outline = outlinePts(wrap.paths.find((p) => p.id === 'living-wrap-outline')!.d);
    const tip = outline.filter((p) => p.y > wrap.heightMm - 4).map((p) => p.x);
    const xs = hole.map((p) => p.x);
    const ys = hole.map((p) => p.y);
    // 16 × 8 mm, centred across the tongue, with wood all round it.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(16, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(8, 3);
    expect(Math.min(...xs)).toBeGreaterThan(Math.min(...tip) + 3);
    expect(Math.max(...xs)).toBeLessThan(Math.max(...tip) - 3);
    expect(Math.max(...ys)).toBeLessThan(wrap.heightMm - 2);
  });

  it('rounds the tongue’s tip corners and its root, symmetric, from the root line round to the root line', () => {
    const edge = catchTongueEdge(24, 13, 3, 1.5);
    expect(edge[0]).toEqual({ x: -12 - 1.5, y: 0 });
    expect(edge[edge.length - 1].x).toBeCloseTo(12 + 1.5, 9);
    expect(edge[edge.length - 1].y).toBeCloseTo(0, 9);
    expect(Math.max(...edge.map((p) => p.y))).toBeCloseTo(13, 9);
    // Mirror image across the middle.
    edge.forEach((p, i) => {
      const q = edge[edge.length - 1 - i];
      expect(p.x).toBeCloseTo(-q.x, 9);
      expect(p.y).toBeCloseTo(q.y, 9);
    });
    // No corner is sharp: every turn between pieces is gentle.
    for (let i = 1; i + 1 < edge.length; i++) {
      const a = Math.atan2(edge[i].y - edge[i - 1].y, edge[i].x - edge[i - 1].x);
      const b = Math.atan2(edge[i + 1].y - edge[i].y, edge[i + 1].x - edge[i].x);
      const turn = Math.abs(((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      expect(turn).toBeLessThan(Math.PI / 6);
    }
  });

  it('shapes the front wall’s notch exactly as the tongue at zero kerf, so the rounded corners mate', () => {
    const m = generateBoxModel({ ...base, kerfMm: 0 });
    const wrap = m.panels2D.find((x) => x.id === 'top')!;
    const outline = outlinePts(wrap.paths.find((p) => p.id === 'living-wrap-outline')!.d);
    const front = m.panels3D.find((x) => x.id === 'front')!.outlinePoints!;
    const T = base.materialThicknessMm;
    const tipY = wrap.heightMm;
    const innerW = m.innerDims.widthMm;
    const innerH = m.innerDims.heightMm;
    const straightH = Math.max(15, innerH - wrapBendRadiusMm(m.innerDims.depthMm, innerH));
    const { width, height } = livingHingeCatch(base, innerW, straightH - Math.min(14, straightH * 0.38));
    const key = (x: number) => x.toFixed(3);
    const tongueTip = outline.filter((p) => p.y > tipY - 0.5).map((p) => key(p.x - wrap.widthMm / 2)).sort();
    // The notch's floor, in the front wall's frame: its top inner line at y = T.
    const notchFloor = front
      .filter((p) => p.y > T + height - 0.5 && p.y < T + height + 1e-6 && Math.abs(p.x - (T + innerW / 2)) < width)
      .map((p) => key(p.x - (T + innerW / 2)))
      .sort();
    expect(notchFloor).toEqual(tongueTip);
  });

  it('keeps a plain one-thickness tongue with the hole switched off, or where the front wall is too short', () => {
    expect(wrapOf({ ...base, livingHingeThumbHole: false }).paths.some((p) => p.id === 'lh-catch-finger-hole')).toBe(false);
    expect(livingHingeCatch({ ...base, livingHingeThumbHole: true }, 110, 14).hole).toBeNull();
    expect(livingHingeCatch({ ...base, livingHingeThumbHole: false }, 110, 40).height).toBe(base.materialThicknessMm);
  });

  it('sizes the tongue round the hole set, with wood all round, and shrinks a hole too big for the box', () => {
    const c = livingHingeCatch({ ...base, livingHingeThumbHoleWidthMm: 20, livingHingeThumbHoleHeightMm: 10 }, 110, 40);
    expect(c.hole).toEqual({ width: 20, height: 10 });
    expect(c).toMatchObject({ width: 28, height: 15, shrunk: false });
    // A 19.8 mm front wall leaves 19.8 − 6 − 5 for the hole's height.
    const tall = livingHingeCatch({ ...base, livingHingeThumbHoleHeightMm: 30 }, 110, 19.8);
    expect(tall.hole!.height).toBeCloseTo(8.8, 9);
    expect(tall.shrunk).toBe(true);
    // Across a 50 mm front the tongue may take 60%, so the hole 22 mm.
    expect(livingHingeCatch({ ...base, livingHingeThumbHoleWidthMm: 40 }, 50, 40).hole!.width).toBeCloseTo(22, 9);
  });

  it.each(['one-piece-back', 'finger-joint-back'] as const)(
    'adds loose guide notches to the deck and tabs to the side walls with %s',
    (attach) => {
      const m = generateBoxModel({ ...base, livingHingeAttachMode: attach, livingHingeTopGuides: true });
      const wrap = m.panels2D.find((x) => x.id === 'top')!;
      const outline = outlinePts(wrap.paths.find((p) => p.id === 'living-wrap-outline')!.d);
      const T = base.materialThicknessMm;
      // Each notch's floor sits one thickness in from a side edge, as long as the tab, no kerf offset.
      for (const x of [T, wrap.widthMm - T]) {
        const { y, height } = wrap.safeRect;
        const floor = outline.filter((p) => Math.abs(p.x - x) < 1e-3 && p.y > y && p.y < y + height).map((p) => p.y);
        expect(floor).toHaveLength(2);
        const topFlatD = Math.max(10, m.innerDims.depthMm - 2 * wrapBendRadiusMm(m.innerDims.depthMm, m.innerDims.heightMm));
        expect(Math.abs(floor[0] - floor[1])).toBeCloseTo(Math.min(16, Math.max(6, topFlatD * 0.45)), 3);
      }
      // The side walls grow their tab: a thickness taller than without guides.
      const plain = generateBoxModel({ ...base, livingHingeAttachMode: attach, livingHingeTopGuides: false });
      const left = (mm: typeof m) => mm.panels2D.find((x) => x.id === 'left')!.heightMm;
      expect(left(m)).toBeCloseTo(left(plain) + T, 6);
    },
  );
});

describe('living-hinge box', () => {
  const base = { ...DEFAULT_BOX_PARAMETERS, templateId: 'finger-living-hinge' as const };

  it.each(defaults)('cuts the $pattern pattern into both bends of the wrap', (s) => {
    const m = generateBoxModel({
      ...base,
      livingHingePattern: s.pattern,
      livingHingePitchMm: s.pitchMm,
      livingHingeCutMm: s.cutMm,
      livingHingeBridgeMm: s.bridgeMm,
    });
    const wrap = m.panels2D.find((p) => p.paths.some((x) => x.id.startsWith('lh-z1-')))!;
    const z1 = wrap.paths.filter((x) => x.id.startsWith('lh-z1-'));
    const z2 = wrap.paths.filter((x) => x.id.startsWith('lh-z2-'));
    expect(z1.length).toBeGreaterThan(10);
    expect(z2.length).toBe(z1.length);
    expect(z1.every((x) => x.layer === 'cut' && !x.closed)).toBe(true);
  });

  it('opens an old project, which has no pattern, as straight slits', () => {
    const text = serializeProject({ params: base, artworks: [], displayUnit: 'mm' });
    const raw = JSON.parse(text);
    delete raw.params.livingHingePattern;
    expect(parseProject(JSON.stringify(raw)).params.livingHingePattern).toBe('straight');
    // A pattern since retired opens as straight, with straight's sizes rather than its own.
    raw.params.livingHingePattern = 'cross';
    raw.params.livingHingePitchMm = 3;
    const opened = parseProject(JSON.stringify(raw)).params;
    expect(opened.livingHingePattern).toBe('straight');
    expect(opened.livingHingePitchMm).toBe(DEFAULT_BOX_PARAMETERS.livingHingePitchMm);
  });
});
