import type { BoxCategory, BoxParameters, BoxTemplateId } from '../engine/types';
import { BOX_TEMPLATES, DEFAULT_BOX_PARAMETERS, MATERIAL_PRESETS } from '../engine/presets';
import { generateBoxModel } from '../engine/boxGenerator';
import { translateSvgPath } from '../engine/fingerJointEngine';

/**
 * A box someone would ask for by name: a template plus the settings that make the variant. Some
 * variants (the shoebox lid, the fold-over mailer) are settings on a template; listing them here
 * puts them where people look for box types.
 */
export interface BoxType {
  id: string;
  templateId: BoxTemplateId;
  name: string;
  blurb: string;
  /** The settings that make this variant; they're applied on top of the template. */
  params: Partial<BoxParameters>;
}

export const BOX_TYPES: BoxType[] = [
  { id: 'finger-box', templateId: 'finger-basic', name: 'Finger-joint box', blurb: 'Six panels, lift-off lid', params: { woodLidStyle: 'flat-lid' } },
  { id: 'finger-shoebox', templateId: 'finger-basic', name: 'Wooden shoebox', blurb: 'A lid tray slides down over the box', params: { woodLidStyle: 'telescope-lid' } },
  { id: 'finger-closed', templateId: 'finger-basic', name: 'Closed cube', blurb: 'Six fixed sides', params: { woodLidStyle: 'closed' } },
  { id: 'finger-tray', templateId: 'finger-basic', name: 'Open tray', blurb: 'Five sides, no lid', params: { woodLidStyle: 'open' } },
  { id: 'finger-clamshell', templateId: 'finger-clamshell', name: 'Clamshell chest', blurb: 'Hinged lid on the back', params: {} },
  { id: 'finger-living-hinge', templateId: 'finger-living-hinge', name: 'Living-hinge box', blurb: 'Curved lid that flexes open', params: {} },
  { id: 'finger-organizer', templateId: 'finger-organizer', name: 'Organizer', blurb: 'Tray with slotted dividers', params: {} },
  { id: 'mailer-tuck', templateId: 'cardboard-mailer', name: 'Mailer, tuck lid', blurb: 'Lid tucks inside the front', params: { cardboardLockStyle: 'tuck' } },
  { id: 'mailer-fold', templateId: 'cardboard-mailer', name: 'Mailer, fold-over lid', blurb: 'Flap over the front, ears into the sides', params: { cardboardLockStyle: 'fold-over' } },
  { id: 'mailer-lock', templateId: 'cardboard-mailer', name: 'Mailer, front lock', blurb: 'Tuck with locking ears', params: { cardboardLockStyle: 'front-lock' } },
  { id: 'carton-rte', templateId: 'cardboard-tuck-carton', name: 'Reverse tuck carton', blurb: 'Retail box, tucks at opposite faces', params: { tuckCartonStyle: 'reverse-tuck' } },
  { id: 'carton-ste', templateId: 'cardboard-tuck-carton', name: 'Straight tuck carton', blurb: 'Retail box, both tucks to the front', params: { tuckCartonStyle: 'straight-tuck' } },
  { id: 'cardboard-telescope', templateId: 'cardboard-telescope', name: 'Telescoping box', blurb: 'Two trays, lid over base', params: {} },
  { id: 'print-snap-box', templateId: '3d-snap-box', name: '3D-printed snap box', blurb: 'Printed base and lid', params: {} },
];

/** The category a box type's template belongs to. */
export const boxTypeCategory = (t: BoxType): BoxCategory =>
  BOX_TEMPLATES.find((m) => m.id === t.templateId)?.category ?? 'wood-finger';

export const CATEGORY_NAMES: Record<BoxCategory, string> = {
  'wood-finger': 'Wood',
  'cardboard-fold': 'Cardboard',
  '3d-print': '3D print',
};

/** The box type the current settings match: its template and every one of its settings. */
export function currentBoxType(params: BoxParameters): BoxType | undefined {
  const matches = (t: BoxType) =>
    t.templateId === params.templateId &&
    Object.entries(t.params).every(([k, v]) => params[k as keyof BoxParameters] === v);
  return BOX_TYPES.find(matches) ?? BOX_TYPES.find((t) => t.templateId === params.templateId);
}

export interface Thumb {
  viewBox: string;
  d: string;
}

const thumbs = new Map<string, Thumb | null>();

/**
 * A box type's cut lines at their default size, laid out as on the sheet: a small, true picture
 * of the box. Built once per type on first use; null for a 3D-printed box, which has no sheet.
 */
export function boxTypeThumb(t: BoxType): Thumb | null {
  if (thumbs.has(t.id)) return thumbs.get(t.id)!;
  const category = boxTypeCategory(t);
  let thumb: Thumb | null = null;
  if (category !== '3d-print') {
    // In the category's own default material, so a cardboard box isn't drawn in 3 mm plywood.
    const material = MATERIAL_PRESETS.find((m) => m.category === category);
    const m = generateBoxModel({
      ...DEFAULT_BOX_PARAMETERS,
      category,
      templateId: t.templateId,
      ...(material ? { materialThicknessMm: material.thicknessMm, kerfMm: material.kerfMm } : {}),
      ...t.params,
      facePatterns: {},
    });
    const d = m.panels2D
      .flatMap((p) => p.paths.filter((x) => x.layer === 'cut').map((x) => translateSvgPath(x.d, p.sheetX, p.sheetY, 1)))
      .join(' ');
    thumb = { viewBox: `0 0 ${m.sheetWidthMm.toFixed(1)} ${m.sheetHeightMm.toFixed(1)}`, d };
  }
  thumbs.set(t.id, thumb);
  return thumb;
}
