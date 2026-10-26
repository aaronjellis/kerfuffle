import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS, EXPORT_PROFILES, MATERIAL_PRESETS, laserSettingsFor } from '../src/engine/presets';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { XCS_DEVICE_M2, buildXcsDisplays, buildXcsProject, uuidV4 } from '../src/engine/xcsExporter';
import { effectiveLayer, exportBoxDxf, exportBoxSvg, exportXcsProject } from '../src/engine/exporters';
import type { BoxParameters, GeneratedBoxModel } from '../src/engine/types';

describe('laserSettingsFor', () => {
  it('returns the matching preset settings for E-flute', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      materialThicknessMm: 1.5,
    });
    expect(laser).toEqual({ cutPower: 90, cutSpeed: 10, cutPasses: 1, scorePower: 18, scoreSpeed: 100 });
  });

  it('falls back to the first preset of the category for an unknown thickness', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      materialThicknessMm: 2.2,
    });
    const first = MATERIAL_PRESETS.find((m) => m.category === 'cardboard-fold')!;
    expect(laser).toEqual(first.laser);
  });

  it('matches within 0.01 mm', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      materialThicknessMm: 6.005,
    });
    expect(laser.cutPasses).toBe(2);
  });

  it('every preset carries a laser block', () => {
    for (const m of MATERIAL_PRESETS) {
      expect(m.laser).toBeDefined();
      expect(Object.keys(m.laser).sort()).toEqual(
        ['cutPasses', 'cutPower', 'cutSpeed', 'scorePower', 'scoreSpeed']
      );
    }
  });
});

const fingerModel = (p: Partial<BoxParameters> = {}) => generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, ...p });
const mailerModel = (p: Partial<BoxParameters> = {}) =>
  generateBoxModel({
    ...DEFAULT_BOX_PARAMETERS,
    category: 'cardboard-fold',
    templateId: 'cardboard-mailer',
    materialThicknessMm: 1.5,
    ...p,
  });
const countM = (d: string) => (d.match(/M/g) || []).length;
const seqIds = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe('buildXcsDisplays', () => {
  it('emits one display per cut or score path, never guides', () => {
    const model = fingerModel();
    const { displays, layerOf } = buildXcsDisplays(model);
    const expected = model.panels2D.flatMap((p) => p.paths).filter((p) => p.layer !== 'guide').length;
    expect(expected).toBeGreaterThan(0);
    expect(displays).toHaveLength(expected);
    expect(layerOf.size).toBe(expected);
    for (const d of displays) {
      expect(d.dPath.startsWith('M')).toBe(true);
      expect(d.name.endsWith('guide')).toBe(false);
      expect(d.type).toBe('PATH');
    }
  });

  it('bakes the panel offset into absolute mm and sizes the box from it', () => {
    const model = fingerModel();
    const { displays } = buildXcsDisplays(model);
    const front = model.panels2D.find((p) => p.id === 'front')!;
    const d = displays.find((x) => x.name.startsWith(front.name))!;
    expect(d.x).toBeCloseTo(front.sheetX, 0);
    expect(d.y).toBeCloseTo(front.sheetY, 0);
    expect(d.width).toBeGreaterThan(0);
    expect(d.height).toBeGreaterThan(0);
    expect(d.offsetX).toBe(d.x);
    expect(d.offsetY).toBe(d.y);
  });

  it('colors cut and score from the active export profile', () => {
    const { displays, layerOf } = buildXcsDisplays(mailerModel());
    const cut = displays.find((d) => layerOf.get(d.id) === 'cut')!;
    const score = displays.find((d) => layerOf.get(d.id) === 'score')!;
    expect(cut.layerColor).toBe('#FF0000');
    expect(cut.originColor).toBe('#FF0000');
    expect(cut.layerTag).toBe('#FF0000');
    expect(cut.lineColor).toBe(0xff0000);
    expect(score.layerColor).toBe('#0000FF');
    expect(score.lineColor).toBe(0x0000ff);
    expect(cut.name.endsWith('· cut')).toBe(true);
    expect(score.name.endsWith('· score')).toBe(true);
  });

  it('keeps the tuck mailer thumb-notch arc as an A command', () => {
    const { displays } = buildXcsDisplays(mailerModel({ thumbNotch: true, cardboardLockStyle: 'tuck' }));
    expect(displays.some((d) => d.dPath.includes('A '))).toBe(true);
  });

  it('sizes the bounding box from the sampled arc, not just its end points', () => {
    // The mailer's notch arc curves inward, so it never reaches the bbox edge; a lone arc shows the bulge.
    const model = {
      ...mailerModel(),
      panels2D: [
        {
          ...mailerModel().panels2D[0],
          id: 'arc',
          name: 'Arc',
          sheetX: 10,
          sheetY: 50,
          paths: [{ id: 'a', layer: 'cut', d: 'M 0 0 L 4 0 A 10 10 0 0 1 24 0 L 28 0', closed: false }],
        },
      ],
    } as GeneratedBoxModel;
    const [d] = buildXcsDisplays(model).displays;
    expect(d.dPath).toContain('A ');
    const verts = [...d.dPath.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => +m[2]);
    const vertExtent = Math.max(...verts) - Math.min(...verts);
    expect(d.height - vertExtent).toBeGreaterThanOrEqual(1);
    expect(d.height).toBeCloseTo(10, 1);
    expect(d.width).toBeCloseTo(28, 3);
    expect(d.x).toBeCloseTo(10, 3);
  });

  it('marks dashed perforations as compound paths', () => {
    const { displays } = buildXcsDisplays(mailerModel({ scoreLineMode: 'dashed-perf' }));
    expect(displays.some((d) => d.isCompoundPath && countM(d.dPath) > 3)).toBe(true);
    for (const d of displays) expect(d.isCompoundPath).toBe(countM(d.dPath) > 1);
  });

  it('groups every path of a panel under one tag, distinct per panel', () => {
    const mailer = buildXcsDisplays(mailerModel(), seqIds()).displays;
    expect(new Set(mailer.map((d) => d.groupTag)).size).toBe(1);
    for (const d of mailer) expect(d.groupTags).toEqual([d.groupTag]);

    const model = fingerModel({ scoreInnerFaceLabels: true });
    const finger = buildXcsDisplays(model).displays;
    const tagsOf = (panelId: string) => {
      const name = model.panels2D.find((p) => p.id === panelId)!.name;
      const mine = finger.filter((d) => d.name.startsWith(`${name} ·`));
      expect(mine.length).toBeGreaterThan(1);
      return new Set(mine.map((d) => d.groupTag));
    };
    const front = tagsOf('front');
    const back = tagsOf('back');
    expect(front.size).toBe(1);
    expect(back.size).toBe(1);
    expect([...front][0]).not.toBe([...back][0]);
  });

  it('numbers zOrder in sequence and uses the injected id generator', () => {
    const { displays } = buildXcsDisplays(mailerModel(), seqIds());
    displays.forEach((d, i) => expect(d.zOrder).toBe(i));
    expect(new Set(displays.map((d) => d.id)).size).toBe(displays.length);
    expect(displays.every((d) => d.id.startsWith('id-'))).toBe(true);
  });
});

type Entry = {
  type: string;
  isFill: boolean;
  processingType: string;
  data: Record<string, { parameter: { customize: { power: number; speed: number; repeat: number } } }>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parse = (model: GeneratedBoxModel): any => JSON.parse(exportXcsProject(model));
const processingMap = (project: any): Map<string, Entry> => {
  const [[, canvas]] = project.device.data.value;
  return new Map(canvas.displays.value);
};

describe('exportXcsProject', () => {
  it('ties the canvas id through the envelope and the processing map', () => {
    const project = parse(mailerModel());
    expect(project.canvas[0].id).toBe(project.canvasId);
    expect(project.device.data.dataType).toBe('Map');
    const [[canvasKey, canvas]] = project.device.data.value;
    expect(canvasKey).toBe(project.canvasId);
    expect(canvas.mode).toBe('LASER_PLANE');
    expect(canvas.data.LASER_PLANE.thickness).toBe(1.5);
    expect(canvas.displays.dataType).toBe('Map');
  });

  it('lists every display exactly once in the processing map with a matching type', () => {
    const project = parse(fingerModel({ scoreInnerFaceLabels: true }));
    const displays = project.canvas[0].displays as { id: string; type: string }[];
    const [[, canvas]] = project.device.data.value;
    const keys = (canvas.displays.value as [string, Entry][]).map(([k]) => k);
    expect(keys.length).toBe(displays.length);
    expect(new Set(keys).size).toBe(keys.length);
    const map = processingMap(project);
    for (const d of displays) {
      expect(map.get(d.id)?.type).toBe('PATH');
      expect(map.get(d.id)?.type).toBe(d.type);
    }
  });

  it('assigns cut and score processing from the material preset', () => {
    const project = parse(mailerModel());
    const map = processingMap(project);
    const displays = project.canvas[0].displays as { id: string; layerColor: string }[];
    const cut = displays.find((d) => d.layerColor === '#FF0000')!;
    const score = displays.find((d) => d.layerColor === '#0000FF')!;
    const cutEntry = map.get(cut.id)!;
    expect(cutEntry.processingType).toBe('VECTOR_CUTTING');
    expect(cutEntry.data.VECTOR_CUTTING.parameter.customize).toMatchObject({ power: 90, speed: 10, repeat: 1 });
    const scoreEntry = map.get(score.id)!;
    expect(scoreEntry.processingType).toBe('VECTOR_ENGRAVING');
    expect(scoreEntry.data.VECTOR_ENGRAVING.parameter.customize).toMatchObject({ power: 18, speed: 100, repeat: 1 });
  });

  it('keeps panel grouping in the parsed project', () => {
    const mailer = parse(mailerModel()).canvas[0].displays as { groupTag: string }[];
    expect(new Set(mailer.map((d) => d.groupTag)).size).toBe(1);

    const model = fingerModel({ scoreInnerFaceLabels: true });
    const finger = parse(model).canvas[0].displays as { name: string; groupTag: string }[];
    const tags = (id: string) => {
      const name = model.panels2D.find((p) => p.id === id)!.name;
      return new Set(finger.filter((d) => d.name.startsWith(`${name} ·`)).map((d) => d.groupTag));
    };
    expect(tags('front').size).toBe(1);
    expect(tags('back').size).toBe(1);
    expect([...tags('front')][0]).not.toBe([...tags('back')][0]);
  });

  it('round-trips through JSON without NaN', () => {
    for (const model of [fingerModel(), mailerModel({ scoreLineMode: 'dashed-perf' }), mailerModel({ cardboardLockStyle: 'tuck' })]) {
      const text = exportXcsProject(model);
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('null');
      expect(JSON.stringify(JSON.parse(text))).toBe(text);
    }
  });

  it('declares exactly the layer colors used', () => {
    const cutOnly = parse(fingerModel());
    expect(Object.keys(cutOnly.canvas[0].layerData)).toEqual(['#FF0000']);
    const both = parse(mailerModel());
    expect(Object.keys(both.canvas[0].layerData).sort()).toEqual(['#0000FF', '#FF0000']);
    for (const [hex, layer] of Object.entries(both.canvas[0].layerData)) {
      expect(layer).toMatchObject({ name: hex, visible: true });
    }
  });

  it('stamps the injected time and device template', () => {
    const now = 1_761_500_000_000;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = buildXcsProject(mailerModel(), { ...XCS_DEVICE_M2, extra: { deviceCode: 'M2' } }, now) as any;
    expect(project.created).toBe(now);
    expect(project.modify).toBe(now);
    expect(project.extId).toBe('M2');
    expect(project.extName).toBe('xTool M2');
    expect(project.version).toBe('1.7.24');
    expect(project.device).toMatchObject({ id: 'M2-1', extId: 'M2', extName: 'xTool M2', power: 10, deviceCode: 'M2' });
    expect(project.device.data.dataType).toBe('Map');
    expect(project.canvas[0].title).toBe('{panel}1');
    expect(project.canvas[0].extendInfo.version).toBe('2.15.108');
  });

  it('matches buildXcsDisplays geometry', () => {
    const model = mailerModel();
    const project = parse(model);
    const { displays } = buildXcsDisplays(model);
    expect(project.canvas[0].displays.map((d: { dPath: string }) => d.dPath)).toEqual(displays.map((d) => d.dPath));
  });
});

describe('perforation processing', () => {
  const processingOf = (model: GeneratedBoxModel) => {
    const project = parse(model);
    return {
      map: processingMap(project),
      displays: project.canvas[0].displays as { id: string; name: string; layerColor: string; layerTag: string }[],
    };
  };
  const profile = EXPORT_PROFILES['xtool-studio'];

  it('puts dashed perforations on the cut color with cut processing; labels stay scores', () => {
    const model = mailerModel({ scoreLineMode: 'dashed-perf', scoreInnerFaceLabels: true });
    const paths = model.panels2D.flatMap((p) => p.paths);
    const folds = paths.filter((p) => p.layer === 'score' && p.isFoldScore);
    expect(folds.length).toBeGreaterThan(0);
    const { map, displays } = processingOf(model);

    // Cut-colored displays are the cut paths plus every dashed fold.
    const cuts = displays.filter((d) => d.layerColor === profile.cutColor);
    expect(cuts.length).toBe(paths.filter((p) => p.layer === 'cut').length + folds.length);
    for (const d of cuts) {
      expect(d.layerTag).toBe(profile.cutColor);
      expect(d.name.endsWith('· cut')).toBe(true);
      expect(map.get(d.id)!.processingType).toBe('VECTOR_CUTTING');
      expect(map.get(d.id)!.data.VECTOR_CUTTING.parameter.customize).toMatchObject({ power: 90, speed: 10, repeat: 1 });
    }

    const labels = displays.filter((d) => d.layerColor === profile.scoreColor);
    expect(labels.length).toBeGreaterThan(0);
    for (const d of labels) {
      expect(d.layerTag).toBe(profile.scoreColor);
      expect(d.name.endsWith('· score')).toBe(true);
      expect(map.get(d.id)!.processingType).toBe('VECTOR_ENGRAVING');
    }
    expect(labels.length).toBe(paths.filter((p) => p.layer === 'score' && !p.isFoldScore).length);
  });

  it('keeps fold scores on the score color with engrave processing in solid-score mode', () => {
    const model = mailerModel({ scoreLineMode: 'solid-score' });
    const { map, displays } = processingOf(model);
    const scores = displays.filter((d) => d.layerColor === profile.scoreColor);
    const folds = model.panels2D.flatMap((p) => p.paths).filter((p) => p.isFoldScore);
    expect(folds.length).toBeGreaterThan(0);
    expect(scores.length).toBe(model.panels2D.flatMap((p) => p.paths).filter((p) => p.layer === 'score').length);
    for (const d of scores) {
      expect(d.layerTag).toBe(profile.scoreColor);
      expect(map.get(d.id)!.processingType).toBe('VECTOR_ENGRAVING');
      expect(map.get(d.id)!.data.VECTOR_ENGRAVING.parameter.customize).toMatchObject({ power: 18, speed: 100, repeat: 1 });
    }
  });
});

describe('M2 device block', () => {
  // Aaron supplies this file from xTool Studio with an M2 connected; the test skips until it exists.
  const fixtures = import.meta.glob('./fixtures/m2-empty.xcs', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const fixtureRaw = Object.values(fixtures)[0];

  it.skipIf(fixtureRaw === undefined)('matches the device block of a real Studio file', () => {
    const fixture = JSON.parse(fixtureRaw);
    expect(XCS_DEVICE_M2.extId).toBe(fixture.extId);
    expect(XCS_DEVICE_M2.deviceId).toBe(fixture.device.id);
    expect(XCS_DEVICE_M2.power).toBe(fixture.device.power);

    const exported = JSON.parse(exportXcsProject(fingerModel()));
    for (const key of Object.keys(fixture.device)) {
      expect(exported.device).toHaveProperty(key);
    }
  });
});

describe('uuidV4', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('falls back to a v4 UUID when crypto.randomUUID is unavailable', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = uuidV4({});
      expect(id).toMatch(V4);
      ids.add(id);
    }
    expect(ids.size).toBe(50);
    expect(uuidV4(undefined as unknown as undefined)).toMatch(V4);
  });

  it('uses crypto.randomUUID when present', () => {
    expect(uuidV4({ randomUUID: () => 'fixed' })).toBe('fixed');
  });
});

describe('SVG grouped by piece', () => {
  const colorOf = (tag: string) => /stroke="([^"]+)"/.exec(tag)?.[1];
  const profile = EXPORT_PROFILES['xtool-studio'];

  it('emits one group per panel with a data-name, no Cut_Lines layer', () => {
    const model = fingerModel({ exportProfile: 'xtool-studio', svgGroupingMode: 'by-piece' });
    const svg = exportBoxSvg(model, []);
    expect(svg).not.toContain('<g id="Cut_Lines"');
    expect(svg).not.toContain('<g id="Score_Lines"');

    const groups = [...svg.matchAll(/<g id="Piece_([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)];
    expect(groups.length).toBe(model.panels2D.length);
    for (const panel of model.panels2D) {
      const g = groups.find((m) => m[1] === panel.id);
      expect(g, panel.id).toBeDefined();
      expect(g![0]).toContain(`data-name="${panel.name}"`);
      const paths = [...g![2].matchAll(/<path [^>]*>/g)].map((m) => colorOf(m[0]));
      expect(paths.filter((c) => c === profile.cutColor).length).toBeLessThanOrEqual(1);
      expect(paths.filter((c) => c === profile.scoreColor).length).toBeLessThanOrEqual(1);
    }
  });

  it('escapes quotes in data-name', () => {
    const model = fingerModel({ exportProfile: 'xtool-studio', svgGroupingMode: 'by-piece' });
    model.panels2D[0].name = 'Lid "A" & <B>';
    const svg = exportBoxSvg(model, []);
    expect(svg).toContain('data-name="Lid &quot;A&quot; &amp; &lt;B&gt;"');
  });
});

describe('perforations in the SVG', () => {
  const scoreSvg = (mode: 'solid-score' | 'dashed-perf') =>
    exportBoxSvg(mailerModel({ scoreLineMode: mode, exportProfile: 'xtool-studio' }), []);
  const profile = EXPORT_PROFILES['xtool-studio'];

  it('cuts dashed perforations (red) in every grouping mode', () => {
    for (const mode of ['by-layer', 'by-piece', 'flat-2-objects'] as const) {
      const model = mailerModel({ scoreLineMode: 'dashed-perf', exportProfile: 'xtool-studio', svgGroupingMode: mode });
      const svg = exportBoxSvg(model, []);
      expect(svg, mode).not.toContain(`stroke="${profile.scoreColor}"`);
    }
    expect(scoreSvg('dashed-perf')).toContain(`stroke="${profile.cutColor}"`);
  });

  it('keeps solid fold scores on the score color', () => {
    expect(scoreSvg('solid-score')).toContain(`stroke="${profile.scoreColor}"`);
  });
});

describe('effectiveLayer', () => {
  const score = { id: 's', layer: 'score' as const, d: 'M 0 0 L 1 0', closed: false, isFoldScore: true };
  const solid = { ...DEFAULT_BOX_PARAMETERS, scoreLineMode: 'solid-score' as const };
  const dashed = { ...DEFAULT_BOX_PARAMETERS, scoreLineMode: 'dashed-perf' as const };

  it('turns dashed fold scores into cuts and leaves everything else alone', () => {
    expect(effectiveLayer(score, dashed)).toBe('cut');
    expect(effectiveLayer(score, solid)).toBe('score');
    expect(effectiveLayer({ ...score, isFoldScore: false }, dashed)).toBe('score');
    expect(effectiveLayer({ ...score, layer: 'cut' }, dashed)).toBe('cut');
    expect(effectiveLayer({ ...score, layer: 'guide' }, dashed)).toBe('guide');
  });
});

describe('perforations in the DXF', () => {
  const layersOf = (dxf: string) => {
    const rows = dxf.split('\n');
    const out: string[] = [];
    rows.forEach((r, i) => {
      if (r.trim() === 'LWPOLYLINE') out.push(rows[i + 2].trim());
    });
    return out;
  };

  it('puts perforation entities on CUT in dashed mode and SCORE in solid mode', () => {
    const dashed = mailerModel({ scoreLineMode: 'dashed-perf' });
    const solid = mailerModel({ scoreLineMode: 'solid-score' });
    const foldCount = dashed.panels2D.flatMap((p) => p.paths).filter((p) => p.isFoldScore).length;
    expect(foldCount).toBeGreaterThan(0);
    expect(layersOf(exportBoxDxf(dashed))).toContain('CUT');
    expect(layersOf(exportBoxDxf(dashed))).not.toContain('SCORE');
    expect(layersOf(exportBoxDxf(solid))).toContain('SCORE');
  });
});
