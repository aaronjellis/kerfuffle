import { describe, expect, it } from 'vitest';
import { Clipper, FillRule, Paths64 } from 'clipper2-js';
import { harfbuzzFont } from '../src/engine/hbFont';
import {
  TEXT_RENDER_SIZE_PX,
  buildTextOutline,
  contoursArea,
  flattenCommands,
  layoutTextCommands,
  maskMismatch,
  mergeContours,
  missingChar,
  type TextFont,
} from '../src/engine/textOutline';
import { placeTextOutline } from '../src/engine/textPlacement';
import { DEFAULT_TEXT_ARTWORK_CONFIG } from '../src/engine/googleFonts';
import type { TextArtworkConfig } from '../src/engine/types';

// Real Google Fonts, as Fontsource serves them (latin subset TTFs, OFL-licensed), chosen to cover a
// heavy display face, an engraved serif, a condensed caps face, a thin italic and three scripts
// whose letters join.
const files = import.meta.glob('./fixtures/fonts/*.ttf', { query: '?inline', import: 'default', eager: true }) as Record<
  string,
  string
>;
const fontCache = new Map<string, TextFont>();
const font = (name: string): TextFont => {
  let f = fontCache.get(name);
  if (!f) {
    const b64 = files[`./fixtures/fonts/${name}.ttf`].split(',')[1];
    f = harfbuzzFont(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer);
    fontCache.set(name, f);
  }
  return f;
};

const FONTS = [
  'paytone-one-400-normal',
  'cinzel-700-normal',
  'bebas-neue-400-normal',
  'playfair-display-400-italic',
  'lobster-400-normal',
  'pacifico-400-normal',
  'great-vibes-400-normal',
] as const;
const SCRIPTS = ['lobster-400-normal', 'pacifico-400-normal', 'great-vibes-400-normal'] as const;
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&@?!éñü';

const config = (patch: Partial<TextArtworkConfig>): TextArtworkConfig => ({
  ...DEFAULT_TEXT_ARTWORK_CONFIG,
  letterSpacingEm: 0,
  ...patch,
});

type Pt = { x: number; y: number };
const toPx = (paths: Paths64): Pt[][] => paths.map((p) => p.map((q) => ({ x: q.x / 1000, y: q.y / 1000 })));

/**
 * Fills contours onto a pixel grid by scanline at each pixel centre, as a renderer would: by the
 * non-zero rule (how browsers fill a glyph) or even-odd (how most laser software fills a shape).
 */
function rasterize(contours: Pt[][], rule: 'nonzero' | 'evenodd', x0: number, y0: number, w: number, h: number, scale: number) {
  const mask = new Uint8Array(w * h);
  const edges = contours.flatMap((c) => c.map((p, i) => [p, c[(i + 1) % c.length]] as const));
  for (let row = 0; row < h; row++) {
    const y = y0 + (row + 0.5) / scale;
    const hits: { x: number; dir: number }[] = [];
    for (const [a, b] of edges) {
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        hits.push({ x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x), dir: b.y > a.y ? 1 : -1 });
      }
    }
    hits.sort((p, q) => p.x - q.x);
    let wind = 0;
    for (let k = 0; k < hits.length - 1; k++) {
      wind = rule === 'nonzero' ? wind + hits[k].dir : wind ^ 1;
      if (wind === 0) continue;
      const from = Math.max(0, Math.ceil((hits[k].x - x0) * scale - 0.5));
      const to = Math.min(w - 1, Math.floor((hits[k + 1].x - x0) * scale - 0.5));
      for (let col = from; col <= to; col++) mask[row * w + col] = 1;
    }
  }
  return mask;
}

/** Compares two contour sets as filled shapes over their joint bounds, 8 samples per pixel. */
function fillMismatch(a: Pt[][], ruleA: 'nonzero' | 'evenodd', b: Pt[][], ruleB: 'nonzero' | 'evenodd') {
  const all = [...a, ...b].flat();
  const minX = Math.min(...all.map((p) => p.x)) - 2;
  const minY = Math.min(...all.map((p) => p.y)) - 2;
  const scale = 8;
  const w = Math.ceil((Math.max(...all.map((p) => p.x)) + 2 - minX) * scale);
  const h = Math.ceil((Math.max(...all.map((p) => p.y)) + 2 - minY) * scale);
  return maskMismatch(rasterize(a, ruleA, minX, minY, w, h, scale), rasterize(b, ruleB, minX, minY, w, h, scale), w, h);
}

const bounds = (contours: Pt[][]) => {
  const all = contours.flat();
  return {
    minX: Math.min(...all.map((p) => p.x)),
    maxX: Math.max(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
};

/** Distance from a point to the nearest edge of a contour set. */
function distanceToEdges(p: Pt, contours: Pt[][]) {
  let best = Infinity;
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
  }
  return best;
}

/** A glyph's outline, merged at the export's tolerance, against a near-exact unmerged reference. */
const glyph = (name: string, ch: string, tolerance = 0.05) => {
  const commands = font(name).shape(ch, TEXT_RENDER_SIZE_PX).commands;
  return {
    reference: toPx(flattenCommands(commands, 0.002)),
    merged: toPx(mergeContours(flattenCommands(commands, tolerance))),
  };
};

describe('glyph fidelity', () => {
  // The core promise: every letter fills, under a laser's even-odd rule, exactly the pixels the
  // browser fills from the font's own outline, at 8 samples per pixel of the 110 px render.
  it.each(FONTS)('%s: every glyph fills the same as the font draws it', (name) => {
    for (const ch of GLYPHS) {
      const { reference, merged } = glyph(name, ch);
      expect(fillMismatch(reference, 'nonzero', merged, 'evenodd'), `${name} "${ch}"`).toBe(0);
    }
  });

  it.each(FONTS)('%s: no outline point strays more than the tolerance from the true curve', (name) => {
    const tolerance = 0.05;
    for (const ch of 'aegsQR&@') {
      const { reference, merged } = glyph(name, ch, tolerance);
      const worst = Math.max(...merged.flat().map((p) => distanceToEdges(p, reference)));
      expect(worst, `${name} "${ch}"`).toBeLessThanOrEqual(tolerance + 0.002);
    }
  });

  it.each(FONTS)('%s: keeps each glyph\'s area and extent', (name) => {
    const tolerance = 0.05;
    for (const ch of GLYPHS) {
      const { reference, merged } = glyph(name, ch, tolerance);
      const refArea = Math.abs(
        Clipper.areaPaths(
          Clipper.Union(toUnits(reference), undefined, FillRule.NonZero)
        ) / 1e6
      );
      // Chords cut inside each curve by at most the tolerance, so the area can shrink by no more
      // than the outline's length times it.
      const perimeter = merged.reduce(
        (sum, c) => sum + c.reduce((s, p, i) => s + Math.hypot(c[(i + 1) % c.length].x - p.x, c[(i + 1) % c.length].y - p.y), 0),
        0
      );
      expect(Math.abs(contoursArea(merged) - refArea), `${name} "${ch}" area`).toBeLessThanOrEqual(perimeter * tolerance);
      const a = bounds(reference);
      const b = bounds(merged);
      for (const k of ['minX', 'maxX', 'minY', 'maxY'] as const) {
        expect(Math.abs(a[k] - b[k]), `${name} "${ch}" ${k}`).toBeLessThan(tolerance + 0.01);
      }
    }
  });

  // A fingerprint of every glyph: its pieces and holes, area and extent. Any change to how a
  // letter comes out (a lost counter, a filled-in hole, a clipped serif) changes the snapshot.
  it.each(FONTS)('%s: glyph fingerprints are unchanged', (name) => {
    const prints = [...GLYPHS].map((ch) => {
      const { merged } = glyph(name, ch);
      // Clipper turns outer contours one way and holes the other.
      const signed = merged.map(signedArea);
      const outer = Math.sign(signed.reduce((m, a) => (Math.abs(a) > Math.abs(m) ? a : m), 0));
      const b = bounds(merged);
      return `${ch} pieces=${signed.filter((a) => Math.sign(a) === outer).length} holes=${
        signed.filter((a) => Math.sign(a) !== outer).length
      } area=${contoursArea(merged).toFixed(0)} box=${(b.maxX - b.minX).toFixed(1)}x${(b.maxY - b.minY).toFixed(1)}`;
    });
    expect(prints).toMatchSnapshot();
  });

  const holeCount = (contours: Pt[][]) => {
    const outer = Math.sign(signedArea(contours.reduce((big, c) => (contoursArea([c]) > contoursArea([big]) ? c : big))));
    // Clipper turns holes the opposite way to the pieces around them. Slivers under a square pixel
    // (rounding specks in the ultra-fine reference) aren't counters.
    return contours.filter((c) => Math.sign(signedArea(c)) !== outer && contoursArea([c]) > 1).length;
  };

  it.each(FONTS)('%s: keeps every counter of every glyph, and adds none', (name) => {
    for (const ch of GLYPHS) {
      const { reference, merged } = glyph(name, ch);
      const truth = toPx(Clipper.Union(toUnits(reference), undefined, FillRule.NonZero));
      expect(holeCount(merged), `${name} "${ch}"`).toBe(holeCount(truth));
    }
  });

  // Enclosed counters per letter, counted in Chrome's own canvas render of each font at 110 px.
  // Cinzel's B, P and R have open bowls; Lobster's O is an open loop. (Letters whose strokes pass
  // within a pixel of each other, like Lobster's g, are left out: Chrome's pixels close those gaps.)
  it.each([
    ['paytone-one-400-normal', 'O1A1B2D1P1R182'],
    ['cinzel-700-normal', 'O1A1B1D1P0R082'],
    ['bebas-neue-400-normal', 'O1A1B2D1P1R182'],
    ['playfair-display-400-italic', 'O1A1B2D1P1R182'],
    ['lobster-400-normal', 'O0A1B0D0P0R082'],
  ] as const)('%s: has the counters the browser draws', (name, chrome) => {
    const counted = [...'OABDPR8'].map((ch) => `${ch}${holeCount(glyph(name, ch).merged)}`).join('');
    expect(counted).toBe(chrome);
  });
});

const toUnits = (contours: Pt[][]) =>
  contours.map((c) => c.map((p) => ({ x: Math.round(p.x * 1000), y: Math.round(p.y * 1000) }))) as Paths64;

function signedArea(c: Pt[]) {
  let a = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j].x + c[i].x) * (c[j].y - c[i].y);
  return a / 2;
}

describe('overlapping pieces', () => {
  it('merges overlapping contours into one clean outline', () => {
    // A plus sign drawn as two crossing bars, both turning the same way: a browser fills it solid,
    // but even-odd laser fill would punch a hole where they cross.
    const bar = (x: number, y: number, w: number, h: number) => [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
    const toUnits = (c: Pt[]) => c.map((p) => ({ x: p.x * 1000, y: p.y * 1000 }));
    const raw = [toUnits(bar(0, 40, 100, 20)), toUnits(bar(40, 0, 20, 100))] as Paths64;
    const merged = toPx(mergeContours(raw));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toHaveLength(12);
    expect(contoursArea(merged)).toBeCloseTo(100 * 20 * 2 - 20 * 20, 3);
  });

  it.each(SCRIPTS)('%s: joined letters fill solid where they overlap', (name) => {
    const tolerance = 0.05;
    const cfg = config({ text: 'Handcrafted goods', textAlign: 'left' });
    const { lines } = layoutTextCommands(cfg, [font(name)]);
    const raw = toPx(flattenCommands(lines[0].commands, 0.002));
    const merged = buildTextOutline(cfg, [font(name)], tolerance).groups[0].contours;
    // Unmerged, the letters' overlaps would come out hollow under even-odd fill...
    expect(fillMismatch(raw, 'nonzero', raw, 'evenodd'), `${name} unmerged`).toBeGreaterThan(0.001);
    // ...merged, they fill as the browser draws them. Where two strokes cross at a shallow angle,
    // the crossing of their flattened chords can sit a few tolerances off the true one, so allow
    // a handful of 1/8 px samples, and bound how far any point strays.
    expect(fillMismatch(raw, 'nonzero', merged, 'evenodd'), `${name} merged`).toBeLessThan(1e-5);
    const truth = toPx(Clipper.Union(toUnits(raw), undefined, FillRule.NonZero));
    const worst = Math.max(...merged.flat().map((p) => distanceToEdges(p, truth)));
    expect(worst, `${name} farthest point`).toBeLessThan(4 * tolerance);
  });

  it('merges lines whose letters reach into each other into one shape', () => {
    // Tight leading: the descenders of the first line run into the second.
    const cfg = config({ text: 'gypsy\nHello', lineHeight: 0.85, textAlign: 'left' });
    const outline = buildTextOutline(cfg, [font('great-vibes-400-normal')], 0.05);
    expect(outline.groups).toHaveLength(1);
    expect(outline.groups[0].text).toBe('gypsy\nHello');
    const apart = buildTextOutline({ ...cfg, lineHeight: 1.6 }, [font('great-vibes-400-normal')], 0.05);
    expect(apart.groups.map((g) => g.text)).toEqual(['gypsy', 'Hello']);
  });
});

describe('shaping as the browser does', () => {
  const advanceOf = (name: string, text: string) => font(name).shape(text, TEXT_RENDER_SIZE_PX).advance;
  const glyphCount = (name: string, text: string) =>
    font(name).shape(text, TEXT_RENDER_SIZE_PX).commands.filter((c) => c.type === 'M').length;

  it('kerns letter pairs', () => {
    for (const name of ['playfair-display-400-italic', 'cinzel-700-normal'] as const) {
      expect(advanceOf(name, 'AV'), name).toBeLessThan(advanceOf(name, 'A') + advanceOf(name, 'V'));
    }
  });

  it('uses the script fonts\' joined and contextual forms, not letters set side by side', () => {
    // Lobster swaps in joined forms by context; set letter by letter the word comes out different.
    for (const name of SCRIPTS) {
      const word = 'Coffee';
      const alone = [...word].reduce((a, ch) => a + advanceOf(name, ch), 0);
      const shaped = advanceOf(name, word);
      const sameShapes = glyphCount(name, word) === [...word].reduce((a, ch) => a + glyphCount(name, ch), 0);
      expect(shaped !== alone || !sameShapes, name).toBe(true);
    }
  });

  // Chrome's own `textBaseline = 'top'` offsets at 110 px, measured in the browser.
  it.each([
    ['paytone-one-400-normal', 87.703125],
    ['lobster-400-normal', 88],
    ['playfair-display-400-italic', 89.28125],
    ['great-vibes-400-normal', 74.765625],
  ] as const)('%s: puts the baseline where Chrome draws it', (name, chrome) => {
    expect(Math.abs(font(name).emTopToBaseline(TEXT_RENDER_SIZE_PX) - chrome)).toBeLessThan(0.25);
  });
});

describe('layout matches the canvas render', () => {
  const paytone = () => [font('paytone-one-400-normal')];

  it('sizes the box as the canvas does', () => {
    const cfg = config({ fontFamily: 'Paytone One', fontWeight: '400', text: 'HANDCRAFTED\nGOODS CO.' });
    const { widthPx, heightPx } = layoutTextCommands(cfg, paytone());
    // Measured from the canvas render of the same text in Chrome.
    expect(widthPx).toBe(880);
    expect(heightPx).toBe(304);
  });

  it('aligns each line left, centre or right inside the padding', () => {
    const left = (align: TextArtworkConfig['textAlign']) => {
      const out = buildTextOutline(config({ text: 'WIDE LINE\nI', textAlign: align, lineHeight: 1.6 }), paytone(), 0.05);
      return bounds(out.groups[1].contours).minX;
    };
    const pad = Math.round(TEXT_RENDER_SIZE_PX * 0.28);
    expect(left('left')).toBeLessThan(pad + 15);
    expect(left('center')).toBeGreaterThan(left('left') + 100);
    expect(left('right')).toBeGreaterThan(left('center') + 100);
  });

  it('spaces tracked letters by their own widths plus the tracking', () => {
    const loose = buildTextOutline(config({ text: 'II', letterSpacingEm: 0.5, textAlign: 'left' }), paytone(), 0.05);
    const tight = buildTextOutline(config({ text: 'II', letterSpacingEm: 0, textAlign: 'left' }), paytone(), 0.05);
    const gap = (o: typeof loose) => {
      const xs = o.groups[0].contours.map((c) => bounds([c]).minX).sort((a, b) => a - b);
      return xs[1] - xs[0];
    };
    expect(gap(loose) - gap(tight)).toBeCloseTo(0.5 * TEXT_RENDER_SIZE_PX, 0);
  });

  it('finds characters the font files can\'t draw', () => {
    expect(missingChar(config({ text: 'Café' }), paytone())).toBeNull();
    expect(missingChar(config({ text: 'Привет' }), paytone())).toBe('П');
  });
});

describe('placing the outline', () => {
  const outline = { widthPx: 200, heightPx: 100, groups: [{ text: 'x', contours: [[{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }]] }] };
  const points = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));

  it('fits inside the artwork box at its own shape, centred', () => {
    const pts = points(placeTextOutline(outline, { x: 10, y: 10, w: 40, h: 40 }, 0, outline.groups[0]));
    expect(bounds([pts])).toEqual({ minX: 10, maxX: 50, minY: 20, maxY: 40 });
  });

  it('turns about the box centre', () => {
    const pts = points(placeTextOutline(outline, { x: 0, y: 0, w: 40, h: 40 }, 90, outline.groups[0]));
    const b = bounds([pts]);
    expect(b.minX).toBeCloseTo(10, 6);
    expect(b.maxX).toBeCloseTo(30, 6);
    expect(b.minY).toBeCloseTo(0, 6);
    expect(b.maxY).toBeCloseTo(40, 6);
  });
});

describe('mask mismatch', () => {
  const square = (w: number, x0: number, y0: number, size: number) => {
    const m = new Uint8Array(w * w);
    for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) m[y * w + x] = 1;
    return m;
  };
  it('forgives a pixel of difference and catches more', () => {
    expect(maskMismatch(square(40, 10, 10, 10), square(40, 10, 10, 10), 40, 40)).toBe(0);
    expect(maskMismatch(square(40, 10, 10, 10), square(40, 11, 10, 10), 40, 40)).toBe(0);
    expect(maskMismatch(square(40, 10, 10, 10), square(40, 15, 10, 10), 40, 40)).toBeGreaterThan(0.3);
  });
});

