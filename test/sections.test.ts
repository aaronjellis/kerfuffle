import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_TEXT_ARTWORK_CONFIG } from '../src/engine/googleFonts';
import { BOX_TEMPLATES, DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters, BoxTemplateId, FaceArtwork } from '../src/engine/types';
import { partsForTemplate } from '../src/ui/parts';
import { SECTION_COMPONENTS, type SectionHandlers } from '../src/ui/sections';

const TEMPLATES: BoxTemplateId[] = [
  'finger-basic',
  'finger-clamshell',
  'finger-living-hinge',
  'finger-organizer',
  'finger-wine-carrier',
  'cardboard-mailer',
  'cardboard-tuck-carton',
  'cardboard-telescope',
  '3d-snap-box',
];

describe('SECTION_COMPONENTS', () => {
  it('lists all nine templates', () => {
    expect([...TEMPLATES].sort()).toEqual(BOX_TEMPLATES.map((t) => t.id).sort());
  });

  it.each(TEMPLATES)('has a section component for every part of %s', (templateId) => {
    const parts = partsForTemplate(templateId, DEFAULT_BOX_PARAMETERS);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(typeof SECTION_COMPONENTS[part.id], part.id).toBe('function');
    }
  });
});

const noop = () => {};
const asyncNoop = async () => {};

/** Every handler a section can call, doing nothing. */
const stubHandlers = (artworks: FaceArtwork[]): SectionHandlers => ({
  setParams: noop,
  updateFaceLabel: noop,
  setDisplayUnit: noop,
  selectProfile: noop,
  artworks,
  selectedFaceId: 'top',
  setSelectedFaceId: noop,
  selectedArtworkId: artworks[0]?.id ?? null,
  setSelectedArtworkId: noop,
  updateArtwork: noop,
  removeArtwork: noop,
  duplicateArtwork: noop,
  addTextArtwork: asyncNoop,
  updateTextConfig: asyncNoop,
  uploadInputRef: { current: null },
  uploadArtwork: noop,
  addSampleArtwork: noop,
  alignArtwork: noop,
  fitArtwork: noop,
  alignMarginMm: 4,
  setAlignMarginMm: noop,
  exportHingeStl: noop,
  downloadStl: noop,
  downloadStlParts: noop,
});

/** A text item on the lid, so the Artwork section renders its per-item inspector too. */
const TEXT_ART: FaceArtwork = {
  id: 'art-1',
  faceId: 'top',
  name: 'Text: HELLO',
  dataUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
  xMm: 0,
  yMm: 0,
  widthMm: 40,
  heightMm: 12,
  rotationDeg: 0,
  mode: 'engrave',
  textConfig: { ...DEFAULT_TEXT_ARTWORK_CONFIG, text: 'HELLO' },
};

describe('section rendering', () => {
  const cases = TEMPLATES.flatMap((templateId) =>
    (['mm', 'in'] as const).map((unit) => [templateId, unit] as const)
  );

  it.each(cases)('renders every part of %s in %s without throwing', (templateId, displayUnit) => {
    const meta = BOX_TEMPLATES.find((t) => t.id === templateId)!;
    const params: BoxParameters = { ...DEFAULT_BOX_PARAMETERS, category: meta.category, templateId };
    const model = generateBoxModel(params);
    for (const artworks of [[], [TEXT_ART]]) {
      for (const part of partsForTemplate(templateId, params)) {
        const html = renderToString(
          createElement(SECTION_COMPONENTS[part.id], {
            params,
            updateParam: noop,
            displayUnit,
            model,
            handlers: stubHandlers(artworks),
          })
        );
        expect(html.length, `${templateId} / ${part.id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('printed dividers section', () => {
  const render = (extra: Partial<BoxParameters>) => {
    const params: BoxParameters = { ...DEFAULT_BOX_PARAMETERS, category: '3d-print', templateId: '3d-snap-box', ...extra };
    const model = generateBoxModel(params);
    return renderToString(
      createElement(SECTION_COMPONENTS['print-dividers'], { params, updateParam: noop, displayUnit: 'mm', model, handlers: stubHandlers([]) })
    );
  };
  const { widthMm: w, depthMm: d } = generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, category: '3d-print', templateId: '3d-snap-box' }).innerDims;

  it('says that editing drops the hidden dividers', () => {
    // The second divider sits 3 mm from the first: it can't fit, so it is hidden.
    const html = render({
      printDividersBasis: { w, d },
      printDividers: [
        { id: 'a', axis: 'y', pos: 40, from: 0, to: d },
        { id: 'b', axis: 'y', pos: 45, from: 0, to: d },
      ],
    });
    expect(html).toContain('1 hidden');
    expect(html).toContain('Changing the dividers now removes');
  });
  it('gives no warning when every divider fits', () => {
    const html = render({ printDividersBasis: { w, d }, printDividers: [{ id: 'a', axis: 'y', pos: 40, from: 0, to: d }] });
    expect(html).not.toContain('hidden');
  });
});
