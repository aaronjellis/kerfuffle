import { describe, expect, it } from 'vitest';
import { BOX_TEMPLATES, DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxTemplateId } from '../src/engine/types';
import { partsForTemplate } from '../src/ui/parts';
import { SECTION_COMPONENTS } from '../src/ui/sections';

const TEMPLATES: BoxTemplateId[] = [
  'finger-basic',
  'finger-clamshell',
  'finger-living-hinge',
  'finger-organizer',
  'cardboard-mailer',
  'cardboard-tuck-carton',
  'cardboard-telescope',
  '3d-snap-box',
];

describe('SECTION_COMPONENTS', () => {
  it('lists all eight templates', () => {
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
