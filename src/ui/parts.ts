import {
  ArrowDownToLine,
  Box,
  Grid3x3,
  Image,
  Layers,
  LayoutGrid,
  Link,
  Lock,
  PanelTop,
  Printer,
  Ruler,
  Scissors,
  Shapes,
  Sheet,
  Square,
  Tag,
  Waves,
  type LucideIcon
} from 'lucide-react';
import type { BoxParameters, BoxTemplateId } from '../engine/types';

export type PartId =
  | 'size'
  | 'material'
  | 'lid'
  | 'hinge'
  | 'clasp'
  | 'joints'
  | 'dividers'
  | 'living-hinge'
  | 'closure'
  | 'side-locks'
  | 'flaps'
  | 'score-lines'
  | 'shell'
  | 'pattern'
  | 'labels'
  | 'artwork'
  | 'sheet'
  | 'print-export';

export interface PartDef {
  id: PartId;
  label: string;
  /** Space-separated search words; the settings search matches against these. */
  keywords: string;
  icon: LucideIcon;
}

type ParamsSlice = Pick<BoxParameters, 'woodLidStyle' | 'clamshellHingeType'>;

const DEFS: Record<PartId, PartDef> = {
  size: {
    id: 'size',
    label: 'Size',
    keywords: 'template style box model architecture preset dimensions width depth height size inner outer units mm in inches',
    icon: Ruler
  },
  material: {
    id: 'material',
    label: 'Material',
    keywords: 'material preset thickness laser kerf wood mdf basswood cardboard flute',
    icon: Layers
  },
  lid: { id: 'lid', label: 'Lid', keywords: 'lid style lid height', icon: Square },
  hinge: {
    id: 'hinge',
    label: 'Hinge',
    keywords: 'hinge clamshell seam screw holes knuckle printed',
    icon: Link
  },
  clasp: { id: 'clasp', label: 'Clasp', keywords: 'clasp latch snap', icon: Lock },
  joints: {
    id: 'joints',
    label: 'Joints',
    keywords: 'finger joint width wall attach',
    icon: Grid3x3
  },
  dividers: { id: 'dividers', label: 'Dividers', keywords: 'divider columns rows', icon: LayoutGrid },
  'living-hinge': {
    id: 'living-hinge',
    label: 'Living hinge',
    keywords: 'living hinge pitch',
    icon: Waves
  },
  closure: {
    id: 'closure',
    label: 'Closure',
    keywords: 'closure lock tab tuck glue thumb notch',
    icon: ArrowDownToLine
  },
  'side-locks': {
    id: 'side-locks',
    label: 'Side locks',
    keywords: 'side lock tabs floor tabs slots inner wall count length',
    icon: Lock
  },
  flaps: {
    id: 'flaps',
    label: 'Flaps',
    keywords: 'flap tuck flap glue flap clearance lid flaps dust ears',
    icon: PanelTop
  },
  'score-lines': {
    id: 'score-lines',
    label: 'Score lines',
    keywords:
      'score line mode perforation perf cut bridge lock tab width depth tuck flap glue flap clearance thumb notch reverse straight',
    icon: Scissors
  },
  shell: {
    id: 'shell',
    label: 'Shell',
    keywords: 'wall floor thickness inner outer fillet chamfer lid split height snap',
    icon: Box
  },
  pattern: {
    id: 'pattern',
    label: 'Pattern',
    keywords:
      'pattern lattice mesh cutout cut out window see inside fretwork grid checker diamond honeycomb hex scallop sunflower spiral swirl padding bar cell',
    icon: Shapes
  },
  labels: {
    id: 'labels',
    label: 'Labels',
    keywords: 'side labels inner name score text font mirror position top bottom front back left right',
    icon: Tag
  },
  artwork: {
    id: 'artwork',
    label: 'Artwork',
    keywords:
      'artwork image logo graphic face piece upload picture png jpg svg sample text font weight italic color engrave print align snap fit rotate rotation offset',
    icon: Image
  },
  sheet: {
    id: 'sheet',
    label: 'Sheet',
    keywords:
      'sheet layout nesting export bed size machine margin part gap spacing profile svg units grouping frame scale bar registration marks panel dimensions',
    icon: Sheet
  },
  'print-export': {
    id: 'print-export',
    label: 'Export options',
    keywords: 'print export stl one two files',
    icon: Printer
  }
};

const COMMON_TAIL: PartId[] = ['labels', 'artwork', 'sheet'];
const PATTERN_TAIL: PartId[] = ['pattern', ...COMMON_TAIL];

const PART_IDS: Record<BoxTemplateId, PartId[]> = {
  'finger-basic': ['size', 'material', 'lid', 'joints', ...PATTERN_TAIL],
  'finger-clamshell': ['size', 'material', 'lid', 'hinge', 'joints', ...PATTERN_TAIL],
  'finger-living-hinge': ['size', 'material', 'living-hinge', 'joints', ...PATTERN_TAIL],
  'finger-organizer': ['size', 'material', 'joints', 'dividers', ...COMMON_TAIL],
  'cardboard-mailer': ['size', 'material', 'closure', 'side-locks', 'flaps', 'score-lines', ...PATTERN_TAIL],
  'cardboard-tuck-carton': ['size', 'material', 'score-lines', ...PATTERN_TAIL],
  'cardboard-telescope': ['size', 'material', 'score-lines', ...PATTERN_TAIL],
  '3d-snap-box': ['size', 'shell', 'hinge', 'clasp', 'labels', 'artwork', 'print-export']
};

/**
 * Returns the inspector parts for a template, in display order.
 *
 * `params` is accepted for forward compatibility. Today's lists depend only on the
 * template: the `lid` part (lid style and lid height) is present for `finger-basic`
 * and `finger-clamshell` regardless of `woodLidStyle`.
 */
export function partsForTemplate(templateId: BoxTemplateId, _params: ParamsSlice): PartDef[] {
  return PART_IDS[templateId].map((id) => DEFS[id]);
}

const FACE_IDS = new Set([
  'top',
  'bottom',
  'front',
  'back',
  'left',
  'right',
  'lid-front',
  'lid-back',
  'lid-left',
  'lid-right',
  'tuck-flap'
]);

const MESH_TO_PART: Record<string, PartId> = {
  hinge: 'hinge',
  clasp: 'clasp',
  lid: 'lid',
  flap: 'flaps',
  tabs: 'side-locks',
  closure: 'closure',
  shell: 'shell',
  lip: 'shell',
  dividers: 'dividers',
  'living-hinge': 'living-hinge'
};

/** Maps a clicked 3D mesh id to an inspector part, or `null` if the template has no such part. */
export function partForMesh(meshPartId: string, templateId: BoxTemplateId): PartId | null {
  let part: PartId | undefined = FACE_IDS.has(meshPartId) ? 'artwork' : MESH_TO_PART[meshPartId];
  if (part === 'lid' && templateId === '3d-snap-box') part = 'shell';
  // The clamshell's decorative front clasp belongs to the lid.
  if (part === 'clasp' && templateId === 'finger-clamshell') part = 'lid';
  if (!part) return null;
  return PART_IDS[templateId].includes(part) ? part : null;
}

/** Keeps `selected` if the template has it; otherwise returns `'size'`. */
export function reconcileSelection(
  selected: PartId | null,
  templateId: BoxTemplateId,
  _params: ParamsSlice
): PartId {
  return selected && PART_IDS[templateId].includes(selected) ? selected : 'size';
}
