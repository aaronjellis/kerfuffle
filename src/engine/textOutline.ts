/**
 * Text artwork as engraveable vector outlines: each letter's own shapes from the font file, laid out
 * as the canvas draws the text, then merged so overlapping pieces (common in variable-font
 * instances, script joins and accents) become one clean outline with no lines inside it.
 */
import { Clipper, FillRule, Path64, Paths64 } from 'clipper2-js';
import type { TextArtworkConfig } from './types';
import type { TextOutline } from './textPlacement';

export type { TextOutline } from './textPlacement';

/** The canvas text render's em size in pixels; the outline is laid out in the same pixels. */
export const TEXT_RENDER_SIZE_PX = 110;

/** Integer units per pixel for the merge. Clipper works on integers; this keeps 1/1000 px. */
const UNITS_PER_PX = 1000;

/** An outline drawing step in pixels, y down: M and L take x y, Q x1 y1 x y, C x1 y1 x2 y2 x y. */
export interface OutlineCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  values: number[];
}

/** A font that can shape text into placed glyph outlines, as the browser would draw it. */
export interface TextFont {
  hasChar(ch: string): boolean;
  /**
   * The text shaped at `sizePx` (kerning, ligatures, contextual forms): its glyphs' outlines placed
   * from an origin on the baseline, and the advance to the next text.
   */
  shape(text: string, sizePx: number): { advance: number; commands: OutlineCommand[] };
  /** Where Chrome's `textBaseline = 'top'` sits above the baseline: the top of the em box. */
  emTopToBaseline(sizePx: number): number;
}


/** The text's lines, as the canvas render splits them. */
export function textLines(config: TextArtworkConfig): string[] {
  const lines = (config.text || 'TEXT').split(/\r?\n/).filter((l, idx, arr) => l.length > 0 || arr.length === 1);
  return lines.length > 0 ? lines : ['TEXT'];
}

/** A run of a line drawn from one font file: a subset file only has some characters. */
interface Run {
  text: string;
  font: TextFont;
}

/** Splits a line into runs by the first font (subset) that has each character. Null if one has none. */
function runsFor(line: string, fonts: TextFont[]): Run[] | null {
  const runs: Run[] = [];
  for (const ch of line) {
    const font = /\s/.test(ch) ? (runs[runs.length - 1]?.font ?? fonts[0]) : fonts.find((f) => f.hasChar(ch));
    if (!font) return null;
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ text: ch, font });
  }
  return runs;
}

/** The first character none of the fonts can draw, or null when they cover the text. */
export function missingChar(config: TextArtworkConfig, fonts: TextFont[]): string | null {
  for (const line of textLines(config)) {
    for (const ch of line) if (!/\s/.test(ch) && !fonts.some((f) => f.hasChar(ch))) return ch;
  }
  return null;
}

const translate = (commands: OutlineCommand[], dx: number, dy: number): OutlineCommand[] =>
  commands.map((c) => ({ type: c.type, values: c.values.map((v, i) => v + (i % 2 === 0 ? dx : dy)) }));

/**
 * Every line's glyph outlines, placed exactly where the canvas render draws them. `baselineFromTop`
 * overrides the em-box top, for the browser's own measure of it.
 */
export function layoutTextCommands(
  config: TextArtworkConfig,
  fonts: TextFont[],
  baselineFromTop?: number
): { widthPx: number; heightPx: number; lines: { text: string; commands: OutlineCommand[] }[] } {
  const size = TEXT_RENDER_SIZE_PX;
  const lines = textLines(config);
  const tracking = config.letterSpacingEm * size;
  const tracked = Math.abs(tracking) >= 0.5;
  const runsByLine = lines.map((l) => runsFor(l, fonts) ?? [{ text: l, font: fonts[0] }]);
  const shaped = runsByLine.map((runs) => runs.map((r) => r.font.shape(r.text, size)));

  // Widths as the canvas measures them: the whole line, shaped, plus the tracking between letters.
  const lineWidths = lines.map((line, i) => {
    if (!line) return size * 0.5;
    const base = shaped[i].reduce((w, r) => w + r.advance, 0);
    return Math.max(20, base + Math.max(0, line.length - 1) * tracking);
  });
  const maxLineW = Math.max(60, ...lineWidths);
  const lineStep = size * Math.max(0.85, config.lineHeight);
  const padX = Math.round(size * 0.28);
  const padY = Math.round(size * 0.28);
  const widthPx = Math.ceil(maxLineW + padX * 2);
  const heightPx = Math.ceil(size + Math.max(0, lines.length - 1) * lineStep + padY * 2);
  const toBaseline = baselineFromTop ?? fonts[0].emTopToBaseline(size);

  const out = lines.map((line, i) => {
    const lw = lineWidths[i];
    let x = padX;
    if (config.textAlign === 'center') x = (widthPx - lw) / 2;
    else if (config.textAlign === 'right') x = widthPx - padX - lw;
    const baseline = padY + i * lineStep + toBaseline;
    const commands: OutlineCommand[] = [];
    runsByLine[i].forEach((run, r) => {
      if (!tracked) {
        // A whole run at once, as `fillText` draws a line.
        commands.push(...translate(shaped[i][r].commands, x, baseline));
        x += shaped[i][r].advance;
      } else {
        // Letter by letter, each shaped alone plus the tracking, as the canvas render draws it.
        // (UTF-16 units, as its loop steps.)
        for (let k = 0; k < run.text.length; k++) {
          const one = run.font.shape(run.text[k], size);
          commands.push(...translate(one.commands, x, baseline));
          x += one.advance + tracking;
        }
      }
    });
    return { text: line, commands };
  });
  return { widthPx, heightPx, lines: out };
}

/**
 * Flattens path commands into closed polylines, in integer units, with no chord further than
 * `tolerancePx` from its curve.
 */
export function flattenCommands(commands: OutlineCommand[], tolerancePx: number): Paths64 {
  const paths = new Paths64();
  let cur: Path64 | null = null;
  let px = 0;
  let py = 0;
  const push = (x: number, y: number) => {
    cur!.push({ x: Math.round(x * UNITS_PER_PX), y: Math.round(y * UNITS_PER_PX) });
    px = x;
    py = y;
  };
  const close = () => {
    if (cur && cur.length >= 3) paths.push(cur);
    cur = null;
  };
  for (const { type, values: v } of commands) {
    if (type === 'M') {
      close();
      cur = new Path64();
      push(v[0], v[1]);
    } else if (!cur) {
      continue;
    } else if (type === 'L') {
      push(v[0], v[1]);
    } else if (type === 'Q') {
      // A quadratic's chords stray at most |p0 − 2p1 + p2| / (4n²) from it.
      const [x1, y1, x, y] = v;
      const dd = Math.hypot(px - 2 * x1 + x, py - 2 * y1 + y);
      const n = Math.min(256, Math.max(1, Math.ceil(Math.sqrt(dd / (4 * tolerancePx)))));
      const [x0, y0] = [px, py];
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const u = 1 - t;
        push(u * u * x0 + 2 * u * t * x1 + t * t * x, u * u * y0 + 2 * u * t * y1 + t * t * y);
      }
    } else if (type === 'C') {
      // A cubic's, at most 3·max|second difference| / (4n²).
      const [x1, y1, x2, y2, x, y] = v;
      const m = Math.max(Math.hypot(px - 2 * x1 + x2, py - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x, y1 - 2 * y2 + y));
      const n = Math.min(256, Math.max(1, Math.ceil(Math.sqrt((3 * m) / (4 * tolerancePx)))));
      const [x0, y0] = [px, py];
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const u = 1 - t;
        push(
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y
        );
      }
    } else if (type === 'Z') {
      close();
    }
  }
  close();
  return paths;
}

/**
 * Merges a glyph's (or a line's) contours as the browser fills them, by the non-zero rule, so the
 * result has no overlapping pieces and fills the same under either fill rule. Only points on a
 * straight run are dropped: simplifying further would blunt the fine points where strokes meet.
 */
export function mergeContours(paths: Paths64): Paths64 {
  const merged = Clipper.Union(paths, undefined, FillRule.NonZero);
  return merged.map((p) => Clipper.trimCollinear(p)).filter((p) => p.length >= 3) as Paths64;
}

const toPx = (paths: Paths64) => paths.map((p) => p.map((q) => ({ x: q.x / UNITS_PER_PX, y: q.y / UNITS_PER_PX })));

/** The text's merged outlines in the canvas render's pixels, no edge more than `tolerancePx` off its curve. */
export function buildTextOutline(
  config: TextArtworkConfig,
  fonts: TextFont[],
  tolerancePx: number,
  baselineFromTop?: number
): TextOutline {
  const { widthPx, heightPx, lines } = layoutTextCommands(config, fonts, baselineFromTop);
  // Each line merges on its own; lines whose letters reach into each other merge into one group,
  // so no two groups overlap and laser software can fill them together.
  const groups: { text: string; paths: Paths64 }[] = [];
  for (const line of lines) {
    let paths = mergeContours(flattenCommands(line.commands, tolerancePx));
    if (paths.length === 0) continue;
    let text = line.text;
    const prev = groups[groups.length - 1];
    if (prev && Clipper.Intersect(prev.paths, paths, FillRule.NonZero).length > 0) {
      groups.pop();
      paths = mergeContours(Clipper.Union(prev.paths, paths, FillRule.NonZero));
      text = `${prev.text}\n${text}`;
    }
    groups.push({ text, paths });
  }
  return { widthPx, heightPx, groups: groups.map((g) => ({ text: g.text, contours: toPx(g.paths) })) };
}

/** The non-zero filled area of a contour set, in square pixels; even-odd and non-zero agree once merged. */
export function contoursArea(contours: { x: number; y: number }[][]): number {
  let a = 0;
  for (const c of contours) {
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j].x + c[i].x) * (c[j].y - c[i].y);
  }
  return Math.abs(a / 2);
}

/**
 * How much of two ink masks disagrees by more than a pixel, as a share of their combined ink: a
 * pixel counts only when the other mask has no ink within one pixel of it. Antialiasing and the
 * browser's sub-pixel snapping cost nothing; a wrong letter, weight, slant or font costs a lot.
 */
export function maskMismatch(a: Uint8Array, b: Uint8Array, width: number, height: number): number {
  const near = (m: Uint8Array) => {
    const out = new Uint8Array(m.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!m[y * width + x]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx;
            const Y = y + dy;
            if (X >= 0 && Y >= 0 && X < width && Y < height) out[Y * width + X] = 1;
          }
        }
      }
    }
    return out;
  };
  const nearA = near(a);
  const nearB = near(b);
  let bad = 0;
  let ink = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) ink++;
    if ((a[i] && !nearB[i]) || (b[i] && !nearA[i])) bad++;
  }
  return ink === 0 ? 0 : bad / ink;
}
