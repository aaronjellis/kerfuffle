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
