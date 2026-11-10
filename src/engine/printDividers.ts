import type { PrintDivider } from './types';

/**
 * The layout rules for the printed box's freeform dividers. Pure numbers: no React, no three.js.
 *
 * Everything is in the interior frame (see `PrintDivider`). A divider on axis `y` runs front to
 * back at `x = pos`; "before" and "after" are its low and high sides on the other axis. A divider
 * always ends on a wall or on a perpendicular divider, and never crosses one.
 */

/** The clear gap on a divider's low side snaps to this. */
export const DIVIDER_SNAP_MM = 1;
/** The narrowest clear section, and the shortest divider. */
export const MIN_SECTION_MM = 5;

/** The interior and the settings every rule needs. */
export interface DividerSpace {
  /** Interior width (x) and depth (y). */
  w: number;
  d: number;
  /** Divider thickness. */
  t: number;
  /** The interior's corner fillet radius. */
  rIn: number;
}

export interface DividerPreview {
  divider: Omit<PrintDivider, 'id'>;
  /** Clear gap, face to face, to the neighbor on each side. */
  clearBefore: number;
  clearAfter: number;
}

type Shape = Omit<PrintDivider, 'id'>;

const EPS = 1e-6;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** How far a divider on `axis` can run. */
const lengthOf = (space: DividerSpace, axis: 'x' | 'y') => (axis === 'x' ? space.w : space.d);
/** The range of `pos` for a divider on `axis`. */
const acrossOf = (space: DividerSpace, axis: 'x' | 'y') => (axis === 'x' ? space.d : space.w);

/**
 * Where a divider on `axis` at `pos` ends, grown both ways from `c` (a coordinate along `axis`)
 * to the nearest wall or perpendicular divider that spans `pos`.
 */
function endsAt(
  layout: PrintDivider[],
  space: DividerSpace,
  axis: 'x' | 'y',
  pos: number,
  c: number,
  skipId?: string,
): { from: number; to: number } {
  let from = 0;
  let to = lengthOf(space, axis);
  for (const e of layout) {
    if (e.id === skipId || e.axis === axis) continue;
    if (pos < e.from - EPS || pos > e.to + EPS) continue;
    if (e.pos <= c + EPS && e.pos > from) from = e.pos;
    if (e.pos >= c - EPS && e.pos < to) to = e.pos;
  }
  return { from, to };
}

/** The faces a divider's sides look at: a wall, or the nearest same-axis divider beside it. */
function facesBeside(
  layout: PrintDivider[],
  space: DividerSpace,
  d: Shape,
  skipId?: string,
): { lo: number; hi: number } {
  let lo = 0;
  let hi = acrossOf(space, d.axis);
  for (const e of layout) {
    if (e.id === skipId || e.axis !== d.axis) continue;
    if (e.from >= d.to - EPS || e.to <= d.from + EPS) continue;
    if (e.pos <= d.pos + EPS) lo = Math.max(lo, e.pos + space.t / 2);
    else hi = Math.min(hi, e.pos - space.t / 2);
  }
  return { lo, hi };
}

function gapsOf(layout: PrintDivider[], space: DividerSpace, d: Shape, skipId?: string) {
  const { lo, hi } = facesBeside(layout, space, d, skipId);
  return { lo, hi, before: d.pos - space.t / 2 - lo, after: hi - (d.pos + space.t / 2) };
}

/** True when a divider's end on a wall sits clear of the corner fillets. */
function clearsFillets(space: DividerSpace, d: Shape): boolean {
  const onWall = d.from <= EPS || d.to >= lengthOf(space, d.axis) - EPS;
  if (!onWall) return true;
  return d.pos - space.t / 2 >= space.rIn - EPS && d.pos + space.t / 2 <= acrossOf(space, d.axis) - space.rIn + EPS;
}

/** The size rules one divider must meet among the others. */
function fits(layout: PrintDivider[], space: DividerSpace, d: Shape, skipId?: string): boolean {
  const { before, after } = gapsOf(layout, space, d, skipId);
  return (
    before >= MIN_SECTION_MM - EPS &&
    after >= MIN_SECTION_MM - EPS &&
    d.to - d.from >= MIN_SECTION_MM - EPS &&
    clearsFillets(space, d)
  );
}

/** The divider a click at `point` would place, or null when it isn't allowed there. */
export function previewDivider(
  layout: PrintDivider[],
  space: DividerSpace,
  axis: 'x' | 'y',
  point: { x: number; y: number },
): DividerPreview | null {
  if (point.x < 0 || point.x > space.w || point.y < 0 || point.y > space.d) return null;
  const raw = axis === 'y' ? point.x : point.y;
  const c = axis === 'y' ? point.y : point.x;
  const rawEnds = endsAt(layout, space, axis, raw, c);
  const { lo } = facesBeside(layout, space, { axis, pos: raw, ...rawEnds });
  const gap = Math.round((raw - space.t / 2 - lo) / DIVIDER_SNAP_MM) * DIVIDER_SNAP_MM;
  const pos = r3(lo + gap + space.t / 2);
  const ends = endsAt(layout, space, axis, pos, c);
  if (Math.abs(ends.from - rawEnds.from) > EPS || Math.abs(ends.to - rawEnds.to) > EPS) return null;
  const divider: Shape = { axis, pos, from: ends.from, to: ends.to };
  if (!fits(layout, space, divider)) return null;
  const { before, after } = gapsOf(layout, space, divider);
  return { divider, clearBefore: r3(before), clearAfter: r3(after) };
}

/** The layout with a divider placed at `point`, or the same layout when the spot is refused. */
export function placeDivider(
  layout: PrintDivider[],
  space: DividerSpace,
  axis: 'x' | 'y',
  point: { x: number; y: number },
  id: string,
): PrintDivider[] {
  const preview = previewDivider(layout, space, axis, point);
  return preview ? [...layout, { id, ...preview.divider }] : layout;
}

/** True when `coord` (an end of `d`) rests on a wall or on a perpendicular divider. */
function endSupported(layout: PrintDivider[], space: DividerSpace, d: PrintDivider, coord: number): boolean {
  if (Math.abs(coord) <= EPS || Math.abs(coord - lengthOf(space, d.axis)) <= EPS) return true;
  return layout.some(
    (e) => e.axis !== d.axis && Math.abs(e.pos - coord) <= EPS && d.pos >= e.from - EPS && d.pos <= e.to + EPS,
  );
}

/** Why a divider breaks the rules among the others, or null when it meets them all. */
function faultOf(layout: PrintDivider[], space: DividerSpace, d: PrintDivider): string | null {
  if (!endSupported(layout, space, d, d.from) || !endSupported(layout, space, d, d.to)) return 'floating';
  if (!fits(layout, space, d, d.id)) return 'fit';
  for (const e of layout) {
    if (e.id === d.id || e.axis === d.axis) continue;
    const through = e.pos > d.from + EPS && e.pos < d.to - EPS;
    const pierced = d.pos > e.from + EPS && d.pos < e.to - EPS;
    if (through && pierced) return 'crossing';
  }
  return null;
}

/** True when every divider ends on something, keeps its clearances, and crosses nothing. */
export function isValidLayout(layout: PrintDivider[], space: DividerSpace): boolean {
  return layout.every((d) => faultOf(layout, space, d) === null);
}
