/** What the font picker lists: the catalog narrowed by a search and a category, and the recently picked families. */
import type { FontCategory, FontFamily } from '../engine/fontCatalog';
import { availableStyle, nearestWeight } from '../engine/fontSource';

export type CategoryFilter = FontCategory | 'all';

/** Where the last families picked are kept. */
export const RECENT_FONTS_KEY = 'kerfuffle.recentFonts';
const RECENT_LIMIT = 8;

/** The families whose name contains the query (any case) in the category, in catalog order. */
export function filterFamilies(catalog: FontFamily[], query: string, category: CategoryFilter): FontFamily[] {
  const q = query.trim().toLowerCase();
  return catalog.filter((f) => (category === 'all' || f.category === category) && (q === '' || f.family.toLowerCase().includes(q)));
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Family names picked before, most recent first. Never throws. */
export function readRecentFonts(storage: Storage | undefined = defaultStorage()): string[] {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(RECENT_FONTS_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((n): n is string => typeof n === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Puts a family first in the recent list (last 8) and returns the new list. Never throws. */
export function pushRecentFont(family: string, storage: Storage | undefined = defaultStorage()): string[] {
  const next = [family, ...readRecentFonts(storage).filter((n) => n !== family)].slice(0, RECENT_LIMIT);
  try {
    storage?.setItem(RECENT_FONTS_KEY, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked; the list still works for this session.
  }
  return next;
}

/** The face a tile previews a family in: the text's weight and style, as near as the family has them. */
export function previewFace(f: Pick<FontFamily, 'weights' | 'styles'>, weight: number, style: 'normal' | 'italic'): { weight: number; style: 'normal' | 'italic' } {
  return { weight: nearestWeight(f.weights, weight), style: availableStyle(f.styles, style) };
}
