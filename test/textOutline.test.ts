import { describe, expect, it } from 'vitest';
import { harfbuzzFont } from '../src/engine/hbFont';
import { DEFAULT_TEXT, buildTextOutline, capHeightPx, missingChar, splitLines, type TextFont } from '../src/engine/textOutline';
import { outerCount } from '../src/engine/geom';

// Real Google Fonts, as Fontsource serves them (latin subset TTFs, OFL-licensed).
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

describe('text outline', () => {
  it('cap height of Cinzel H is about 0.7 em', () => {
    expect(capHeightPx(font('cinzel-700-normal'), 100)).toBeCloseTo(70, -1);
  });
  it('ink width grows by the tracking between letters', () => {
    const a = buildTextOutline({ ...DEFAULT_TEXT, text: 'ABC', letterSpacingEm: 0, align: 'left' }, [font('cinzel-700-normal')], 0.05);
    const b = buildTextOutline({ ...DEFAULT_TEXT, text: 'ABC', letterSpacingEm: 0.1, align: 'left' }, [font('cinzel-700-normal')], 0.05);
    expect(b.ink.w - a.ink.w).toBeCloseTo(20, 0);
  });
  it('a pair adjustment moves only what follows the pair', () => {
    const a = buildTextOutline({ ...DEFAULT_TEXT, text: 'ABC', letterSpacingEm: 0, align: 'left' }, [font('cinzel-700-normal')], 0.05);
    const b = buildTextOutline(
      { ...DEFAULT_TEXT, text: 'ABC', letterSpacingEm: 0, align: 'left', pairAdjustEm: { '0:1': 0.2 } },
      [font('cinzel-700-normal')],
      0.05
    );
    expect(b.clusters[1].xPx - a.clusters[1].xPx).toBeCloseTo(0);
    expect(b.clusters[2].xPx - a.clusters[2].xPx).toBeCloseTo(20, 0);
  });
  it('a script face merges into one shape per word', () => {
    const o = buildTextOutline({ ...DEFAULT_TEXT, text: 'flow', letterSpacingEm: 0 }, [font('pacifico-400-normal')], 0.05);
    expect(outerCount(o.poly)).toBe(1);
  });
  it('two lines give two cluster rows and a taller ink box', () => {
    const o = buildTextOutline({ ...DEFAULT_TEXT, text: 'AB\nCD', letterSpacingEm: 0 }, [font('cinzel-700-normal')], 0.05);
    expect(o.lines).toBe(2);
    expect(o.clusters.filter((c) => c.line === 1)).toHaveLength(2);
    expect(o.ink.h).toBeGreaterThan(150);
  });
  it('a blank line still takes its line height', () => {
    const cinzel = [font('cinzel-700-normal')];
    const two = buildTextOutline({ ...DEFAULT_TEXT, text: 'AB\nCD', letterSpacingEm: 0 }, cinzel, 0.05);
    const gap = buildTextOutline({ ...DEFAULT_TEXT, text: 'AB\n\nCD', letterSpacingEm: 0 }, cinzel, 0.05);
    expect(gap.lines).toBe(3);
    expect(gap.ink.h - two.ink.h).toBeCloseTo(DEFAULT_TEXT.lineHeight * 100, 0);
    expect(gap.clusters.filter((c) => c.line === 2)).toHaveLength(2);
  });
  it('empty text draws nothing', () => {
    const o = buildTextOutline({ ...DEFAULT_TEXT, text: '' }, [font('cinzel-700-normal')], 0.05);
    expect(o.poly).toEqual([]);
    expect(o.clusters).toEqual([]);
  });
  it('splitLines keeps blank lines and reads CRLF', () => {
    expect(splitLines('A\r\n\nB')).toEqual(['A', '', 'B']);
    expect(splitLines('')).toEqual(['']);
  });
  it('reports a missing character', () => {
    expect(missingChar({ ...DEFAULT_TEXT, text: 'A😀' }, [font('cinzel-700-normal')])).toBe('😀');
  });
});
