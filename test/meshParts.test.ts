import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters, BoxTemplateId, Panel3DTransform } from '../src/engine/types';
import { meshPartIdFor } from '../src/ui/meshParts';
import { partForMesh } from '../src/ui/parts';

const panel = (id: string, faceId = id): Panel3DTransform => ({
  id,
  name: id,
  faceId,
  widthMm: 10,
  heightMm: 10,
  thicknessMm: 3,
  color: '#000',
  closedPos: [0, 0, 0],
  explodedPos: [0, 0, 0],
  rotation: [0, 0, 0]
});

const mailer = { category: 'cardboard-fold', templateId: 'cardboard-mailer', clamshellHingeType: 'butt-hardware' } as const;
const clam = (hinge: BoxParameters['clamshellHingeType']) =>
  ({ category: 'wood-finger', templateId: 'finger-clamshell', clamshellHingeType: hinge }) as const;
const wood = (templateId: BoxTemplateId) =>
  ({ category: 'wood-finger', templateId, clamshellHingeType: 'butt-hardware' }) as const;

describe('meshPartIdFor', () => {
  it('cardboard: lid flaps, tuck flap, roll-ins, then faces', () => {
    expect(meshPartIdFor(panel('lid-flap-l'), mailer)).toBe('flap');
    expect(meshPartIdFor(panel('lid-flap-r'), mailer)).toBe('flap');
    expect(meshPartIdFor(panel('tuck-flap'), mailer)).toBe('closure');
    expect(meshPartIdFor(panel('left-roll-inner', 'left'), mailer)).toBe('tabs');
    expect(meshPartIdFor(panel('right-roll-inner', 'right'), mailer)).toBe('tabs');
    expect(meshPartIdFor(panel('back-dust-l', 'back'), mailer)).toBe('back');
    expect(meshPartIdFor(panel('left-roll-bridge', 'left'), mailer)).toBe('left');
    expect(meshPartIdFor(panel('top'), mailer)).toBe('top');
  });

  it('clamshell: printed hinges, clasp, lid panels', () => {
    const p = clam('printed-hinge');
    expect(meshPartIdFor(panel('printed-hinge-0-base'), p)).toBe('hinge');
    expect(meshPartIdFor(panel('printed-hinge-1-knuckle'), p)).toBe('hinge');
    expect(meshPartIdFor(panel('clamshell-front-clasp', 'lid-front'), p)).toBe('clasp');
    expect(meshPartIdFor(panel('top'), p)).toBe('lid');
    for (const id of ['lid-front', 'lid-back', 'lid-left', 'lid-right']) {
      expect(meshPartIdFor(panel(id), p)).toBe('lid');
    }
    expect(meshPartIdFor(panel('base-back', 'back'), p)).toBe('back');
    expect(meshPartIdFor(panel('bottom'), p)).toBe('bottom');
  });

  it('clamshell knuckle-pin: the back walls carry the hinge', () => {
    const p = clam('knuckle-pin');
    expect(meshPartIdFor(panel('base-back', 'back'), p)).toBe('hinge');
    expect(meshPartIdFor(panel('lid-back'), p)).toBe('hinge');
    expect(meshPartIdFor(panel('lid-front'), p)).toBe('lid');
    expect(meshPartIdFor(panel('base-front', 'front'), p)).toBe('front');
  });

  it('living hinge lid, organizer dividers, wood faces', () => {
    expect(meshPartIdFor(panel('living-hinge-lid', 'top'), wood('finger-living-hinge'))).toBe('living-hinge');
    expect(meshPartIdFor(panel('front'), wood('finger-living-hinge'))).toBe('front');
    expect(meshPartIdFor(panel('divider-x-1'), wood('finger-organizer'))).toBe('dividers');
    expect(meshPartIdFor(panel('divider-y-2'), wood('finger-organizer'))).toBe('dividers');
    expect(meshPartIdFor(panel('top'), wood('finger-basic'))).toBe('top');
    expect(meshPartIdFor(panel('left'), wood('finger-organizer'))).toBe('left');
  });

  it('every generated panel resolves to a part its template has', () => {
    const cases: Partial<BoxParameters>[] = [
      { templateId: 'finger-basic' },
      { templateId: 'finger-clamshell', clamshellHingeType: 'printed-hinge' },
      { templateId: 'finger-clamshell', clamshellHingeType: 'knuckle-pin' },
      { templateId: 'finger-living-hinge' },
      { templateId: 'finger-organizer' },
      { templateId: 'cardboard-mailer', category: 'cardboard-fold' }
    ];
    for (const c of cases) {
      const params = { ...DEFAULT_BOX_PARAMETERS, ...c } as BoxParameters;
      for (const p of generateBoxModel(params).panels3D) {
        const id = meshPartIdFor(p, params);
        expect(partForMesh(id, params.templateId), `${params.templateId} ${p.id} -> ${id}`).not.toBeNull();
      }
    }
  });
});
