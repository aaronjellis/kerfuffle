/**
 * Where a piece sits on the sheet. A piece is drawn in its own frame, origin at its top left, and
 * placed at `sheetX`/`sheetY`; the packer may also turn it a quarter turn clockwise to fit, which
 * swaps the room it takes on the sheet. Everything that draws or exports a piece goes through here.
 */
import type { BoxPanel2D, Point2D } from './types';
import { fmt, translateSvgPath } from './fingerJointEngine';

type Placed = Pick<BoxPanel2D, 'sheetX' | 'sheetY' | 'widthMm' | 'heightMm' | 'quarterTurn'>;

/** The room the piece takes on the sheet, across and down. */
export const footprint = (p: Placed): { widthMm: number; heightMm: number } =>
  p.quarterTurn ? { widthMm: p.heightMm, heightMm: p.widthMm } : { widthMm: p.widthMm, heightMm: p.heightMm };

/** A point in the piece's frame, on the sheet. Turned clockwise, its left edge becomes its top. */
export const toSheet = (p: Placed, q: Point2D): Point2D =>
  p.quarterTurn ? { x: p.sheetX + p.heightMm - q.y, y: p.sheetY + q.x } : { x: p.sheetX + q.x, y: p.sheetY + q.y };

/** The SVG transform that places the piece's frame on the sheet. */
export const panelTransform = (p: Placed): string =>
  p.quarterTurn
    ? `translate(${fmt(p.sheetX + p.heightMm)}, ${fmt(p.sheetY)}) rotate(90)`
    : `translate(${fmt(p.sheetX)}, ${fmt(p.sheetY)})`;

/** Extra rotation, in degrees clockwise, that anything drawn on the piece takes on the sheet. */
export const placementRotationDeg = (p: Placed): number => (p.quarterTurn ? 90 : 0);

/**
 * A path in the piece's frame (absolute M, L, Q, A and Z, as every piece's paths are) moved onto
 * the sheet. A turn keeps each arc's radii and sweep and turns its axis with it.
 */
export function placeSvgPath(d: string, p: Placed): string {
  if (!p.quarterTurn) return translateSvgPath(d, p.sheetX, p.sheetY, 1);
  const tokens = d.match(/[MLQAZ]|-?\d+(\.\d+)?(e-?\d+)?/g);
  if (!tokens) return d;
  const pt = (xs: string, ys: string) => {
    const q = toSheet(p, { x: parseFloat(xs), y: parseFloat(ys) });
    return `${fmt(q.x)} ${fmt(q.y)}`;
  };
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'M' || cmd === 'L') {
      out.push(`${cmd} ${pt(tokens[i + 1], tokens[i + 2])}`);
      i += 3;
    } else if (cmd === 'Q') {
      out.push(`Q ${pt(tokens[i + 1], tokens[i + 2])} ${pt(tokens[i + 3], tokens[i + 4])}`);
      i += 5;
    } else if (cmd === 'A') {
      const rot = fmt(parseFloat(tokens[i + 3]) + 90);
      out.push(`A ${tokens[i + 1]} ${tokens[i + 2]} ${rot} ${tokens[i + 4]} ${tokens[i + 5]} ${pt(tokens[i + 6], tokens[i + 7])}`);
      i += 8;
    } else {
      out.push(cmd);
      i += 1;
    }
  }
  return out.join(' ');
}
