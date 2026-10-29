/**
 * Google Fonts' own files, from Fontsource (https://fontsource.org): it lists each font's real
 * weights and styles and serves each character subset as a plain TTF that HarfBuzz can read,
 * which Google's API, sending browsers WOFF2, doesn't.
 */

export interface FontsourceMeta {
  id: string;
  family: string;
  weights: number[];
  styles: string[];
  subsets: string[];
  defSubset: string;
  unicodeRange: Record<string, string>;
  variants: Record<string, Record<string, Record<string, { url: { woff?: string; ttf?: string } }>>>;
}

/** Fontsource's id for a family: "Paytone One" → "paytone-one". */
export function fontsourceId(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const metaCache = new Map<string, Promise<FontsourceMeta | null>>();

/** The font's listing, or null when Fontsource doesn't have it or can't be reached. Cached. */
export function fetchFontMeta(family: string): Promise<FontsourceMeta | null> {
  const id = fontsourceId(family);
  if (!id) return Promise.resolve(null);
  let pending = metaCache.get(id);
  if (!pending) {
    pending = fetch(`https://api.fontsource.org/v1/fonts/${id}`)
      .then((r) => (r.ok ? (r.json() as Promise<FontsourceMeta>) : null))
      .catch(() => null);
    // A failed lookup can be retried later; a found or missing font is settled.
    pending.then((m) => m === null && metaCache.delete(id));
    metaCache.set(id, pending);
  }
  return pending;
}

/** The weight the font really has nearest `wanted`, as the browser picks one; heavier on a tie. */
export function nearestWeight(weights: number[], wanted: number): number {
  if (weights.length === 0) return wanted;
  return weights.reduce((best, w) => {
    const d = Math.abs(w - wanted);
    const bd = Math.abs(best - wanted);
    return d < bd || (d === bd && w > best) ? w : best;
  });
}

/** The style to use: italic only when the font has it. */
export function availableStyle(styles: string[], wanted: 'normal' | 'italic'): 'normal' | 'italic' {
  return wanted === 'italic' && styles.includes('italic') ? 'italic' : 'normal';
}

/** "U+0000-00FF,U+0131" → [[0, 0xff], [0x131, 0x131]]. */
export function parseUnicodeRange(range: string): [number, number][] {
  return range
    .split(',')
    .map((s) => s.trim().replace(/^U\+/i, ''))
    .filter(Boolean)
    .map((s) => {
      const [a, b] = s.split('-');
      const lo = parseInt(a.replace(/\?/g, '0'), 16);
      const hi = b ? parseInt(b, 16) : parseInt(a.replace(/\?/g, 'F'), 16);
      return [lo, hi] as [number, number];
    });
}

/**
 * The subsets that cover the text's characters, the font's default subset first. Characters no
 * subset covers are left out; the outline export then finds them missing and keeps the picture.
 */
export function subsetsForText(meta: Pick<FontsourceMeta, 'subsets' | 'defSubset' | 'unicodeRange'>, text: string): string[] {
  const order = [meta.defSubset, ...meta.subsets.filter((s) => s !== meta.defSubset)].filter(
    (s) => meta.unicodeRange[s]
  );
  const ranges = new Map(order.map((s) => [s, parseUnicodeRange(meta.unicodeRange[s])]));
  const chosen = new Set<string>([order[0]].filter(Boolean));
  for (const ch of new Set(text.replace(/\s/g, ''))) {
    const cp = ch.codePointAt(0)!;
    const covers = (s: string) => ranges.get(s)!.some(([lo, hi]) => cp >= lo && cp <= hi);
    if ([...chosen].some(covers)) continue;
    const next = order.find(covers);
    if (next) chosen.add(next);
  }
  return [...chosen];
}

const fileCache = new Map<string, Promise<ArrayBuffer | null>>();

/** A font file's bytes, or null if it can't be fetched. Cached for the session. */
export function fetchFontFile(url: string): Promise<ArrayBuffer | null> {
  let pending = fileCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    pending.then((b) => b === null && fileCache.delete(url));
    fileCache.set(url, pending);
  }
  return pending;
}

/** The TTF files the text needs, default subset first. */
export function fontFileUrls(meta: FontsourceMeta, weight: number, style: 'normal' | 'italic', text: string): string[] {
  const byStyle = meta.variants[String(weight)]?.[style];
  if (!byStyle) return [];
  return subsetsForText(meta, text)
    .map((s) => byStyle[s]?.url.ttf)
    .filter((u): u is string => Boolean(u));
}

/** The text weights the app offers. */
export const TEXT_WEIGHTS = ['400', '600', '700', '800'] as const;
export type TextWeight = (typeof TEXT_WEIGHTS)[number];

/**
 * The offered weights the font really has, so the canvas never fakes a bold the export can't
 * match. A font with none of them offers the one nearest its own weights.
 */
export function offeredWeights(fontWeights: number[]): TextWeight[] {
  const real = TEXT_WEIGHTS.filter((w) => fontWeights.includes(Number(w)));
  if (real.length > 0 || fontWeights.length === 0) return real.length > 0 ? real : [...TEXT_WEIGHTS];
  const nearest = nearestWeight(TEXT_WEIGHTS.map(Number), nearestWeight(fontWeights, 400));
  return [String(nearest) as TextWeight];
}

/** The offered weight nearest `wanted` that the font has. */
export function snapWeight(fontWeights: number[], wanted: TextWeight): TextWeight {
  const offered = offeredWeights(fontWeights);
  return offered.includes(wanted) ? wanted : (String(nearestWeight(offered.map(Number), Number(wanted))) as TextWeight);
}
