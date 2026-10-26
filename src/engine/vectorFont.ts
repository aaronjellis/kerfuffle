import { fmt } from './fingerJointEngine';

/**
 * Single-stroke CNC / laser-score vector font (Hershey-style geometric glyphs).
 * Each glyph is defined in normalized coordinates:
 *   x in [0, 1] (left to right)
 *   y in [0, 1] (top to bottom)
 * Each polyline is an array of [x, y] points.
 */
const GLYPHS: Record<string, [number, number][][]> = {
  A: [
    [[0, 1], [0.5, 0], [1, 1]],
    [[0.2, 0.65], [0.8, 0.65]],
  ],
  B: [
    [[0, 1], [0, 0], [0.7, 0], [0.95, 0.12], [0.95, 0.36], [0.7, 0.48], [0, 0.48]],
    [[0.7, 0.48], [1, 0.62], [1, 0.88], [0.72, 1], [0, 1]],
  ],
  C: [
    [[1, 0.2], [0.78, 0], [0.25, 0], [0, 0.22], [0, 0.78], [0.25, 1], [0.78, 1], [1, 0.8]],
  ],
  D: [
    [[0, 0], [0.65, 0], [1, 0.25], [1, 0.75], [0.65, 1], [0, 1], [0, 0]],
  ],
  E: [
    [[1, 0], [0, 0], [0, 1], [1, 1]],
    [[0, 0.48], [0.75, 0.48]],
  ],
  F: [
    [[1, 0], [0, 0], [0, 1]],
    [[0, 0.48], [0.75, 0.48]],
  ],
  G: [
    [[1, 0.2], [0.78, 0], [0.25, 0], [0, 0.22], [0, 0.78], [0.25, 1], [0.8, 1], [1, 0.78], [1, 0.52], [0.55, 0.52]],
  ],
  H: [
    [[0, 0], [0, 1]],
    [[1, 0], [1, 1]],
    [[0, 0.48], [1, 0.48]],
  ],
  I: [
    [[0.2, 0], [0.8, 0]],
    [[0.5, 0], [0.5, 1]],
    [[0.2, 1], [0.8, 1]],
  ],
  J: [
    [[0.2, 0], [0.9, 0]],
    [[0.65, 0], [0.65, 0.8], [0.45, 1], [0.18, 1], [0, 0.82]],
  ],
  K: [
    [[0, 0], [0, 1]],
    [[1, 0], [0, 0.52], [1, 1]],
  ],
  L: [
    [[0, 0], [0, 1], [1, 1]],
  ],
  M: [
    [[0, 1], [0, 0], [0.5, 0.55], [1, 0], [1, 1]],
  ],
  N: [
    [[0, 1], [0, 0], [1, 1], [1, 0]],
  ],
  O: [
    [[0.25, 0], [0.75, 0], [1, 0.22], [1, 0.78], [0.75, 1], [0.25, 1], [0, 0.78], [0, 0.22], [0.25, 0]],
  ],
  P: [
    [[0, 1], [0, 0], [0.75, 0], [1, 0.16], [1, 0.38], [0.75, 0.54], [0, 0.54]],
  ],
  Q: [
    [[0.25, 0], [0.75, 0], [1, 0.22], [1, 0.78], [0.75, 1], [0.25, 1], [0, 0.78], [0, 0.22], [0.25, 0]],
    [[0.58, 0.65], [1, 1]],
  ],
  R: [
    [[0, 1], [0, 0], [0.75, 0], [1, 0.16], [1, 0.38], [0.75, 0.52], [0, 0.52]],
    [[0.55, 0.52], [1, 1]],
  ],
  S: [
    [[0.95, 0.18], [0.75, 0], [0.25, 0], [0.05, 0.16], [0.05, 0.36], [0.25, 0.48], [0.75, 0.54], [0.95, 0.68], [0.95, 0.86], [0.72, 1], [0.22, 1], [0, 0.84]],
  ],
  T: [
    [[0, 0], [1, 0]],
    [[0.5, 0], [0.5, 1]],
  ],
  U: [
    [[0, 0], [0, 0.78], [0.25, 1], [0.75, 1], [1, 0.78], [1, 0]],
  ],
  V: [
    [[0, 0], [0.5, 1], [1, 0]],
  ],
  W: [
    [[0, 0], [0.24, 1], [0.5, 0.45], [0.76, 1], [1, 0]],
  ],
  X: [
    [[0, 0], [1, 1]],
    [[1, 0], [0, 1]],
  ],
  Y: [
    [[0, 0], [0.5, 0.5], [1, 0]],
    [[0.5, 0.5], [0.5, 1]],
  ],
  Z: [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
  ],
  '0': [
    [[0.25, 0], [0.75, 0], [1, 0.22], [1, 0.78], [0.75, 1], [0.25, 1], [0, 0.78], [0, 0.22], [0.25, 0]],
    [[0.15, 0.82], [0.85, 0.18]],
  ],
  '1': [
    [[0.2, 0.2], [0.55, 0], [0.55, 1]],
    [[0.2, 1], [0.9, 1]],
  ],
  '2': [
    [[0.05, 0.22], [0.28, 0], [0.75, 0], [0.98, 0.2], [0.98, 0.42], [0, 1], [1, 1]],
  ],
  '3': [
    [[0.08, 0.16], [0.28, 0], [0.75, 0], [0.96, 0.18], [0.96, 0.36], [0.72, 0.48], [0.35, 0.48]],
    [[0.72, 0.48], [1, 0.64], [1, 0.84], [0.75, 1], [0.25, 1], [0.05, 0.84]],
  ],
  '4': [
    [[0.78, 1], [0.78, 0], [0, 0.68], [1, 0.68]],
  ],
  '5': [
    [[0.95, 0], [0.08, 0], [0.05, 0.46], [0.72, 0.46], [0.98, 0.62], [0.98, 0.84], [0.72, 1], [0.22, 1], [0.04, 0.84]],
  ],
  '6': [
    [[0.88, 0.14], [0.68, 0], [0.28, 0], [0, 0.25], [0, 0.8], [0.25, 1], [0.75, 1], [0.98, 0.8], [0.98, 0.58], [0.75, 0.44], [0, 0.44]],
  ],
  '7': [
    [[0, 0], [1, 0], [0.35, 1]],
  ],
  '8': [
    [[0.25, 0.48], [0.05, 0.34], [0.05, 0.16], [0.25, 0], [0.75, 0], [0.95, 0.16], [0.95, 0.34], [0.75, 0.48], [0.25, 0.48], [0, 0.64], [0, 0.84], [0.25, 1], [0.75, 1], [1, 0.84], [1, 0.64], [0.75, 0.48]],
  ],
  '9': [
    [[1, 0.54], [0.25, 0.54], [0.02, 0.38], [0.02, 0.18], [0.25, 0], [0.75, 0], [1, 0.2], [1, 0.78], [0.72, 1], [0.25, 1]],
  ],
  '-': [
    [[0.15, 0.5], [0.85, 0.5]],
  ],
  '_': [
    [[0, 1], [1, 1]],
  ],
  '/': [
    [[0.15, 1], [0.85, 0]],
  ],
  '.': [
    [[0.4, 0.88], [0.6, 0.88], [0.6, 1], [0.4, 1], [0.4, 0.88]],
  ],
  ':': [
    [[0.42, 0.25], [0.58, 0.25], [0.58, 0.38], [0.42, 0.38], [0.42, 0.25]],
    [[0.42, 0.75], [0.58, 0.75], [0.58, 0.88], [0.42, 0.88], [0.42, 0.75]],
  ],
  '(': [
    [[0.7, 0], [0.3, 0.3], [0.3, 0.7], [0.7, 1]],
  ],
  ')': [
    [[0.3, 0], [0.7, 0.3], [0.7, 0.7], [0.3, 1]],
  ],
  '×': [
    [[0.15, 0.22], [0.85, 0.78]],
    [[0.85, 0.22], [0.15, 0.78]],
  ],
  '+': [
    [[0.5, 0.18], [0.5, 0.82]],
    [[0.15, 0.5], [0.85, 0.5]],
  ],
  '#': [
    [[0.3, 0.1], [0.2, 0.9]],
    [[0.8, 0.1], [0.7, 0.9]],
    [[0.1, 0.36], [0.9, 0.36]],
    [[0.1, 0.66], [0.9, 0.66]],
  ],
  '&': [
    [[0.95, 1], [0.18, 0.35], [0.18, 0.14], [0.38, 0], [0.62, 0], [0.78, 0.14], [0.78, 0.32], [0.05, 0.68], [0.05, 0.86], [0.25, 1], [0.68, 1], [0.95, 0.72]],
  ],
};

export interface VectorTextOptions {
  /** Center X in panel-local coordinates (mm) */
  centerX: number;
  /** Center Y in panel-local coordinates (mm) */
  centerY: number;
  /** Cap height of each line in mm */
  capHeightMm: number;
  /** Maximum width allowed in mm (auto-scales down if text is wider) */
  maxWidthMm?: number;
  /** Flip horizontally (for back-side laser scoring) */
  mirrorX?: boolean;
}

/**
 * Renders one or more lines of text into a single compound SVG path string (`M ... L ...`)
 * suitable for single-stroke laser scoring in SVG, PDF, and DXF.
 */
export function buildSingleStrokeTextPath(
  lines: string[],
  options: VectorTextOptions
): string {
  const cleanLines = lines.map((l) => l.trim().toUpperCase()).filter(Boolean);
  if (cleanLines.length === 0) return '';

  const { centerX, centerY, mirrorX = false } = options;
  let capH = Math.max(1.8, options.capHeightMm);
  const charAspect = 0.64; // width = capH * 0.64
  const trackingRatio = 0.28; // gap = capH * 0.28
  const lineGapRatio = 0.45;

  const maxChars = Math.max(...cleanLines.map((l) => l.length));
  if (options.maxWidthMm && maxChars > 0) {
    const unitLineW = maxChars * charAspect + Math.max(0, maxChars - 1) * trackingRatio;
    const neededW = unitLineW * capH;
    if (neededW > options.maxWidthMm) {
      capH = Math.max(1.5, options.maxWidthMm / unitLineW);
    }
  }

  const charW = capH * charAspect;
  const gapW = capH * trackingRatio;
  const lineStepY = capH * (1 + lineGapRatio);
  const totalBlockH = cleanLines.length * capH + Math.max(0, cleanLines.length - 1) * (capH * lineGapRatio);
  const blockStartY = centerY - totalBlockH / 2;

  const subpaths: string[] = [];

  cleanLines.forEach((line, lineIdx) => {
    const lineW = line.length * charW + Math.max(0, line.length - 1) * gapW;
    const lineStartX = centerX - lineW / 2;
    const lineTopY = blockStartY + lineIdx * lineStepY;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === ' ') continue;
      const strokes = GLYPHS[ch] || GLYPHS['-'];
      if (!strokes) continue;

      const charLeftX = lineStartX + i * (charW + gapW);

      for (const stroke of strokes) {
        if (stroke.length < 2) continue;
        const cmds: string[] = [];
        for (let ptIdx = 0; ptIdx < stroke.length; ptIdx++) {
          const [nx, ny] = stroke[ptIdx];
          const rawX = charLeftX + nx * charW;
          const x = mirrorX ? 2 * centerX - rawX : rawX;
          const y = lineTopY + ny * capH;
          cmds.push(`${ptIdx === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)}`);
        }
        subpaths.push(cmds.join(' '));
      }
    }
  });

  return subpaths.join(' ');
}
