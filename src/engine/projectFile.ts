import type { BoxParameters, DisplayUnit, FaceArtwork, FacePatternSettings, FacePatternStyle } from './types';
import { BOX_TEMPLATES, DEFAULT_BOX_PARAMETERS } from './presets';

/** The project file's extension; the file itself is JSON. */
export const PROJECT_EXTENSION = '.kerf';
const FORMAT = 'kerfuffle-project';
const VERSION = 1;

/** What a project file holds: the box, its artwork, and the units it was drawn in. */
export interface KerfProject {
  params: BoxParameters;
  artworks: FaceArtwork[];
  displayUnit: DisplayUnit;
}

/** The project as `.kerf` file text. */
export function serializeProject(project: KerfProject): string {
  return JSON.stringify(
    { format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), ...project },
    null,
    2,
  );
}

/** Why a file could not be opened, in words for the person who picked it. */
export class ProjectFileError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const PATTERN_STYLES: FacePatternStyle[] = ['none', 'grid', 'checker', 'diamond', 'honeycomb', 'scallops', 'sunflower', 'spiral'];

const isPattern = (p: unknown): boolean =>
  isRecord(p) &&
  PATTERN_STYLES.includes(p.style as FacePatternStyle) &&
  ['cellMm', 'barMm', 'paddingMm'].every((k) => typeof p[k] === 'number' && Number.isFinite(p[k]));

/**
 * Reads `.kerf` file text. Settings the file lacks take their defaults, and settings of the wrong
 * type or unknown to this version are dropped, so files from older and newer versions both open.
 */
export function parseProject(text: string): KerfProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError('This file isn’t a Kerfuffle project: it couldn’t be read.');
  }
  if (!isRecord(raw) || raw.format !== FORMAT) {
    throw new ProjectFileError('This file isn’t a Kerfuffle project.');
  }
  if (typeof raw.version !== 'number' || raw.version > VERSION) {
    throw new ProjectFileError('This project was saved by a newer Kerfuffle. Reload the page to update, then open it again.');
  }
  if (!isRecord(raw.params)) throw new ProjectFileError('This project has no box settings.');

  const params: BoxParameters = { ...DEFAULT_BOX_PARAMETERS };
  const target = params as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw.params)) {
    if (key === 'materialPresetId') {
      if (typeof value === 'string') params.materialPresetId = value;
      continue;
    }
    if (!(key in DEFAULT_BOX_PARAMETERS)) continue;
    const fallback = target[key];
    const sameKind =
      Array.isArray(fallback) ? Array.isArray(value) : isRecord(fallback) ? isRecord(value) : typeof value === typeof fallback;
    if (sameKind && (typeof value !== 'number' || Number.isFinite(value))) target[key] = value;
  }
  // A bad pattern entry would break the box, so each one is checked on its own.
  params.facePatterns = Object.fromEntries(
    Object.entries(params.facePatterns).filter(([, p]) => isPattern(p)),
  ) as Record<string, FacePatternSettings>;
  const template = BOX_TEMPLATES.find((t) => t.id === params.templateId);
  if (!template) throw new ProjectFileError('This project uses a box template this version doesn’t have.');
  params.category = template.category;

  const artworks = Array.isArray(raw.artworks)
    ? (raw.artworks as unknown[]).filter(
        (a): a is FaceArtwork =>
          isRecord(a) &&
          typeof a.id === 'string' &&
          typeof a.faceId === 'string' &&
          typeof a.dataUrl === 'string' &&
          ['xMm', 'yMm', 'widthMm', 'heightMm', 'rotationDeg'].every((k) => typeof a[k] === 'number'),
      )
    : [];
  const displayUnit: DisplayUnit = raw.displayUnit === 'in' ? 'in' : 'mm';
  return { params, artworks, displayUnit };
}
