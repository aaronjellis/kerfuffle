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
    // The front-lock ears are part of the tuck flap's outline, not panels of their own.
    if (id === 'tuck-flap') return 'closure';
    if (id.endsWith('-roll-inner')) return 'tabs';
    return panel.faceId;
  }

  switch (params.templateId) {
    case 'finger-clamshell':
      // The hinge's own parts: printed and butt hinge leaves and barrels, knuckle plates, pivot cheeks.
      if (/^(printed-hinge|butt-hinge|hinge-knuckle|lid-pivot)-/.test(id)) return 'hinge';
      if (id === 'clamshell-front-clasp') return 'clasp';
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
