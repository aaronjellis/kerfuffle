import type { BoxCategory, BoxParameters, BoxTemplateId, Panel3DTransform } from '../engine/types';
import { BOX_TEMPLATES, DEFAULT_BOX_PARAMETERS, MATERIAL_PRESETS } from '../engine/presets';
import { generateBoxModel } from '../engine/boxGenerator';
import * as THREE from 'three';

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
  /** Panel outlines, far to near, so each one's fill hides the lines behind it. */
  faces: string[];
}

/** How a box type is shown in its thumbnail: its size, how far its folds have closed, and a lid lift. */
interface Pose {
  size: { widthMm: number; depthMm: number; heightMm: number };
  /** Assembly progress, 0 flat or exploded to 1 closed, as the stage's fold slider. */
  t: number;
  /** Lifts the lid's panels (`top` and `lid-…`) by this fraction of the height, to show it comes off. */
  lift: number;
}

const POSES: Record<string, Partial<Pose>> = {
  'finger-box': { lift: 0.35 },
  'finger-shoebox': { lift: 0.55 },
  'finger-clamshell': { t: 0.8 },
  'mailer-tuck': { size: { widthMm: 110, depthMm: 80, heightMm: 38 }, t: 0.72 },
  'mailer-fold': { size: { widthMm: 110, depthMm: 80, heightMm: 38 }, t: 0.72 },
  'mailer-lock': { size: { widthMm: 110, depthMm: 80, heightMm: 38 }, t: 0.72 },
  'carton-rte': { size: { widthMm: 60, depthMm: 40, heightMm: 95 } },
  'carton-ste': { size: { widthMm: 60, depthMm: 40, heightMm: 95 } },
  'cardboard-telescope': { lift: 0.55 },
};

const smooth = (u: number) => u * u * (3 - 2 * u);
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/**
 * Each panel's world-space outline at progress `t`, posed as the viewport poses it: a panel on a fold
 * rig turns through its chain of folds (and flat slides); a free panel moves from its exploded to its
 * closed position.
 */
function posedOutlines(panels: Panel3DTransform[], t: number): { id: string; pts: THREE.Vector3[] }[] {
  const byId = new Map(panels.map((p) => [p.id, p]));
  const ease = smooth(Math.max(0, Math.min(1, t)));
  return panels.map((spec) => {
    const outline = spec.outlinePoints && spec.outlinePoints.length >= 3
      ? spec.outlinePoints
      : [
          { x: 0, y: 0 },
          { x: spec.widthMm, y: 0 },
          { x: spec.widthMm, y: spec.heightMm },
          { x: 0, y: spec.heightMm },
        ];
    const local = outline.map((q) => new THREE.Vector3(q.x - spec.widthMm / 2, -(q.y - spec.heightMm / 2), 0));
    const pos = new THREE.Vector3(...spec.closedPos);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rotation));
    if (spec.foldRig) {
      let cur: Panel3DTransform | undefined = spec;
      while (cur?.foldRig) {
        const r: NonNullable<Panel3DTransform['foldRig']> = cur.foldRig;
        const [s0, s1] = r.stage;
        const e = smooth(Math.max(0, Math.min(1, (t - s0) / Math.max(0.01, s1 - s0))));
        if (r.flatSlide) pos.add(new THREE.Vector3(...r.flatSlide).multiplyScalar(1 - e));
        const angle = r.flatAngleRad * (1 - e) + r.foldedAngleRad * e;
        const pivot = new THREE.Vector3(...r.pivotOffset);
        pos.sub(pivot).applyAxisAngle(AXES[r.axis], angle).add(pivot);
        quat.premultiply(new THREE.Quaternion().setFromAxisAngle(AXES[r.axis], angle));
        cur = r.parentId ? byId.get(r.parentId) : undefined;
      }
      if (cur) pos.add(new THREE.Vector3(...cur.explodedPos).sub(new THREE.Vector3(...cur.closedPos)).multiplyScalar(1 - ease));
    } else {
      pos.lerpVectors(new THREE.Vector3(...spec.explodedPos), new THREE.Vector3(...spec.closedPos), ease);
    }
    return { id: spec.id, pts: local.map((v) => v.applyQuaternion(quat).add(pos)) };
  });
}

/** A block of the given size with a line where its lid parts: the 3D-printed box, drawn whole. */
function blockOutlines(w: number, d: number, h: number, split: number): { id: string; pts: THREE.Vector3[] }[] {
  const [x, y, z] = [w / 2, h / 2, d / 2];
  const v = (a: number, b: number, c: number) => new THREE.Vector3(a, b, c);
  const ys = -y + split * h;
  return [
    { id: 'base-front', pts: [v(-x, -y, z), v(x, -y, z), v(x, ys, z), v(-x, ys, z)] },
    { id: 'base-right', pts: [v(x, -y, z), v(x, -y, -z), v(x, ys, -z), v(x, ys, z)] },
    { id: 'lid-front', pts: [v(-x, ys, z), v(x, ys, z), v(x, y, z), v(-x, y, z)] },
    { id: 'lid-right', pts: [v(x, ys, z), v(x, ys, -z), v(x, y, -z), v(x, y, z)] },
    { id: 'top', pts: [v(-x, y, z), v(x, y, z), v(x, y, -z), v(-x, y, -z)] },
  ];
}

const thumbs = new Map<string, Thumb>();

/**
 * A box type in a small isometric line drawing of its assembled 3D model, posed to show what sets
 * it apart: a lift-off lid raised, a mailer's lid half open, a carton tall. Built once per type.
 */
export function boxTypeThumb(t: BoxType): Thumb {
  const cached = thumbs.get(t.id);
  if (cached) return cached;
  const category = boxTypeCategory(t);
  const pose: Pose = { size: { widthMm: 110, depthMm: 80, heightMm: 55 }, t: 1, lift: 0, ...POSES[t.id] };
  // In the category's own default material, so a cardboard box isn't drawn in 3 mm plywood.
  const material = MATERIAL_PRESETS.find((m) => m.category === category);
  const m = generateBoxModel({
    ...DEFAULT_BOX_PARAMETERS,
    category,
    templateId: t.templateId,
    ...(material ? { materialThicknessMm: material.thicknessMm, kerfMm: material.kerfMm } : {}),
    ...pose.size,
    ...t.params,
    facePatterns: {},
  });
  const panels: { id: string; pts: THREE.Vector3[] }[] =
    category === '3d-print'
      ? blockOutlines(m.outerDims.widthMm, m.outerDims.depthMm, m.outerDims.heightMm, 0.68)
      : posedOutlines(m.panels3D, pose.t);
  // The living-hinge lid is a flat blank the viewport bends; draw it as it closes instead: a flat top
  // that rolls over a quarter round down to the short front wall.
  const hinged = panels.findIndex((q) => q.id === 'living-hinge-lid');
  if (hinged >= 0) {
    panels.splice(hinged, 1);
    const ys = (id: string) => panels.find((q) => q.id === id)?.pts.map((q) => q.y) ?? [0];
    const zs = (id: string) => panels.find((q) => q.id === id)?.pts.map((q) => q.z) ?? [0];
    const xs = panels.find((q) => q.id === 'front')?.pts.map((q) => q.x) ?? [0];
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const yTop = Math.max(...ys('left'));
    const zBack = Math.min(...zs('left'));
    const zFront = Math.max(...zs('front'));
    const r = Math.max(2, Math.min(yTop - Math.max(...ys('front')), zFront - zBack));
    const arc = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 6) * (Math.PI / 2);
      return { y: yTop - r + r * Math.cos(a), z: zFront - r + r * Math.sin(a) };
    });
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    panels.push({ id: 'top', pts: [v(x0, yTop, zBack), v(x1, yTop, zBack), v(x1, yTop, zFront - r), v(x0, yTop, zFront - r)] });
    for (let i = 0; i < 6; i++) {
      const [a, b] = [arc[i], arc[i + 1]];
      panels.push({ id: 'top', pts: [v(x0, a.y, a.z), v(x1, a.y, a.z), v(x1, b.y, b.z), v(x0, b.y, b.z)] });
    }
  }
  const lift = pose.lift * m.outerDims.heightMm;
  // Isometric from the front right, above: x to the right and down, z to the left and down.
  const c = Math.cos(Math.PI / 6);
  const project = (v: THREE.Vector3) => ({ u: (v.x - v.z) * c, w: (v.x + v.z) / 2 - v.y });
  const drawn = panels.map(({ id, pts }) => {
    const lifted = lift && (id === 'top' || id.startsWith('lid-')) ? pts.map((p) => p.clone().add(new THREE.Vector3(0, lift, 0))) : pts;
    const depth = lifted.reduce((sum, p) => sum + p.x + p.y + p.z, 0) / lifted.length;
    return { depth, flat: lifted.map(project) };
  });
  drawn.sort((a, b) => a.depth - b.depth);
  const us = drawn.flatMap((f) => f.flat.map((q) => q.u));
  const ws = drawn.flatMap((f) => f.flat.map((q) => q.w));
  const [u0, u1, w0, w1] = [Math.min(...us), Math.max(...us), Math.min(...ws), Math.max(...ws)];
  const pad = Math.max(u1 - u0, w1 - w0) * 0.04;
  const thumb: Thumb = {
    viewBox: `${(u0 - pad).toFixed(1)} ${(w0 - pad).toFixed(1)} ${(u1 - u0 + 2 * pad).toFixed(1)} ${(w1 - w0 + 2 * pad).toFixed(1)}`,
    faces: drawn.map((f) => `M${f.flat.map((q) => `${q.u.toFixed(1)} ${q.w.toFixed(1)}`).join('L')}Z`),
  };
  thumbs.set(t.id, thumb);
  return thumb;
}
