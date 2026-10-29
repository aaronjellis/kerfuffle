/**
 * Builds the vector outlines for every text artwork before an export. Loaded on demand with its
 * font libraries, so the app doesn't download them until someone exports text.
 */
import { drawTextArtworkCanvas, loadGoogleFont, measureCanvasBaseline } from './googleFonts';
import { availableStyle, fetchFontFile, fetchFontMeta, fontFileUrls, nearestWeight } from './fontSource';
import { harfbuzzFont } from './hbFont';
import {
  TEXT_RENDER_SIZE_PX,
  buildTextOutline,
  layoutTextCommands,
  missingChar,
  textLines,
  type TextFont,
  maskMismatch,
  type TextOutline,
} from './textOutline';
import type { FaceArtwork, TextArtworkConfig } from './types';

/**
 * How far a flattened curve may stray from the font's true curve, in millimetres: 5 µm, a twentieth
 * of a typical laser beam. Where two letters' strokes cross at a shallow angle the crossing point
 * can sit a few times this off, still well under 0.05 mm.
 */
const TOLERANCE_MM = 0.005;

/**
 * The most of the outline's ink allowed to disagree with the canvas render by more than a pixel.
 * Correct outlines measure 0; a wrong font, weight, slant or letter measures 0.3 or more.
 */
export const MAX_CANVAS_MISMATCH = 0.01;

const fontCache = new Map<string, TextFont>();

async function loadFonts(config: TextArtworkConfig): Promise<TextFont[] | null> {
  const meta = await fetchFontMeta(config.fontFamily);
  if (!meta) return null;
  const weight = nearestWeight(meta.weights, Number(config.fontWeight) || 400);
  const style = availableStyle(meta.styles, config.fontStyle);
  const urls = fontFileUrls(meta, weight, style, textLines(config).join(''));
  if (urls.length === 0) return null;
  const fonts: TextFont[] = [];
  for (const url of urls) {
    let font = fontCache.get(url);
    if (!font) {
      const bytes = await fetchFontFile(url);
      if (!bytes) return null;
      try {
        font = harfbuzzFont(bytes);
      } catch {
        return null;
      }
      fontCache.set(url, font);
    }
    fonts.push(font);
  }
  return fonts;
}

const inkMask = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return mask;
};

/**
 * How much the outline disagrees with the canvas render of the same text (see `maskMismatch`), or
 * null without a canvas. The canvas is what the user sees, so this catches any difference in font,
 * weight, shaping or layout before it reaches a laser.
 */
export function canvasMismatch(outline: TextOutline, config: TextArtworkConfig): number | null {
  const reference = drawTextArtworkCanvas(config, '#000');
  if (!reference) return null;
  const { width, height } = reference;
  const test = document.createElement('canvas');
  test.width = width;
  test.height = height;
  const ctx = test.getContext('2d');
  const refCtx = reference.getContext('2d');
  if (!ctx || !refCtx) return null;
  // Placed in the canvas as the export places it in the artwork's box.
  const s = Math.min(width / outline.widthPx, height / outline.heightPx);
  ctx.translate((width - outline.widthPx * s) / 2, (height - outline.heightPx * s) / 2);
  ctx.scale(s, s);
  ctx.beginPath();
  for (const g of outline.groups) {
    for (const c of g.contours) {
      c.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    }
  }
  ctx.fillStyle = '#000';
  ctx.fill('evenodd');
  return maskMismatch(inkMask(refCtx, width, height), inkMask(ctx, width, height), width, height);
}

export interface TextOutlineResult {
  outline: TextOutline;
  /** The canvas check's mismatch, null where there's no canvas to check against. */
  mismatch: number | null;
}

/** One text artwork's outline, or the reason it keeps its picture export. */
export async function buildArtworkOutline(art: FaceArtwork): Promise<TextOutlineResult | { skipped: string }> {
  const config = art.textConfig;
  if (!config) return { skipped: 'not-text' };
  const fonts = await loadFonts(config);
  if (!fonts) return { skipped: 'font-unavailable' };
  const missing = missingChar(config, fonts);
  if (missing) return { skipped: `missing-glyph ${missing}` };
  // The browser must have the same font loaded to measure and draw the reference.
  await loadGoogleFont(config.fontFamily, Number(config.fontWeight) || 400, config.fontStyle);
  const baseline = measureCanvasBaseline(config, TEXT_RENDER_SIZE_PX) ?? undefined;
  const { widthPx, heightPx } = layoutTextCommands(config, fonts, baseline);
  const mmPerPx = Math.min(art.widthMm / widthPx, art.heightMm / heightPx);
  const outline = buildTextOutline(config, fonts, TOLERANCE_MM / Math.max(mmPerPx, 1e-6), baseline);
  const mismatch = canvasMismatch(outline, config);
  if (mismatch !== null && mismatch > MAX_CANVAS_MISMATCH) return { skipped: `canvas-mismatch ${mismatch.toFixed(3)}` };
  return { outline, mismatch };
}

/** Outlines for every text artwork that can have one, by artwork id; the rest keep their picture. */
export async function buildTextOutlines(artworks: FaceArtwork[]): Promise<Map<string, TextOutline>> {
  const out = new Map<string, TextOutline>();
  await Promise.all(
    artworks
      .filter((a) => a.textConfig)
      .map(async (art) => {
        const result = await buildArtworkOutline(art);
        if ('outline' in result) out.set(art.id, result.outline);
        else console.info(`Text "${art.name}" exports as a picture: ${result.skipped}`);
      })
  );
  return out;
}
