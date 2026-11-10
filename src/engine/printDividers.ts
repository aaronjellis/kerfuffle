import type { BoxParameters, PrintDivider } from './types';

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

/** The perpendicular dividers that end on `d`, with which of their ends does. */
function attachedTo(layout: PrintDivider[], d: PrintDivider): { id: string; end: 'from' | 'to' }[] {
  const out: { id: string; end: 'from' | 'to' }[] = [];
  for (const e of layout) {
    if (e.id === d.id || e.axis === d.axis) continue;
    if (e.pos < d.from - EPS || e.pos > d.to + EPS) continue;
    if (Math.abs(e.from - d.pos) <= EPS) out.push({ id: e.id, end: 'from' });
    else if (Math.abs(e.to - d.pos) <= EPS) out.push({ id: e.id, end: 'to' });
  }
  return out;
}

/** The positions a divider may slide between; `min > max` means it can't move. */
export function moveLimits(layout: PrintDivider[], space: DividerSpace, id: string): { min: number; max: number } {
  const d = layout.find((e) => e.id === id);
  if (!d) return { min: 0, max: -1 };
  const { lo, hi } = facesBeside(layout, space, d, id);
  let min = lo + MIN_SECTION_MM + space.t / 2;
  let max = hi - MIN_SECTION_MM - space.t / 2;
  // Dividers that end on it keep their minimum length.
  for (const a of attachedTo(layout, d)) {
    const e = layout.find((x) => x.id === a.id)!;
    if (a.end === 'to') min = Math.max(min, e.from + MIN_SECTION_MM);
    else max = Math.min(max, e.to - MIN_SECTION_MM);
  }
  // It stays on the dividers its own ends rest on.
  const length = lengthOf(space, d.axis);
  for (const coord of [d.from, d.to]) {
    if (Math.abs(coord) <= EPS || Math.abs(coord - length) <= EPS) continue;
    const support = layout.find(
      (e) => e.axis !== d.axis && Math.abs(e.pos - coord) <= EPS && d.pos >= e.from - EPS && d.pos <= e.to + EPS,
    );
    if (support) {
      min = Math.max(min, support.from);
      max = Math.min(max, support.to);
    }
  }
  // An end on a wall stays clear of the corner fillets.
  if (d.from <= EPS || d.to >= length - EPS) {
    min = Math.max(min, space.rIn + space.t / 2);
    max = Math.min(max, acrossOf(space, d.axis) - space.rIn - space.t / 2);
  }
  return { min: r3(min), max: r3(max) };
}

/** Puts a divider at `pos`, clamped to its limits; the dividers that end on it follow. */
function slideTo(layout: PrintDivider[], space: DividerSpace, d: PrintDivider, pos: number): PrintDivider[] {
  const { min, max } = moveLimits(layout, space, d.id);
  if (min > max + EPS) return layout;
  const next = r3(Math.min(max, Math.max(min, pos)));
  if (Math.abs(next - d.pos) <= EPS) return layout;
  const ends = new Map(attachedTo(layout, d).map((a) => [a.id, a.end]));
  return layout.map((e) => {
    if (e.id === d.id) return { ...e, pos: next };
    const end = ends.get(e.id);
    return end ? { ...e, [end]: next } : e;
  });
}

/** Slides a divider toward `rawPos`: the gap before it snaps, then the limits clamp it. */
export function moveDivider(layout: PrintDivider[], space: DividerSpace, id: string, rawPos: number): PrintDivider[] {
  const d = layout.find((e) => e.id === id);
  if (!d) return layout;
  const { lo } = facesBeside(layout, space, d, id);
  const gap = Math.round((rawPos - space.t / 2 - lo) / DIVIDER_SNAP_MM) * DIVIDER_SNAP_MM;
  return slideTo(layout, space, d, lo + gap + space.t / 2);
}

/** The clear gap on each side of a divider. */
export function clearSizes(layout: PrintDivider[], space: DividerSpace, id: string): { before: number; after: number } {
  const d = layout.find((e) => e.id === id);
  if (!d) return { before: 0, after: 0 };
  const { before, after } = gapsOf(layout, space, d, id);
  return { before: r3(before), after: r3(after) };
}

/** Sets the clear gap on one side of a divider exactly, within its limits. No snapping. */
export function setClearSize(
  layout: PrintDivider[],
  space: DividerSpace,
  id: string,
  side: 'before' | 'after',
  clearMm: number,
): PrintDivider[] {
  const d = layout.find((e) => e.id === id);
  if (!d || !Number.isFinite(clearMm)) return layout;
  const { lo, hi } = facesBeside(layout, space, d, id);
  return slideTo(layout, space, d, side === 'before' ? lo + clearMm + space.t / 2 : hi - clearMm - space.t / 2);
}

/**
 * Removes a divider. Each divider that ended on it grows to the next wall or divider; two that
 * meet on the same line become one. A grown divider with no room (it would come within the
 * minimum of another) is removed too, the later-placed one first.
 */
export function deleteDivider(layout: PrintDivider[], space: DividerSpace, id: string): PrintDivider[] {
  const d = layout.find((e) => e.id === id);
  if (!d) return layout;
  const deps = attachedTo(layout, d);
  let rest = layout.filter((e) => e.id !== id);
  const grownIds: string[] = [];
  for (const dep of deps) {
    const cur = rest.find((e) => e.id === dep.id);
    if (!cur) continue;
    const c = dep.end === 'to' ? d.pos + 1e-3 : d.pos - 1e-3;
    const ends = endsAt(rest, space, cur.axis, cur.pos, c, cur.id);
    let grown: PrintDivider = { ...cur, [dep.end]: dep.end === 'to' ? ends.to : ends.from };
    const twin = rest.find(
      (f) =>
        f.id !== cur.id &&
        f.axis === cur.axis &&
        Math.abs(f.pos - cur.pos) <= EPS &&
        f.from < grown.to - EPS &&
        f.to > grown.from + EPS,
    );
    if (twin) {
      grown = { ...grown, from: Math.min(grown.from, twin.from), to: Math.max(grown.to, twin.to) };
      rest = rest.filter((e) => e.id !== twin.id);
    }
    rest = rest.map((e) => (e.id === cur.id ? grown : e));
    grownIds.push(cur.id);
  }
  for (const grownId of grownIds.reverse()) {
    const g = rest.find((e) => e.id === grownId);
    if (g && !fits(rest, space, g, g.id)) rest = deleteDivider(rest, space, g.id);
  }
  return rest;
}

/** One thickness for every divider: the wall's, until the user sets their own. */
export function resolveDividerThickness(params: BoxParameters): number {
  return params.dividerThickness3dMm > 0
    ? Math.min(8, Math.max(0.8, params.dividerThickness3dMm))
    : Math.max(1.2, params.wallThickness3dMm);
}

/**
 * The saved layout as it applies to this box: scaled from the interior it was drawn for, with the
 * dividers that no longer fit left out. Nothing is removed from the saved layout, so they return
 * when the box has room again. Scaled positions are not re-snapped.
 */
export function resolveDividers(
  params: BoxParameters,
  innerW: number,
  innerD: number,
  rIn: number,
): { layout: PrintDivider[]; space: DividerSpace; hidden: number } {
  const space: DividerSpace = { w: innerW, d: innerD, t: resolveDividerThickness(params), rIn };
  const saved = params.printDividers ?? [];
  const basis = params.printDividersBasis;
  if (saved.length === 0 || !basis || !(basis.w > 0) || !(basis.d > 0) || !(innerW > 0) || !(innerD > 0)) {
    return { layout: [], space, hidden: 0 };
  }
  const sx = innerW / basis.w;
  const sy = innerD / basis.d;
  let layout: PrintDivider[] = saved.map((e) => {
    const across = e.axis === 'y' ? sx : sy;
    const along = e.axis === 'y' ? sy : sx;
    return { ...e, pos: r3(e.pos * across), from: r3(e.from * along), to: r3(e.to * along) };
  });
  for (;;) {
    const bad = layout.find((e) => faultOf(layout, space, e) !== null);
    if (!bad) break;
    layout = deleteDivider(layout, space, bad.id);
  }
  return { layout, space, hidden: saved.length - layout.length };
}
