import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BOX_PARAMETERS,
  EXPORT_PROFILES,
  MATERIAL_PRESETS,
  laserSettingsFor,
  materialPresetFor,
} from '../src/engine/presets';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { translateSvgPath } from '../src/engine/fingerJointEngine';
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

  it('falls back to the nearest thicker preset of the category for an unknown thickness', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      materialThicknessMm: 2.2,
    });
    expect(laser).toEqual(MATERIAL_PRESETS.find((m) => m.id === 'cardboard-bflute')!.laser);
  });

  it('matches within 0.01 mm', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      materialThicknessMm: 6.005,
    });
    expect(laser.cutPasses).toBe(2);
  });

  it('uses MDF settings when MDF is the chosen preset', () => {
    const params = { ...DEFAULT_BOX_PARAMETERS, materialPresetId: 'mdf-3mm', materialThicknessMm: 3.0 };
    const mdf = MATERIAL_PRESETS.find((m) => m.id === 'mdf-3mm')!;
    const basswood = MATERIAL_PRESETS.find((m) => m.id === 'basswood-3mm')!;
    expect(mdf.laser).not.toEqual(basswood.laser);
    expect(laserSettingsFor(params)).toEqual(mdf.laser);
    expect(materialPresetFor(params)).toEqual({ preset: mdf, exact: true });
    // Without a chosen preset, the same thickness resolves to the first match.
    expect(laserSettingsFor({ ...params, materialPresetId: undefined })).toEqual(basswood.laser);
  });

  it('ignores an unknown preset id', () => {
    const params = { ...DEFAULT_BOX_PARAMETERS, materialPresetId: 'gone', materialThicknessMm: 1.6 };
    expect(materialPresetFor(params)).toEqual({
      preset: MATERIAL_PRESETS.find((m) => m.id === 'basswood-1.6mm')!,
      exact: true,
    });
  });

  it('uses the nearest thicker preset for 5 mm wood, not the first wood preset', () => {
    const result = materialPresetFor({ ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger', materialThicknessMm: 5 });
    expect(result.preset.id).toBe('plywood-6mm');
    expect(result.exact).toBe(false);
    expect(laserSettingsFor({ ...DEFAULT_BOX_PARAMETERS, materialThicknessMm: 5 })).toEqual(result.preset.laser);
  });

  it('uses the thickest preset of the category when the stock is thicker than all of them', () => {
    const result = materialPresetFor({ ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger', materialThicknessMm: 9 });
    expect(result).toEqual({ preset: MATERIAL_PRESETS.find((m) => m.id === 'plywood-6mm')!, exact: false });
  });

  it('returns PLA zeros for 3D print without throwing', () => {
    const params = { ...DEFAULT_BOX_PARAMETERS, category: '3d-print' as const };
    expect(() => laserSettingsFor(params)).not.toThrow();
    expect(laserSettingsFor(params)).toEqual({ cutPower: 0, cutSpeed: 0, cutPasses: 0, scorePower: 0, scoreSpeed: 0 });
    expect(materialPresetFor(params).preset.id).toBe('pla-petg');
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

describe('processing order', () => {
  const outlineDPath = (model: GeneratedBoxModel, panelId: string, pathId: string) => {
    const panel = model.panels2D.find((p) => p.id === panelId)!;
    const path = panel.paths.find((p) => p.id === pathId)!;
    return translateSvgPath(path.d, panel.sheetX, panel.sheetY, 1);
  };
  type Shown = { id: string; name: string; zOrder: number; layerColor: string };
  const profile = EXPORT_PROFILES['xtool-studio'];
  const shown = (model: GeneratedBoxModel) => parse(model).canvas[0].displays as Shown[];
  const expectOutlinesLast = (model: GeneratedBoxModel) => {
    const { displays: built } = buildXcsDisplays(model);
    for (const panel of model.panels2D) {
      const outline =
        panel.paths.find((p) => p.layer === 'cut' && p.id.endsWith('-outline')) ??
        panel.paths.find((p) => p.layer === 'cut')!;
      const mine = built.filter((d) => d.name.startsWith(`${panel.name} ·`));
      const top = mine.reduce((a, b) => (b.zOrder > a.zOrder ? b : a));
      expect(top.dPath, panel.id).toBe(outlineDPath(model, panel.id, outline.id));
    }
  };

  it('scores every display before any cut, and ends each panel with its outer outline', () => {
    const model = fingerModel({ scoreInnerFaceLabels: true });
    const displays = shown(model);
    const scores = displays.filter((d) => d.layerColor === profile.scoreColor);
    const cuts = displays.filter((d) => d.layerColor === profile.cutColor);
    expect(scores.length).toBeGreaterThan(0);
    expect(cuts.length).toBeGreaterThan(0);
    const maxScore = Math.max(...scores.map((d) => d.zOrder));
    const minCut = Math.min(...cuts.map((d) => d.zOrder));
    expect(maxScore).toBeLessThan(minCut);

    // The inset lid's lip and the organizer's slots put inner cuts beside an outline.
    for (const m of [
      model,
      fingerModel({ scoreInnerFaceLabels: true, woodLidStyle: 'inset-lid' }),
      fingerModel({ scoreInnerFaceLabels: true, templateId: 'finger-organizer' }),
    ])
      expectOutlinesLast(m);
  });

  it('cuts the mailer perimeter last overall', () => {
    const model = mailerModel({ scoreLineMode: 'dashed-perf', scoreInnerFaceLabels: true });
    const { displays } = buildXcsDisplays(model);
    const last = displays.reduce((a, b) => (b.zOrder > a.zOrder ? b : a));
    expect(last.dPath).toBe(outlineDPath(model, 'mailer-sheet', 'mailer-perimeter-cut'));
    expect(last.zOrder).toBe(displays.length - 1);
  });

  it('orders the score layer before the cut layer', () => {
    const { layerData } = parse(mailerModel()).canvas[0];
    expect(layerData[profile.scoreColor].order).toBe(1);
    expect(layerData[profile.cutColor].order).toBe(2);
    expect(parse(fingerModel()).canvas[0].layerData[profile.cutColor].order).toBe(2);
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
    // Studio may write power as a number or an array.
    expect(XCS_DEVICE_M2.power).toEqual(fixture.device.power);

    const exported = JSON.parse(exportXcsProject(fingerModel()));
    // Every key the fixture has at these places, the export has at the same place.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const places: [string, (project: any) => Record<string, unknown>][] = [
      ['top level', (p) => p],
      ['canvas[0]', (p) => p.canvas[0]],
      ['device', (p) => p.device],
      ['device.data.value[0][1].data.LASER_PLANE', (p) => p.device.data.value[0][1].data.LASER_PLANE],
    ];
    for (const [where, at] of places) {
      const actual = at(exported);
      for (const key of Object.keys(at(fixture))) {
        expect(actual, `${where} is missing ${key}`).toHaveProperty([key]);
      }
    }
  });
});

describe('placeholder device warning', () => {
  it('warns once per session while the M2 device block is a placeholder', async () => {
    vi.resetModules();
    const fresh = await import('../src/engine/xcsExporter');
    expect(fresh.XCS_DEVICE_M2.placeholder).toBe(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      fresh.exportXcsProject(fingerModel());
      fresh.exportXcsProject(mailerModel());
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('placeholder');
    } finally {
      warn.mockRestore();
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
  it('defaults to by-piece grouping when the default profile is xTool Studio', () => {
    if (DEFAULT_BOX_PARAMETERS.exportProfile === 'xtool-studio') {
      expect(DEFAULT_BOX_PARAMETERS.svgGroupingMode).toBe('by-piece');
    }
    expect(DEFAULT_BOX_PARAMETERS.exportProfile).toBe('xtool-studio');
  });

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
