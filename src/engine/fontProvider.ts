/** HarfBuzz fonts for a text config, fetched from Fontsource and cached for the session. */
import { availableStyle, fetchFontFile, fetchFontMeta, fontFileUrls, nearestWeight, subsetsForText } from './fontSource';
import type { FontsourceMeta } from './fontSource';
import { harfbuzzFont } from './hbFont';
import type { TextConfig, TextFont } from './textOutline';

export interface FontProvider {
  /** The fonts for the config if they have loaded, else null. */
  get(config: TextConfig): TextFont[] | null;
  /** Fetches the config's fonts (once at a time per font); null if they can't be had. */
  load(config: TextConfig): Promise<TextFont[] | null>;
  /** Whether the config's last load came back with nothing, so `get` will stay null until a load succeeds. */
  failed(config: TextConfig): boolean;
  /** Calls `cb` whenever a load adds fonts or fails; returns the function that stops it. */
  onChange(cb: () => void): () => void;
}

/** The weight, style and subsets the config resolves to in the font, as a cache key. */
function cacheKey(meta: FontsourceMeta, config: TextConfig): { key: string; weight: number; style: 'normal' | 'italic' } {
  const weight = nearestWeight(meta.weights, config.weight || 400);
  const style = availableStyle(meta.styles, config.style);
  const subsets = subsetsForText(meta, config.text).join(',');
  return { key: `${config.family}|${weight}|${style}|${subsets}`, weight, style };
}

async function fetchFonts(meta: FontsourceMeta, config: TextConfig, weight: number, style: 'normal' | 'italic'): Promise<TextFont[] | null> {
  const urls = fontFileUrls(meta, weight, style, config.text);
  if (urls.length === 0) return null;
  const files = await Promise.all(urls.map(fetchFontFile));
  if (files.some((f) => !f)) return null;
  try {
    return files.map((bytes) => harfbuzzFont(bytes!));
  } catch {
    return null;
  }
}

export function createFontProvider(): FontProvider {
  const fonts = new Map<string, TextFont[]>();
  const inFlight = new Map<string, Promise<TextFont[] | null>>();
  /** Fontsource's listing per family, once a load has fetched it; `get` needs it to build the key. */
  const metas = new Map<string, FontsourceMeta>();
  const listeners = new Set<() => void>();
  /** Families whose listing could not be had, and font keys whose files could not: what `failed` reports. */
  const failedFamilies = new Set<string>();
  const failedKeys = new Set<string>();
  const notify = () => listeners.forEach((cb) => cb());

  return {
    get(config) {
      const meta = metas.get(config.family);
      return (meta && fonts.get(cacheKey(meta, config).key)) || null;
    },

    async load(config) {
      const meta = await fetchFontMeta(config.family);
      if (!meta) {
        failedFamilies.add(config.family);
        notify();
        return null;
      }
      failedFamilies.delete(config.family);
      metas.set(config.family, meta);
      const { key, weight, style } = cacheKey(meta, config);
      const cached = fonts.get(key);
      if (cached) return cached;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = fetchFonts(meta, config, weight, style).then((loaded) => {
          inFlight.delete(key);
          if (loaded) {
            fonts.set(key, loaded);
            failedKeys.delete(key);
          } else {
            failedKeys.add(key);
          }
          notify();
          return loaded;
        });
        inFlight.set(key, pending);
      }
      return pending;
    },

    failed(config) {
      const meta = metas.get(config.family);
      return meta ? failedKeys.has(cacheKey(meta, config).key) : failedFamilies.has(config.family);
    },

    onChange(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}
