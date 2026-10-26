import type { DisplayUnit } from '../../engine/types';
import { fmt } from '../../engine/fingerJointEngine';
import type { PrintDroppedFeature } from '../../engine/printParts';

export const FACE_OPTIONS = [
  { id: 'top', label: 'Lid' },
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'bottom', label: 'Bottom' },
];

/** The unit helpers every section used to read from `App`. */
export function unitHelpers(displayUnit: DisplayUnit) {
  const isInch = displayUnit === 'in';
  const uLabel = isInch ? 'in' : 'mm';
  const fmtDim = (mm: number, inDecimals = 2): string => (isInch ? (mm / 25.4).toFixed(inDecimals) : fmt(mm));
  return { isInch, uLabel, fmtDim };
}

/** Why a switched-on 3D box feature was left out, in words. */
export const DROPPED_NOTES: Record<PrintDroppedFeature, string> = {
  'clasp-height': 'Box too short for the clasp',
  'clasp-width': 'Box too narrow for the clasp',
  'hinge-height': 'Box too short for the hinge',
};
