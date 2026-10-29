import { describe, expect, it } from 'vitest';
import {
  HINGE_PATTERNS,
  MIN_SAFE_WEB_MM,
  closestShapesMm,
  hingeCuts,
  hingeMinWebMm,
  hingeShapePath,
  type HingePatternSettings,
  type HingeShape,
} from '../src/engine/livingHinge';
import { generateBoxModel } from '../src/engine/boxGenerator';
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

  it('for waves is a little under the row spacing, at the steepest slope', () => {
    // Amplitude 0.35 p over a wave 4 p long: slope 0.35 · 2π / 4. Straight lines at that slope would
    // sit p / √(1 + slope²) apart; the curve bends away from its neighbour, so a touch more.
    const slope = (0.35 * 2 * Math.PI) / 4;
    const web = hingeMinWebMm({ pattern: 'wave', pitchMm: 3, cutMm: 30, bridgeMm: 4 }, 0);
    expect(web).toBeGreaterThanOrEqual(3 / Math.hypot(1, slope));
    expect(web).toBeLessThan(3 / Math.hypot(1, slope) + 0.05);
  });

  it('for lattices is set by the bridge at each junction', () => {
    // Triangle: six slit ends 60° apart, each b/2 from the junction, so neighbours are b/2 apart.
    expect(hingeMinWebMm({ pattern: 'triangle', pitchMm: 7, cutMm: 0, bridgeMm: 2.8 }, 0)).toBeCloseTo(1.4, 6);
    // Honeycomb: three ends 120° apart, √3 · b/2 apart.
    expect(hingeMinWebMm({ pattern: 'honeycomb', pitchMm: 8, cutMm: 0, bridgeMm: 2 }, 0)).toBeCloseTo(Math.sqrt(3), 6);
  });

  it('shrinks as the bridge narrows, and warns below a millimetre', () => {
    const wide = hingeMinWebMm({ pattern: 'diamond', pitchMm: 6, cutMm: 0, bridgeMm: 3 }, 0.12);
    const narrow = hingeMinWebMm({ pattern: 'diamond', pitchMm: 6, cutMm: 0, bridgeMm: 1.2 }, 0.12);
    expect(narrow).toBeLessThan(wide);
    expect(narrow).toBeLessThan(MIN_SAFE_WEB_MM);
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
    raw.params.livingHingePattern = 'zigzag';
    expect(parseProject(JSON.stringify(raw)).params.livingHingePattern).toBe('straight');
  });
});
