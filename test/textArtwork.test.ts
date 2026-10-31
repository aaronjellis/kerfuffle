import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TEXT_ARTWORK_CONFIG } from '../src/engine/googleFonts';
import { outlineDataUrl, textArtworkOutline } from '../src/engine/textArtwork';

// A real Google font, served as Fontsource would serve it.
const meta = {
  id: 'bebas-neue',
  family: 'Bebas Neue',
  weights: [400],
  styles: ['normal'],
  subsets: ['latin'],
  defSubset: 'latin',
  unicodeRange: { latin: 'U+0000-00FF' },
  variants: { '400': { normal: { latin: { url: { ttf: 'https://files.test/bebas-latin-400-normal.ttf' } } } } },
};
const inline = import.meta.glob('./fixtures/fonts/bebas-neue-400-normal.ttf', { query: '?inline', import: 'default', eager: true }) as Record<string, string>;
const ttf = Uint8Array.from(atob(Object.values(inline)[0].split(',')[1]), (c) => c.charCodeAt(0));

function stubNetwork() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === 'https://api.fontsource.org/v1/fonts/bebas-neue') return { ok: true, json: async () => meta };
      if (url === 'https://files.test/bebas-latin-400-normal.ttf') return { ok: true, arrayBuffer: async () => ttf.buffer.slice(0) };
      return { ok: false };
    })
  );
}
afterEach(() => vi.unstubAllGlobals());

const cfg = { ...DEFAULT_TEXT_ARTWORK_CONFIG, text: 'HELLO', fontFamily: 'Bebas Neue', fontWeight: '400' as const, letterSpacingEm: 0 };

describe('text artwork from its outline', () => {
  it('outlines the text from its ink box corner, in one merged group', async () => {
    stubNetwork();
    const outline = await textArtworkOutline(cfg);
    expect('failed' in outline).toBe(false);
    if ('failed' in outline) return;
    expect(outline.widthPx).toBeGreaterThan(outline.heightPx);
    expect(outline.groups).toHaveLength(1);
    const xs = outline.groups[0].contours.flat().map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(outline.widthPx, 5);
  });

  it('draws the same outline as the picture, at its aspect ratio', async () => {
    stubNetwork();
    const outline = await textArtworkOutline(cfg);
    if ('failed' in outline) throw new Error(outline.failed);
    const { dataUrl, aspectRatio } = outlineDataUrl(outline, '#111827');
    expect(dataUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    expect(decodeURIComponent(dataUrl)).toContain('fill="#111827"');
    expect(aspectRatio).toBeCloseTo(outline.widthPx / outline.heightPx, 5);
  });

  it('says why when the font can’t be had', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await textArtworkOutline({ ...cfg, fontFamily: 'No Such Font' })).toEqual({ failed: 'font-unavailable' });
  });
});
