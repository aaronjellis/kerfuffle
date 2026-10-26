import type { BoxParameters } from '../engine/types';

/** The widest filament pin the 3D box and the printed hinge take. */
export const PRINTED_PIN_MAX_MM = 3.0;

/**
 * Clamps the hinge pin to 3 mm once the parameters feed a printed knuckle: the 3D box, or
 * the clamshell's printed hinge. A wider pin (the side-pivot hole goes to 6 mm) would carry
 * over from the other hinge types and self-intersect the knuckle fill. Apply it in the same
 * update that changes the category or the hinge type.
 */
export function withPrintedPinClamp(p: BoxParameters): BoxParameters {
  const printed = p.category === '3d-print' || p.clamshellHingeType === 'printed-hinge';
  if (!printed || p.hingePinDiameterMm <= PRINTED_PIN_MAX_MM) return p;
  return { ...p, hingePinDiameterMm: PRINTED_PIN_MAX_MM };
}
