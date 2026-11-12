import { describe, expect, it } from 'vitest';
import { parseProject, ProjectFileError, serializeProject } from '../src/engine/projectFile';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters, FaceArtwork } from '../src/engine/types';

const params: BoxParameters = {
  ...DEFAULT_BOX_PARAMETERS,
  category: 'cardboard-fold',
  templateId: 'cardboard-mailer',
  widthMm: 140,
  kerfMm: 0.22,
  materialPresetId: 'cardboard-eflute',
  facePatterns: { top: { style: 'spiral', cellMm: 12, barMm: 2, paddingMm: 6 } },
};
const art: FaceArtwork = {
  id: 'art-1',
  faceId: 'top',
  name: 'Logo',
  dataUrl: 'data:image/png;base64,AAAA',
  xMm: 1,
  yMm: 2,
  widthMm: 30,
  heightMm: 20,
  rotationDeg: 0,
  mode: 'engrave',
};

const fileWith = (patch: Record<string, unknown>, paramsPatch: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 'kerfuffle-project', version: 1, params: { ...params, ...paramsPatch }, artworks: [], displayUnit: 'mm', ...patch });

describe('project files', () => {
  it('round-trips the box, its artwork and its units', () => {
    const back = parseProject(serializeProject({ params, artworks: [art], displayUnit: 'in' }));
    expect(back.params).toEqual(params);
    expect(back.artworks).toEqual([art]);
    expect(back.displayUnit).toBe('in');
  });

  it('fills settings an older file lacks with their defaults', () => {
    const { facePatterns: _omit, ...older } = params;
    const back = parseProject(JSON.stringify({ format: 'kerfuffle-project', version: 1, params: older }));
    expect(back.params.facePatterns).toEqual({});
    expect(back.params.widthMm).toBe(140);
    expect(back.artworks).toEqual([]);
  });

  it('gives a file from before the book box its book defaults, and round-trips a book', () => {
    const { bookCoverOverhangMm: _a, bookSpineRadiusMm: _b, bookGuidePins: _c, bookPageLines: _d, bookPageLineSpacingMm: _e, ...older } = params;
    const back = parseProject(JSON.stringify({ format: 'kerfuffle-project', version: 1, params: older }));
    expect(back.params.bookCoverOverhangMm).toBe(4);
    expect(back.params.bookSpineRadiusMm).toBe(0);
    expect(back.params.bookGuidePins).toBe(true);
    expect(back.params.bookPageLines).toBe(false);
    expect(back.params.bookPageLineSpacingMm).toBe(1.5);
    const book: BoxParameters = { ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger', templateId: 'finger-book', bookSpineRadiusMm: 12, bookGuidePins: false };
    expect(parseProject(serializeProject({ params: book, artworks: [], displayUnit: 'mm' })).params).toEqual(book);
  });

  it('drops unknown settings, wrong types and broken patterns', () => {
    const back = parseProject(
      fileWith({}, { futureSetting: 3, widthMm: 'wide', facePatterns: { top: { style: 'zigzag', cellMm: 1, barMm: 1, paddingMm: 1 } } }),
    );
    expect('futureSetting' in back.params).toBe(false);
    expect(back.params.widthMm).toBe(DEFAULT_BOX_PARAMETERS.widthMm);
    expect(back.params.facePatterns).toEqual({});
  });

  it('takes the category from the template', () => {
    expect(parseProject(fileWith({}, { category: 'wood-finger' })).params.category).toBe('cardboard-fold');
  });

  it('refuses files that are not Kerfuffle projects, or come from a newer version', () => {
    expect(() => parseProject('not json')).toThrow(ProjectFileError);
    expect(() => parseProject(JSON.stringify({ hello: 1 }))).toThrow(/isn’t a Kerfuffle project/);
    expect(() => parseProject(fileWith({ version: 2 }))).toThrow(/newer Kerfuffle/);
    expect(() => parseProject(fileWith({}, { templateId: 'teapot' }))).toThrow(/template/);
  });
});

describe('printed box dividers in a project file', () => {
  const good = { id: 'a', axis: 'y', pos: 40, from: 0, to: 80 };
  const file = (p: object) =>
    JSON.stringify({ format: 'kerfuffle-project', version: 1, params: { templateId: '3d-snap-box', ...p } });

  it('round-trips a divider layout', () => {
    const withDividers = {
      ...DEFAULT_BOX_PARAMETERS,
      printDividers: [good as { id: string; axis: 'y'; pos: number; from: number; to: number }],
      printDividersBasis: { w: 110, d: 80 },
      dividerThickness3dMm: 1.6,
    };
    const back = parseProject(serializeProject({ params: withDividers, artworks: [], displayUnit: 'mm' })).params;
    expect(back.printDividers).toEqual([good]);
    expect(back.printDividersBasis).toEqual({ w: 110, d: 80 });
    expect(back.dividerThickness3dMm).toBe(1.6);
  });
  it('opens an old file with no dividers', () => {
    expect(parseProject(file({})).params.printDividers).toEqual([]);
  });
  it('drops bad divider entries and keeps good ones', () => {
    const bad = [{ ...good, axis: 'z' }, { ...good, pos: null }, { ...good, id: 7 }, { ...good, from: 50, to: 10 }, 'x', good, good];
    const p = parseProject(file({ printDividers: bad, printDividersBasis: { w: 110, d: 80 } })).params;
    expect(p.printDividers).toEqual([good]);
  });
  it('drops every divider when the basis is unusable', () => {
    const p = parseProject(file({ printDividers: [good], printDividersBasis: { w: 0, d: 'x' } })).params;
    expect(p.printDividers).toEqual([]);
    expect(p.printDividersBasis).toEqual({ w: 0, d: 0 });
  });
});
