import { describe, expect, it } from 'vitest';
import { FALLBACK_FAMILIES } from '../src/engine/fontCatalog';
import { RECENT_FONTS_KEY, filterFamilies, previewFace, pushRecentFont, readRecentFonts } from '../src/ui/fontList';

function memory(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as unknown as Storage;
}

describe('filterFamilies', () => {
  it('matches the name case-insensitively', () => {
    expect(filterFamilies(FALLBACK_FAMILIES, 'cin', 'all').map((f) => f.family)).toEqual(['Cinzel', 'Dancing Script']);
    expect(filterFamilies(FALLBACK_FAMILIES, '  PLAY ', 'all').map((f) => f.family)).toEqual(['Playfair Display']);
  });

  it('narrows by category and keeps the catalog order', () => {
    const mono = filterFamilies(FALLBACK_FAMILIES, '', 'monospace').map((f) => f.family);
    expect(mono).toEqual(['JetBrains Mono', 'Space Mono']);
    expect(filterFamilies(FALLBACK_FAMILIES, 'mono', 'serif')).toEqual([]);
  });

  it('returns everything for no query and no category', () => {
    expect(filterFamilies(FALLBACK_FAMILIES, '', 'all')).toHaveLength(FALLBACK_FAMILIES.length);
  });
});

describe('recent fonts', () => {
  it('starts empty and survives garbage or missing storage', () => {
    expect(readRecentFonts(memory())).toEqual([]);
    expect(readRecentFonts(memory({ [RECENT_FONTS_KEY]: '{oops' }))).toEqual([]);
    expect(readRecentFonts(memory({ [RECENT_FONTS_KEY]: '[1,"Cinzel"]' }))).toEqual(['Cinzel']);
    expect(readRecentFonts(undefined)).toEqual([]);
    expect(() => pushRecentFont('Cinzel', undefined)).not.toThrow();
  });

  it('puts the latest first, without repeats, and keeps eight', () => {
    const storage = memory();
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'B']) pushRecentFont(name, storage);
    expect(readRecentFonts(storage)).toEqual(['B', 'I', 'H', 'G', 'F', 'E', 'D', 'C']);
  });

  it('does not throw when storage refuses the write', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } } as unknown as Storage;
    expect(pushRecentFont('Cinzel', full)).toEqual(['Cinzel']);
  });
});

describe('previewFace', () => {
  const bebas = { weights: [400], styles: ['normal' as const] };
  const playfair = { weights: [400, 500, 600, 700, 800, 900], styles: ['normal' as const, 'italic' as const] };

  it('takes the text weight and style when the family has them', () => {
    expect(previewFace(playfair, 700, 'italic')).toEqual({ weight: 700, style: 'italic' });
  });

  it('falls back to the nearest weight and the regular style', () => {
    expect(previewFace(bebas, 700, 'italic')).toEqual({ weight: 400, style: 'normal' });
    expect(previewFace(playfair, 650, 'normal')).toEqual({ weight: 700, style: 'normal' });
  });

  it('keeps the wanted weight when the catalog lists none', () => {
    expect(previewFace({ weights: [], styles: [] }, 600, 'normal')).toEqual({ weight: 600, style: 'normal' });
  });
});
