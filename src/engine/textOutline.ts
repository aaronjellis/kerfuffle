/**
 * Badge text as merged vector outlines: each line shaped whole by HarfBuzz (kerning, ligatures,
 * script joins), spaced by tracking and per-pair adjustments, then merged so overlapping pieces
 * become one clean outline with no lines inside it. Works in pixels, y down, at
 * `TEXT_RENDER_SIZE_PX`; the badge scales the result to its cap height in mm.
 */
import { Clipper, FillRule, Path64, Paths64 } from 'clipper2-js';
import { bounds, fromPaths64, type Poly, type Rect } from './geom';

/** The em size the outline is laid out at, in pixels. */
export const TEXT_RENDER_SIZE_PX = 100;

/** Integer units per pixel for the merge. Clipper works on integers; this keeps 1/1000 px. */
const UNITS_PER_PX = 1000;

/** An outline drawing step in pixels, y down: M and L take x y, Q x1 y1 x y, C x1 y1 x2 y2 x y. */
export interface OutlineCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  values: number[];
}

/** One shaped glyph: the UTF-16 index of the text it came from, its advance, and its outline placed from the run origin. */
export interface ShapedGlyph {
  cluster: number;
  advance: number;
  commands: OutlineCommand[];
}

/** A font that can shape text into placed glyph outlines, as the browser would draw it. */
export interface TextFont {
  hasChar(ch: string): boolean;
  /** The text shaped at `sizePx` (kerning, ligatures, contextual forms), glyph by glyph from an origin on the baseline. */
  shape(text: string, sizePx: number): { advance: number; glyphs: ShapedGlyph[] };
  /** Where the top of the em box sits above the baseline. */
  emTopToBaseline(sizePx: number): number;
}

/** A badge's text. `pairAdjustEm` keys are "line:charIndex", the pair starting at that UTF-16 index. */
export interface TextConfig {
  text: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  align: 'left' | 'center' | 'right';
  letterSpacingEm: number;
  lineHeight: number;
  pairAdjustEm: Record<string, number>;
}

export const DEFAULT_TEXT: TextConfig = {
  text: 'YOUR NAME',
  family: 'Cinzel',
  weight: 700,
  style: 'normal',
  align: 'center',
  letterSpacingEm: 0.04,
  lineHeight: 1.2,
  pairAdjustEm: {},
};

/** The merged text in px, y down, with what the stage needs to size it and draw kerning handles. */
export interface TextOutline {
  poly: Poly;
  capHeightPx: number;
  ink: Rect;
  /** The left edge of each cluster's first glyph, one per cluster per line, in order. */
  clusters: { line: number; index: number; xPx: number }[];
  lines: number;
  /** Each line's baseline y, in order. */
  baselinesPx: number[];
}

/**
 * The lines of a text, blank ones included: a blank line is drawn as nothing but still takes its
 * line height, and empty text is one blank line. The stage splits text the same way, so its line
 * numbers match the outline's.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

const textLines = (config: TextConfig): string[] => splitLines(config.text);

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
export function missingChar(config: TextConfig, fonts: TextFont[]): string | null {
  for (const line of textLines(config)) {
    for (const ch of line) if (!/\s/.test(ch) && !fonts.some((f) => f.hasChar(ch))) return ch;
  }
  return null;
}

const translate = (commands: OutlineCommand[], dx: number, dy: number): OutlineCommand[] =>
  commands.map((c) => ({ type: c.type, values: c.values.map((v, i) => v + (i % 2 === 0 ? dx : dy)) }));

/** A glyph on a line: its cluster's index in the line, its pen x and its outline from the line origin. */
interface LineGlyph {
  cluster: number;
  x: number;
  commands: OutlineCommand[];
}

/** Shapes a line run by run and puts every glyph on one origin, clusters indexed in the whole line. */
function shapeLine(line: string, fonts: TextFont[], size: number): { advance: number; glyphs: LineGlyph[] } {
  const runs = runsFor(line, fonts) ?? [{ text: line, font: fonts[0] }];
  const out: LineGlyph[] = [];
  let x = 0;
  let offset = 0;
  for (const run of runs) {
    const shaped = run.font.shape(run.text, size);
    let pen = 0;
    for (const g of shaped.glyphs) {
      out.push({ cluster: offset + g.cluster, x: x + pen, commands: translate(g.commands, x, 0) });
      pen += g.advance;
    }
    x += shaped.advance;
    offset += run.text.length;
  }
  return { advance: x, glyphs: out };
}

/**
 * Every line's glyph outlines, placed: each glyph moves right by the tracking for every cluster
 * before its own and by every pair adjustment below its cluster; lines stack by the line height and
 * align by their spaced widths.
 */
function layoutText(config: TextConfig, fonts: TextFont[]) {
  const size = TEXT_RENDER_SIZE_PX;
  const tracking = config.letterSpacingEm * size;
  const lines = textLines(config).map((line, i) => {
    const { advance, glyphs } = shapeLine(line, fonts, size);
    const starts = [...new Set(glyphs.map((g) => g.cluster))].sort((a, b) => a - b);
    const pairs = Object.entries(config.pairAdjustEm)
      .map(([key, em]) => ({ key: key.split(':').map(Number), dx: em * size }))
      .filter(({ key }) => key.length === 2 && key[0] === i && Number.isFinite(key[1]));
    const shift = (cluster: number) =>
      tracking * starts.filter((c) => c < cluster).length +
      pairs.reduce((sum, p) => (p.key[1] < cluster ? sum + p.dx : sum), 0);
    const width = glyphs.length > 0 ? advance + shift(glyphs[glyphs.length - 1].cluster) : 0;
    return { glyphs, shift, width };
  });
  const maxW = Math.max(0, ...lines.map((l) => l.width));
  const top = fonts[0].emTopToBaseline(size);
  const step = config.lineHeight * size;

  const commands: OutlineCommand[] = [];
  const clusters: TextOutline['clusters'] = [];
  const baselinesPx = lines.map((_, i) => top + i * step);
  lines.forEach((l, i) => {
    const x0 = config.align === 'center' ? (maxW - l.width) / 2 : config.align === 'right' ? maxW - l.width : 0;
    const baseline = baselinesPx[i];
    const seen = new Set<number>();
    for (const g of l.glyphs) {
      const dx = x0 + l.shift(g.cluster);
      commands.push(...translate(g.commands, dx, baseline));
      if (!seen.has(g.cluster)) {
        seen.add(g.cluster);
        clusters.push({ line: i, index: g.cluster, xPx: g.x + dx });
      }
    }
  });
  return { commands, clusters, lines: lines.length, baselinesPx };
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

/** The height of the font's 'H' ink at `sizePx` (else 'X'), or 0.7 em when it has neither. */
export function capHeightPx(font: TextFont, sizePx: number): number {
  for (const ch of ['H', 'X']) {
    if (!font.hasChar(ch)) continue;
    const ink = bounds(fromPaths64(flattenCommands(font.shape(ch, sizePx).glyphs.flatMap((g) => g.commands), 0.01)));
    if (ink && ink.h > 0) return ink.h;
  }
  return 0.7 * sizePx;
}

/** The text's merged outline in px at `TEXT_RENDER_SIZE_PX`, no edge more than `tolPx` off its curve. */
export function buildTextOutline(config: TextConfig, fonts: TextFont[], tolPx: number): TextOutline {
  const { commands, clusters, lines, baselinesPx } = layoutText(config, fonts);
  // Clipper's units are 1/1000 px here, the same scale `fromPaths64` divides by for mm.
  const poly = fromPaths64(mergeContours(flattenCommands(commands, tolPx)));
  return {
    poly,
    capHeightPx: capHeightPx(fonts[0], TEXT_RENDER_SIZE_PX),
    ink: bounds(poly) ?? { x: 0, y: 0, w: 0, h: 0 },
    clusters,
    lines,
    baselinesPx,
  };
}
