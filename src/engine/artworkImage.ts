/**
 * Artwork image shape: an uploaded image keeps its own proportions everywhere it is drawn. Aspects
 * here are height / width.
 */

/** The SVG source inside a data URL, or null when it isn't an SVG. */
export function svgTextFromDataUrl(dataUrl: string): string | null {
  const m = dataUrl.match(/^data:image\/svg\+xml(;[^,]*)?,(.*)$/s);
  if (!m) return null;
  const isBase64 = (m[1] ?? '').includes(';base64');
  try {
    if (!isBase64) return decodeURIComponent(m[2]);
    const binary = atob(m[2]);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

const UNIT_MM: Record<string, number> = { '': 25.4 / 96, px: 25.4 / 96, pt: 25.4 / 72, pc: 25.4 / 6, mm: 1, cm: 10, in: 25.4 };

/** A length attribute in mm, or null for a percentage or anything unreadable. */
function lengthMm(value: string | undefined): number | null {
  const m = value?.trim().match(/^([\d.]+(?:e[-+]?\d+)?)\s*(px|pt|pc|mm|cm|in)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  return Number.isFinite(n) && n > 0 ? n * UNIT_MM[unit] : null;
}

/**
 * An SVG's height / width from its root element: its `width` and `height` when both are real
 * lengths, else its `viewBox`. Null when neither says.
 */
export function svgAspect(svg: string): number | null {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return null;
  const attr = (name: string) => root.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
  const w = lengthMm(attr('width'));
  const h = lengthMm(attr('height'));
  if (w && h) return h / w;
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) return vb[3] / vb[2];
  return null;
}

/**
 * A loaded image's height / width: the SVG's own dimensions when it is one (browsers disagree on an
 * SVG's natural size, and some report none), else the image's natural size.
 */
export function imageAspect(img: { naturalWidth: number; naturalHeight: number }, dataUrl: string): number | null {
  const svg = svgTextFromDataUrl(dataUrl);
  const fromSvg = svg ? svgAspect(svg) : null;
  if (fromSvg) return fromSvg;
  return img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalHeight / img.naturalWidth : null;
}

/** The largest rectangle of the given aspect that fits a box, centred in it: SVG's "xMidYMid meet". */
export function containRect(boxW: number, boxH: number, aspect: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(boxW, boxH / aspect);
  const h = w * aspect;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** A size of the given aspect whose longer side is `longSide`. */
export function sizeForAspect(aspect: number, longSide: number): { widthMm: number; heightMm: number } {
  return aspect <= 1 ? { widthMm: longSide, heightMm: longSide * aspect } : { widthMm: longSide / aspect, heightMm: longSide };
}
