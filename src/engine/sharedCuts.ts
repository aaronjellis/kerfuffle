/**
 * Common-line cutting: where two pieces on the sheet touch and their outlines run along the same
 * line, the laser need cut that stretch only once. The first piece keeps its whole outline; each
 * later piece's outline leaves out the stretches an earlier piece already cuts, becoming open runs.
 * A piece that lost a stretch still cuts out fully, but in laser software it no longer moves as one
 * closed shape: its missing edge stays with its neighbour.
 *
 * Only straight, axis-aligned stretches on a piece's bounding box can meet another piece's, since
 * pieces never overlap; curves and inner holes are left alone. The same goes within a piece: a slot
 * drawn as its own shape along the piece's edge doesn't cut that edge a second time.
 */
import type { BoxPanel2D, DielinePath, Point2D } from './types';

const EPS = 1e-3;
const f3 = (n: number) => Number(n.toFixed(3)).toString();

type Interval = [number, number];

/** The points of a path made only of M, L and Z, or null when it uses anything else. */
function polygonOf(d: string): Point2D[] | null {
  if (/[^MLZ\d\s.,eE+-]/.test(d)) return null;
  if ((d.match(/M/g) ?? []).length !== 1) return null;
  const nums = d.match(/-?\d+(\.\d+)?(e-?\d+)?/gi);
  if (!nums || nums.length < 6) return null;
  const pts: Point2D[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: Number(nums[i]), y: Number(nums[i + 1]) });
  return pts;
}

/** `interval` less every interval in `cover`, in order, gaps under EPS dropped. */
function subtract([a, b]: Interval, cover: Interval[]): Interval[] {
  let pieces: Interval[] = [[a, b]];
  for (const [c, e] of cover) {
    pieces = pieces.flatMap(([p, q]) => {
      if (e <= p + EPS || c >= q - EPS) return [[p, q] as Interval];
      const out: Interval[] = [];
      if (c > p + EPS) out.push([p, c]);
      if (e < q - EPS) out.push([e, q]);
      return out;
    });
  }
  return pieces;
}

interface Edge {
  a: Point2D;
  b: Point2D;
  /** The line this edge lies on, when it's a straight run along the piece's bounding box. */
  line?: string;
  /** Its extent along that line. */
  span?: Interval;
}

/**
 * Removes every stretch of a piece's outline that an earlier piece's outline already cuts, once
 * the pieces are in their sheet positions. Returns the pieces and the cut length saved, in mm.
 */
export function shareCutEdges(panels: BoxPanel2D[]): { panels: BoxPanel2D[]; savedMm: number } {
  const covered = new Map<string, Interval[]>();
  let savedMm = 0;
  const out = panels.map((panel) => {
    const paths = panel.paths.map((path): DielinePath => {
      if (path.layer !== 'cut' || !path.closed) return path;
      const own: [string, Interval][] = [];
      // Once this path is done, its straight runs count as cut, for later paths of this piece and
      // for later pieces: a slot drawn along a piece's own edge is cut once too.
      const commit = () => {
        for (const [line, span] of own) covered.set(line, [...(covered.get(line) ?? []), span]);
      };
      const local = polygonOf(path.d);
      if (!local) return path;
      const pts = local.map((p) => ({ x: p.x + panel.sheetX, y: p.y + panel.sheetY }));
      const edges: Edge[] = pts.map((a, i) => {
        const b = pts[(i + 1) % pts.length];
        const la = local[i];
        const lb = local[(i + 1) % local.length];
        const edge: Edge = { a, b };
        if (Math.abs(a.x - b.x) < EPS && (Math.abs(la.x) < EPS || Math.abs(la.x - panel.widthMm) < EPS) && Math.abs(lb.x - la.x) < EPS) {
          edge.line = `v${f3(a.x)}`;
          edge.span = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        } else if (Math.abs(a.y - b.y) < EPS && (Math.abs(la.y) < EPS || Math.abs(la.y - panel.heightMm) < EPS) && Math.abs(lb.y - la.y) < EPS) {
          edge.line = `h${f3(a.y)}`;
          edge.span = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        }
        if (edge.line && edge.span![1] - edge.span![0] > EPS) own.push([edge.line, edge.span!]);
        return edge;
      });

      // Each edge's kept stretches, as point pairs running the edge's own way.
      let removedAny = false;
      const kept = edges.map((edge) => {
        if (!edge.line) return [[edge.a, edge.b]];
        const cover = covered.get(edge.line);
        if (!cover) return [[edge.a, edge.b]];
        const remain = subtract(edge.span!, cover);
        const lost = edge.span![1] - edge.span![0] - remain.reduce((s, [p, q]) => s + q - p, 0);
        if (lost < EPS) return [[edge.a, edge.b]];
        removedAny = true;
        savedMm += lost;
        const vertical = edge.line.startsWith('v');
        const at = (t: number): Point2D => (vertical ? { x: edge.a.x, y: t } : { x: t, y: edge.a.y });
        const forward = vertical ? edge.b.y >= edge.a.y : edge.b.x >= edge.a.x;
        const runs = remain.map(([p, q]) => (forward ? [at(p), at(q)] : [at(q), at(p)]));
        return forward ? runs : runs.reverse();
      });
      commit();
      if (!removedAny) return path;

      // Chain the kept stretches into open runs, joining where one ends as the next begins.
      const runs: Point2D[][] = [];
      const same = (p: Point2D, q: Point2D) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
      for (const pieces of kept) {
        for (const [p, q] of pieces) {
          const last = runs[runs.length - 1];
          if (last && same(last[last.length - 1], p)) last.push(q);
          else runs.push([p, q]);
        }
      }
      // The outline wraps round: the last run may lead straight into the first.
      if (runs.length > 1 && same(runs[runs.length - 1][runs[runs.length - 1].length - 1], runs[0][0])) {
        const tail = runs.pop()!;
        runs[0] = [...tail, ...runs[0].slice(1)];
      }
      const d = runs
        .map((run) => run.map((p, i) => `${i === 0 ? 'M' : 'L'} ${f3(p.x - panel.sheetX)} ${f3(p.y - panel.sheetY)}`).join(' '))
        .join(' ');
      return { ...path, d, closed: false };
    });
    return { ...panel, paths };
  });
  return { panels: out, savedMm };
}
