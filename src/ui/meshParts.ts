import type { BoxParameters, Panel3DTransform } from '../engine/types';

type MeshParams = Pick<BoxParameters, 'category' | 'templateId' | 'clamshellHingeType'>;

/**
 * The id a 3D panel mesh reports when clicked. `partForMesh` turns it into an
 * inspector part; a plain face id opens Artwork.
 *
 * The 3D box splits into one mesh per print piece (`shell`, `lip`, `hinge`, `clasp`);
 * the viewport sets those ids itself, so this returns the face id for them.
 */
export function meshPartIdFor(panel: Panel3DTransform, params: MeshParams): string {
  const id = panel.id;

  if (params.category === 'cardboard-fold') {
    if (id.startsWith('lid-flap-')) return 'flap';
    if (id === 'tuck-flap' || id.startsWith('lock-tab-')) return 'closure';
    if (id.endsWith('-roll-inner')) return 'tabs';
    return panel.faceId;
  }

  switch (params.templateId) {
    case 'finger-clamshell':
      if (id.startsWith('printed-hinge-')) return 'hinge';
      if (id === 'clamshell-front-clasp') return 'clasp';
      // The knuckle fingers are cut into the back walls.
      if (params.clamshellHingeType === 'knuckle-pin' && (id === 'base-back' || id === 'lid-back')) {
        return 'hinge';
      }
      if (id === 'top' || id.startsWith('lid-')) return 'lid';
      return panel.faceId;
    case 'finger-living-hinge':
      return id === 'living-hinge-lid' ? 'living-hinge' : panel.faceId;
    case 'finger-organizer':
      return id.startsWith('divider-') ? 'dividers' : panel.faceId;
    default:
      return panel.faceId;
  }
}
