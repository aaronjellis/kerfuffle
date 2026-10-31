/**
 * The Google families the font picker offers: Fontsource's listing, cached for a week, with a
 * short curated list for when it can't be reached.
 */

export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace' | 'other';

export interface FontFamily {
  id: string;
  family: string;
  category: FontCategory;
  weights: number[];
  styles: ('normal' | 'italic')[];
}

/** The curated families, with the weights and styles Fontsource lists for them. */
export const FALLBACK_FAMILIES: FontFamily[] = [
  { id: 'inter', family: 'Inter', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['normal', 'italic'] },
  { id: 'montserrat', family: 'Montserrat', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['normal', 'italic'] },
  { id: 'oswald', family: 'Oswald', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700], styles: ['normal'] },
  { id: 'bebas-neue', family: 'Bebas Neue', category: 'sans-serif', weights: [400], styles: ['normal'] },
  { id: 'space-grotesk', family: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700], styles: ['normal'] },
  { id: 'poppins', family: 'Poppins', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['normal', 'italic'] },
  { id: 'rajdhani', family: 'Rajdhani', category: 'sans-serif', weights: [300, 400, 500, 600, 700], styles: ['normal'] },
  { id: 'playfair-display', family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900], styles: ['normal', 'italic'] },
  { id: 'cinzel', family: 'Cinzel', category: 'serif', weights: [400, 500, 600, 700, 800, 900], styles: ['normal'] },
  { id: 'cormorant-garamond', family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700], styles: ['normal', 'italic'] },
  { id: 'merriweather', family: 'Merriweather', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900], styles: ['normal', 'italic'] },
  { id: 'abril-fatface', family: 'Abril Fatface', category: 'serif', weights: [400], styles: ['normal'] },
  { id: 'stardos-stencil', family: 'Stardos Stencil', category: 'display', weights: [400, 700], styles: ['normal'] },
  { id: 'black-ops-one', family: 'Black Ops One', category: 'display', weights: [400], styles: ['normal'] },
  { id: 'alfa-slab-one', family: 'Alfa Slab One', category: 'display', weights: [400], styles: ['normal'] },
  { id: 'righteous', family: 'Righteous', category: 'display', weights: [400], styles: ['normal'] },
  { id: 'special-elite', family: 'Special Elite', category: 'display', weights: [400], styles: ['normal'] },
  { id: 'bungee', family: 'Bungee', category: 'display', weights: [400], styles: ['normal'] },
  { id: 'pacifico', family: 'Pacifico', category: 'handwriting', weights: [400], styles: ['normal'] },
  { id: 'dancing-script', family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700], styles: ['normal'] },
  { id: 'great-vibes', family: 'Great Vibes', category: 'handwriting', weights: [400], styles: ['normal'] },
  { id: 'permanent-marker', family: 'Permanent Marker', category: 'handwriting', weights: [400], styles: ['normal'] },
  { id: 'caveat', family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700], styles: ['normal'] },
  { id: 'jetbrains-mono', family: 'JetBrains Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700, 800], styles: ['normal', 'italic'] },
  { id: 'space-mono', family: 'Space Mono', category: 'monospace', weights: [400, 700], styles: ['normal', 'italic'] },
];

export const CATALOG_URL = 'https://api.fontsource.org/v1/fonts?type=google&subsets=latin';

const CACHE_KEY = 'kerfuffle.fontCatalog.v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CATEGORIES: readonly FontCategory[] = ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'];

/** Fontsource's listing as families, skipping entries without an id and name. Never throws. */
export function parseCatalog(json: unknown): FontFamily[] {
  if (!Array.isArray(json)) return [];
  const families: FontFamily[] = [];
  for (const entry of json) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.family !== 'string') continue;
    const category = CATEGORIES.find((c) => c === e.category) ?? 'other';
    const weights = Array.isArray(e.weights) ? e.weights.filter((w): w is number => typeof w === 'number') : [];
    const styles = Array.isArray(e.styles)
      ? e.styles.filter((s): s is 'normal' | 'italic' => s === 'normal' || s === 'italic')
      : [];
    families.push({ id: e.id, family: e.family, category, weights, styles });
  }
  return families.sort((a, b) => a.family.localeCompare(b.family));
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readCache(storage: Storage | undefined): FontFamily[] | null {
  try {
    const raw = storage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { savedAt?: unknown; families?: unknown };
    if (typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt >= CACHE_TTL_MS) return null;
    const families = parseCatalog(saved.families);
    return families.length > 0 ? families : null;
  } catch {
    return null;
  }
}

/**
 * Every Google family, from the week-old cache when there is one, else from Fontsource; the
 * curated list (not cached) when the listing can't be had.
 */
export async function fetchFontCatalog(storage: Storage | undefined = defaultStorage()): Promise<FontFamily[]> {
  const cached = readCache(storage);
  if (cached) return cached;
  try {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) return FALLBACK_FAMILIES;
    const families = parseCatalog(await response.json());
    if (families.length === 0) return FALLBACK_FAMILIES;
    try {
      storage?.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), families }));
    } catch {
      // Storage can be full or blocked; the catalog still works uncached.
    }
    return families;
  } catch {
    return FALLBACK_FAMILIES;
  }
}
