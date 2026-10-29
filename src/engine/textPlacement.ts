/**
 * Placing a text artwork's merged outlines on the sheet. Kept apart from the outline building, so
 * the exporters can use it without loading the font and geometry libraries.
 */

export interface TextOutline {
  /** The canvas render's size, in its pixels; the artwork's box contains this. */
  widthPx: number;
  heightPx: number;
  /** One merged shape per line of text, or per group of lines whose letters touch. */
  groups: { text: string; contours: { x: number; y: number }[][] }[];
}

/**
 * The outline placed in a box the way the export places the text's picture (`xMidYMid meet`), then
 * turned `rotationDeg` about the box's centre, as SVG path data in the box's units.
 */
export function placeTextOutline(
  outline: TextOutline,
  box: { x: number; y: number; w: number; h: number },
  rotationDeg: number,
  group: TextOutline['groups'][number]
): string {
  const s = Math.min(box.w / outline.widthPx, box.h / outline.heightPx);
  const ox = box.x + (box.w - outline.widthPx * s) / 2;
  const oy = box.y + (box.h - outline.heightPx * s) / 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const n = (v: number) => Number(v.toFixed(4)).toString();
  return group.contours
    .map((c) =>
      c
        .map((p, i) => {
          const x = ox + p.x * s - cx;
          const y = oy + p.y * s - cy;
          return `${i === 0 ? 'M' : 'L'}${n(cx + x * cos - y * sin)} ${n(cy + x * sin + y * cos)}`;
        })
        .join('') + 'Z'
    )
    .join('');
}
