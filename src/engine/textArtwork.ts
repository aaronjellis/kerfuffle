/**
 * Text artwork drawn from its outline: Badgerly's engine (any Google family from Fontsource, shaped
 * by HarfBuzz, merged into one outline) gives one shape, and the 2D sheet, the 3D decal and every
 * export all draw that shape. What you see is what the laser engraves; nothing is drawn twice.
 */
import { createFontProvider } from './fontProvider';
import { polyToSvgPath, translate } from './geom';
import { DEFAULT_TEXT, buildTextOutline, missingChar, type TextConfig } from './textOutline';
import type { TextOutline } from './textPlacement';
import type { TextArtworkConfig } from './types';

/** Every text artwork's fonts, fetched once each and shared. */
export const textFonts = createFontProvider();

/** An artwork's text settings as the engine's text config. */
export function toTextConfig(c: TextArtworkConfig): TextConfig {
  return {
    ...DEFAULT_TEXT,
    text: c.text || 'TEXT',
    family: c.fontFamily,
    weight: Number(c.fontWeight) || 400,
    style: c.fontStyle,
    align: c.textAlign,
    letterSpacingEm: c.letterSpacingEm,
    lineHeight: c.lineHeight,
  };
}

/** Why a text has no outline. */
export type TextOutlineFailure = 'font-unavailable' | `missing-glyph ${string}` | 'empty';

/**
 * The text's merged outline, in px from its ink box's corner, as the exporters place it; or why it
 * has none. `tolPx` is how far a flattened curve may stray from the font's, in those px.
 */
export async function textArtworkOutline(c: TextArtworkConfig, tolPx = 0.1): Promise<TextOutline | { failed: TextOutlineFailure }> {
  const config = toTextConfig(c);
  const fonts = await textFonts.load(config);
  if (!fonts) return { failed: 'font-unavailable' };
  const missing = missingChar(config, fonts);
  if (missing) return { failed: `missing-glyph ${missing}` };
  const outline = buildTextOutline(config, fonts, tolPx);
  if (outline.ink.w <= 0 || outline.ink.h <= 0) return { failed: 'empty' };
  return {
    widthPx: outline.ink.w,
    heightPx: outline.ink.h,
    groups: [{ text: c.text, contours: translate(outline.poly, -outline.ink.x, -outline.ink.y) }],
  };
}

/** The outline as a picture for the 2D sheet and the 3D decal: an SVG data URL, and its aspect ratio. */
export function outlineDataUrl(outline: TextOutline, fill: string): { dataUrl: string; aspectRatio: number } {
  const w = outline.widthPx;
  const h = outline.heightPx;
  const d = outline.groups.map((g) => polyToSvgPath(g.contours, 2)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}"><path d="${d}" fill="${fill}" fill-rule="nonzero"/></svg>`;
  return { dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, aspectRatio: Math.max(0.05, Math.min(40, w / h)) };
}
