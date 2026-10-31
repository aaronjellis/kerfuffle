import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_URL, FALLBACK_FAMILIES, STENCIL_FAMILIES, fetchFontCatalog, parseCatalog } from '../src/engine/fontCatalog';
import { createFontProvider } from '../src/engine/fontProvider';
import { loadPreviewCss } from '../src/engine/previewFonts';
import { DEFAULT_TEXT, type TextConfig } from '../src/engine/textOutline';

const KEY = 'kerfuffle.fontCatalog.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

function memoryStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as Storage;
  return { store, storage };
}

const family = { id: 'x', family: 'X', category: 'serif', weights: [400], styles: ['normal'] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseCatalog', () => {
  it('parses the Fontsource listing into families', () => {
    const fams = parseCatalog([
      { id: 'cinzel', family: 'Cinzel', category: 'serif', weights: [400, 700, 900], styles: ['normal'], subsets: ['latin'], type: 'google' },
      { id: 'bad' },
    ]);
    expect(fams).toEqual([{ id: 'cinzel', family: 'Cinzel', category: 'serif', weights: [400, 700, 900], styles: ['normal'] }]);
  });

  it('maps unknown categories to other, drops unknown styles and sorts by name', () => {
    const fams = parseCatalog([
      { id: 'zed', family: 'Zed', category: 'icons', weights: [400], styles: ['normal', 'oblique', 'italic'] },
      { id: 'alpha', family: 'alpha', category: 'monospace', weights: [400], styles: ['normal'] },
      { id: 'beta', family: 'Beta', weights: [400], styles: ['normal'] },
    ]);
    expect(fams.map((f) => f.family)).toEqual(['alpha', 'Beta', 'Zed']);
    expect(fams.map((f) => f.category)).toEqual(['monospace', 'other', 'other']);
    expect(fams[2].styles).toEqual(['normal', 'italic']);
  });

  it('returns nothing for a payload that is not a list', () => {
    expect(parseCatalog({ nope: true })).toEqual([]);
    expect(parseCatalog(null)).toEqual([]);
  });
});

describe('fetchFontCatalog', () => {
  it('uses the cache within seven days and the fallback when fetch fails', async () => {
    const { storage } = memoryStorage();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await fetchFontCatalog(storage)).toEqual(FALLBACK_FAMILIES);
    storage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), families: [family] }));
    expect((await fetchFontCatalog(storage))[0].family).toBe('X');
  });

  it('does not cache the fallback', async () => {
    const { store, storage } = memoryStorage();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchFontCatalog(storage)).toEqual(FALLBACK_FAMILIES);
    expect(store.has(KEY)).toBe(false);
  });

  it('fetches, parses and caches the listing', async () => {
    const { store, storage } = memoryStorage();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ id: 'x', family: 'X', category: 'serif', weights: [400], styles: ['normal'] }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchFontCatalog(storage)).toEqual([family]);
    expect(fetchMock).toHaveBeenCalledWith(CATALOG_URL);
    const saved = JSON.parse(store.get(KEY)!);
    expect(saved.families).toEqual([family]);
    expect(typeof saved.savedAt).toBe('number');
  });

  it('refetches a cache older than seven days', async () => {
    const { storage } = memoryStorage();
    storage.setItem(KEY, JSON.stringify({ savedAt: Date.now() - 7 * DAY_MS - 1000, families: [family] }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [{ id: 'y', family: 'Y', category: 'display', weights: [400], styles: ['normal'] }],
    })));
    expect((await fetchFontCatalog(storage)).map((f) => f.family)).toEqual(['Y']);
  });

  it('returns the fetched catalog when storage throws', async () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => [{ id: 'y', family: 'Y', category: 'display', weights: [400], styles: ['normal'] }],
    })));
    expect((await fetchFontCatalog(storage)).map((f) => f.family)).toEqual(['Y']);
  });

  it('falls back when the listing parses to nothing', async () => {
    const { storage } = memoryStorage();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ error: 'nope' }) })));
    expect(await fetchFontCatalog(storage)).toEqual(FALLBACK_FAMILIES);
  });
});

describe('FALLBACK_FAMILIES', () => {
  it('lists the 25 curated families and every stencil', () => {
    expect(FALLBACK_FAMILIES).toHaveLength(31);
    for (const family of STENCIL_FAMILIES) expect(FALLBACK_FAMILIES.some((f) => f.family === family)).toBe(true);
    expect(FALLBACK_FAMILIES.every((f) => f.weights.length > 0 && f.styles.includes('normal'))).toBe(true);
  });
});

describe('without a document', () => {
  it('loadPreviewCss resolves without touching the page', async () => {
    await expect(loadPreviewCss([{ family: 'Cinzel', weight: 700, style: 'normal' }])).resolves.toBeUndefined();
  });
});

describe('createFontProvider', () => {
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
  const bytes = ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength);
  const config: TextConfig = { ...DEFAULT_TEXT, text: 'HELLO', family: 'Bebas Neue', weight: 500, style: 'italic' };

  function stubNetwork() {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://api.fontsource.org/v1/fonts/bebas-neue') return { ok: true, json: async () => meta };
      if (url === 'https://files.test/bebas-latin-400-normal.ttf') return { ok: true, arrayBuffer: async () => bytes };
      return { ok: false };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('returns null before load and the fonts after', async () => {
    stubNetwork();
    const provider = createFontProvider();
    expect(provider.get(config)).toBeNull();
    const fonts = await provider.load(config);
    expect(fonts).not.toBeNull();
    expect(fonts!.length).toBe(1);
    expect(fonts![0].hasChar('H')).toBe(true);
    expect(provider.get(config)).toBe(fonts);
    // Same family, nearest weight and available style: the same cache entry.
    expect(provider.get({ ...config, weight: 400, style: 'normal', text: 'BYE' })).toBe(fonts);
  });

  it('shares one in-flight load and notifies listeners once', async () => {
    stubNetwork();
    const provider = createFontProvider();
    const cb = vi.fn();
    const off = provider.onChange(cb);
    const [a, b] = await Promise.all([provider.load(config), provider.load(config)]);
    expect(a).toBe(b);
    expect(cb).toHaveBeenCalledTimes(1);
    await provider.load(config);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('stops notifying after unsubscribe', async () => {
    stubNetwork();
    const provider = createFontProvider();
    const cb = vi.fn();
    provider.onChange(cb)();
    await provider.load(config);
    expect(cb).not.toHaveBeenCalled();
  });

  it('resolves to null, caches nothing, and reports the failure when the font is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const provider = createFontProvider();
    const cb = vi.fn();
    provider.onChange(cb);
    const missing = { ...config, family: 'No Such Font' };
    expect(provider.failed(missing)).toBe(false);
    expect(await provider.load(missing)).toBeNull();
    expect(provider.get(missing)).toBeNull();
    expect(provider.failed(missing)).toBe(true);
    // Listeners hear of the failure, so the badge resolves again and says so.
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('reports a font whose files will not download as failed, and clears that once a load succeeds', async () => {
    // A family of its own, so the session's file cache holds nothing for it yet.
    const flaky = { ...meta, id: 'flaky-sans', family: 'Flaky Sans', variants: { '400': { normal: { latin: { url: { ttf: 'https://files.test/flaky.ttf' } } } } } };
    const flakyConfig = { ...config, family: 'Flaky Sans' };
    let filesUp = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === 'https://api.fontsource.org/v1/fonts/flaky-sans') return { ok: true, json: async () => flaky };
      if (url === 'https://files.test/flaky.ttf' && filesUp) return { ok: true, arrayBuffer: async () => bytes };
      return { ok: false };
    }));
    const provider = createFontProvider();
    expect(await provider.load(flakyConfig)).toBeNull();
    expect(provider.failed(flakyConfig)).toBe(true);
    filesUp = true;
    expect(await provider.load(flakyConfig)).not.toBeNull();
    expect(provider.failed(flakyConfig)).toBe(false);
  });
});
