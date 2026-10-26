import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxTemplateId } from '../src/engine/types';
import { partForMesh, partsForTemplate, reconcileSelection, type PartId } from '../src/ui/parts';

const params = {
  woodLidStyle: DEFAULT_BOX_PARAMETERS.woodLidStyle,
  clamshellHingeType: DEFAULT_BOX_PARAMETERS.clamshellHingeType
};

const ids = (t: BoxTemplateId): PartId[] => partsForTemplate(t, params).map((p) => p.id);

const EXPECTED: Record<BoxTemplateId, PartId[]> = {
  'finger-basic': ['size', 'material', 'lid', 'joints', 'labels', 'artwork', 'sheet'],
  'finger-clamshell': ['size', 'material', 'lid', 'hinge', 'joints', 'labels', 'artwork', 'sheet'],
  'finger-living-hinge': ['size', 'material', 'living-hinge', 'joints', 'labels', 'artwork', 'sheet'],
  'finger-organizer': ['size', 'material', 'joints', 'dividers', 'labels', 'artwork', 'sheet'],
  'cardboard-mailer': ['size', 'material', 'closure', 'flaps', 'score-lines', 'labels', 'artwork', 'sheet'],
  'cardboard-tuck-carton': ['size', 'material', 'score-lines', 'labels', 'artwork', 'sheet'],
  'cardboard-telescope': ['size', 'material', 'score-lines', 'labels', 'artwork', 'sheet'],
  '3d-snap-box': ['size', 'shell', 'hinge', 'clasp', 'labels', 'artwork', 'print-export']
};
const TEMPLATES = Object.keys(EXPECTED) as BoxTemplateId[];

describe('partsForTemplate', () => {
  it('lists parts per template in order', () => {
    for (const t of TEMPLATES) expect(ids(t)).toEqual(EXPECTED[t]);
  });

  it('clamshell has hinge and no dividers; basic has neither', () => {
    expect(ids('finger-clamshell')).toContain('hinge');
    expect(ids('finger-clamshell')).not.toContain('dividers');
    expect(ids('finger-basic')).not.toContain('hinge');
    expect(ids('finger-basic')).not.toContain('dividers');
  });

  it('mailer has closure and flaps; tuck carton has neither', () => {
    expect(ids('cardboard-mailer')).toEqual(expect.arrayContaining(['closure', 'flaps']));
    expect(ids('cardboard-tuck-carton')).not.toContain('closure');
    expect(ids('cardboard-tuck-carton')).not.toContain('flaps');
  });

  it('3D box has shell, hinge, clasp and no material', () => {
    expect(ids('3d-snap-box')).toEqual(expect.arrayContaining(['shell', 'hinge', 'clasp']));
    expect(ids('3d-snap-box')).not.toContain('material');
  });

  it('every template starts with size and has labels and artwork', () => {
    for (const t of TEMPLATES) {
      expect(ids(t)[0]).toBe('size');
      expect(ids(t)).toEqual(expect.arrayContaining(['labels', 'artwork']));
    }
  });

  it('gives each part a label, an icon, and unique ids', () => {
    for (const t of TEMPLATES) {
      const parts = partsForTemplate(t, params);
      expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
      for (const p of parts) {
        expect(p.label).toMatch(/^[A-Z][a-z ]+$/);
        expect(p.icon).toBeTruthy();
      }
    }
  });

  it('keywords cover the search words for settings each template has', () => {
    const words = (t: BoxTemplateId) =>
      partsForTemplate(t, params).map((p) => p.keywords).join(' ').toLowerCase();
    const need: Partial<Record<BoxTemplateId, string[]>> = {
      'finger-basic': ['kerf', 'label'],
      'finger-clamshell': ['kerf', 'hinge', 'label'],
      'finger-living-hinge': ['kerf', 'hinge', 'label'],
      'cardboard-mailer': ['kerf', 'flap', 'score', 'tab', 'label'],
      'cardboard-tuck-carton': ['kerf', 'flap', 'score', 'tab', 'label'],
      '3d-snap-box': ['fillet', 'clasp', 'hinge', 'label']
    };
    for (const [t, list] of Object.entries(need) as [BoxTemplateId, string[]][]) {
      for (const w of list) expect(words(t), `${t} should match "${w}"`).toContain(w);
    }
  });
});

describe('partForMesh', () => {
  it('maps named 3D parts', () => {
    expect(partForMesh('clasp', '3d-snap-box')).toBe('clasp');
    expect(partForMesh('hinge', '3d-snap-box')).toBe('hinge');
    expect(partForMesh('hinge', 'finger-clamshell')).toBe('hinge');
    expect(partForMesh('lid', 'finger-basic')).toBe('lid');
    expect(partForMesh('lid', '3d-snap-box')).toBe('shell');
    expect(partForMesh('shell', '3d-snap-box')).toBe('shell');
    expect(partForMesh('lip', '3d-snap-box')).toBe('shell');
    expect(partForMesh('flap', 'cardboard-mailer')).toBe('flaps');
    expect(partForMesh('tabs', 'cardboard-mailer')).toBe('flaps');
    expect(partForMesh('closure', 'cardboard-mailer')).toBe('closure');
  });

  it('maps face ids to artwork', () => {
    for (const f of ['top', 'bottom', 'front', 'back', 'left', 'right', 'lid-front', 'lid-back', 'lid-left', 'lid-right', 'tuck-flap']) {
      expect(partForMesh(f, 'finger-basic')).toBe('artwork');
    }
  });

  it('returns null for unknown ids and parts the template lacks', () => {
    expect(partForMesh('nonsense', 'finger-basic')).toBeNull();
    expect(partForMesh('hinge', 'finger-basic')).toBeNull();
    expect(partForMesh('flap', 'finger-basic')).toBeNull();
  });
});

describe('reconcileSelection', () => {
  it('keeps a selection the template has', () => {
    expect(reconcileSelection('hinge', 'finger-clamshell', params)).toBe('hinge');
  });
  it('falls back to size', () => {
    expect(reconcileSelection('clasp', 'finger-basic', params)).toBe('size');
    expect(reconcileSelection(null, 'finger-basic', params)).toBe('size');
  });
});
