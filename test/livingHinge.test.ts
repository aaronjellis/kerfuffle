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
import { wrapBendRadiusMm } from '../src/engine/fingerJointEngine';
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

    // The tongue's notch is in the middle of the front wall's top edge, one thickness deep.
    const notch = front.filter((v) => Math.abs(v.y - (lipBottom - T)) < 1e-6 && Math.abs(v.x) < innerW / 2);
    expect(notch.length).toBe(2);
  });
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
