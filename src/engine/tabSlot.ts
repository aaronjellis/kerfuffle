/**
 * Tab-and-slot joinery: tabs along one piece's edge pass through matching slots in another piece's
 * face. The slots are smaller than the tabs by the kerf offset each way, so once the laser has burnt
 * its kerf from both, the tabs press in and hold without glue. Tabs and slots are square: they're
 * the joint's hidden faces.
 */
import type { Point2D } from './types';

/** `count` tabs, `tabMm` long each, spaced evenly along an edge from `fromMm` to `toMm`. */
export interface TabRun {
  fromMm: number;
  toMm: number;
  count: number;
  tabMm: number;
}

/** Where each tab's centre falls along its edge: the run split into equal parts, a tab in each. */
export function tabCentres(run: TabRun): number[] {
  const step = (run.toMm - run.fromMm) / run.count;
  return Array.from({ length: run.count }, (_, i) => run.fromMm + step * (i + 0.5));
}

/**
 * The edge from `a` to `b` with the run's tabs standing `depthMm` out from it, on the side `outward`
 * picks (1: to the right of a→b, -1: to the left). Starts at `a` and ends at `b`.
 */
export function tabbedEdge(a: Point2D, b: Point2D, run: TabRun, depthMm: number, outward: 1 | -1): Point2D[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: u.y * outward, y: -u.x * outward };
  const at = (s: number, d: number): Point2D => ({ x: a.x + u.x * s + n.x * d, y: a.y + u.y * s + n.y * d });
  const pts: Point2D[] = [{ ...a }];
  for (const c of tabCentres(run)) {
    const s0 = c - run.tabMm / 2;
    const s1 = c + run.tabMm / 2;
    pts.push(at(s0, 0), at(s0, depthMm), at(s1, depthMm), at(s1, 0));
  }
  pts.push({ ...b });
  return pts;
}

/**
 * The slots for a run's tabs in the face they pass through: one closed rectangle per tab, centred on
 * it, on the line `lineOffsetMm` in from the face's edge, `tabMm − kerf` along the run and
 * `thicknessMm − kerf` across it. `alongX` says which way the run goes in the face.
 */
export function slotsFor(run: TabRun, lineOffsetMm: number, thicknessMm: number, kerfMm: number, alongX: boolean): Point2D[][] {
  const along = (run.tabMm - kerfMm) / 2;
  const across = (thicknessMm - kerfMm) / 2;
  return tabCentres(run).map((c) => {
    const [cx, cy, hx, hy] = alongX ? [c, lineOffsetMm, along, across] : [lineOffsetMm, c, across, along];
    return [
      { x: cx - hx, y: cy - hy },
      { x: cx + hx, y: cy - hy },
      { x: cx + hx, y: cy + hy },
      { x: cx - hx, y: cy + hy },
    ];
  });
}

/** How many tabs an edge of `lengthMm` gets: one per 45 mm, at least two. */
export const tabCountFor = (lengthMm: number): number => Math.max(2, Math.round(lengthMm / 45));

/** Every carrier tab's length along its edge. */
export const TAB_MM = 12;
