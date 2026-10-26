import { GeneratedBoxModel, TextArtworkConfig } from './types';

export interface GoogleFontOption {
  family: string;
  category: 'Sans-Serif' | 'Serif' | 'Display & Stencil' | 'Script & Handwritten' | 'Monospace';
  previewTag: string;
}

export const GOOGLE_FONT_CATALOG: GoogleFontOption[] = [
  // Sans-Serif
  { family: 'Inter', category: 'Sans-Serif', previewTag: 'Clean Modern' },
  { family: 'Montserrat', category: 'Sans-Serif', previewTag: 'Geometric Sans' },
  { family: 'Oswald', category: 'Sans-Serif', previewTag: 'Tall Condensed' },
  { family: 'Bebas Neue', category: 'Sans-Serif', previewTag: 'Bold Headline' },
  { family: 'Space Grotesk', category: 'Sans-Serif', previewTag: 'Tech Sans' },
  { family: 'Poppins', category: 'Sans-Serif', previewTag: 'Rounded Friendly' },
  { family: 'Rajdhani', category: 'Sans-Serif', previewTag: 'Industrial Square' },
  // Serif
  { family: 'Playfair Display', category: 'Serif', previewTag: 'Luxury Editorial' },
  { family: 'Cinzel', category: 'Serif', previewTag: 'Classic Engraved' },
  { family: 'Cormorant Garamond', category: 'Serif', previewTag: 'Botanical Apothecary' },
  { family: 'Merriweather', category: 'Serif', previewTag: 'Traditional Serif' },
  { family: 'Abril Fatface', category: 'Serif', previewTag: 'Heavy Poster Serif' },
  // Display & Stencil
  { family: 'Stardos Stencil', category: 'Display & Stencil', previewTag: 'Cargo Stencil' },
  { family: 'Black Ops One', category: 'Display & Stencil', previewTag: 'Military Stencil' },
  { family: 'Alfa Slab One', category: 'Display & Stencil', previewTag: 'Heavy Slab' },
  { family: 'Righteous', category: 'Display & Stencil', previewTag: 'Retro Deco' },
  { family: 'Special Elite', category: 'Display & Stencil', previewTag: 'Typewriter Stamp' },
  { family: 'Bungee', category: 'Display & Stencil', previewTag: 'Block Signage' },
  // Script & Handwritten
  { family: 'Pacifico', category: 'Script & Handwritten', previewTag: 'Brush Script' },
  { family: 'Dancing Script', category: 'Script & Handwritten', previewTag: 'Calligraphy' },
  { family: 'Great Vibes', category: 'Script & Handwritten', previewTag: 'Formal Script' },
  { family: 'Permanent Marker', category: 'Script & Handwritten', previewTag: 'Marker Felt' },
  { family: 'Caveat', category: 'Script & Handwritten', previewTag: 'Handwritten Note' },
  // Monospace
  { family: 'JetBrains Mono', category: 'Monospace', previewTag: 'Code / Serial' },
  { family: 'Space Mono', category: 'Monospace', previewTag: 'Technical Spec' },
];

export const DEFAULT_TEXT_ARTWORK_CONFIG: TextArtworkConfig = {
  text: 'HANDCRAFTED\nGOODS CO.',
  fontFamily: 'Cinzel',
  fontWeight: '700',
  fontStyle: 'normal',
  textAlign: 'center',
  color: '#1e293b',
  letterSpacingEm: 0.06,
  lineHeight: 1.2,
};

const loadedFamilies = new Set<string>();

/**
 * Dynamically injects a Google Fonts stylesheet for `fontFamily` and awaits browser font readiness.
 */
export async function loadGoogleFont(fontFamily: string): Promise<void> {
  const clean = fontFamily.trim();
  if (!clean || typeof document === 'undefined') return;

  if (!loadedFamilies.has(clean)) {
    loadedFamilies.add(clean);
    const encoded = encodeURIComponent(clean).replace(/%20/g, '+');
    const linkId = `gfont-${encoded.toLowerCase()}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encoded}:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap`;
      document.head.appendChild(link);
    }
  }

  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await Promise.all([
        document.fonts.load(`400 48px "${clean}"`),
        document.fonts.load(`700 48px "${clean}"`),
      ]);
    } catch {
      // Ignore network/offline errors; fallback system font still renders cleanly
    }
  }
}

/**
 * Preloads the curated Google Fonts stylesheet in a single batch request so the font picker
 * previews and renders immediately.
 */
export function preloadCuratedGoogleFonts(): void {
  if (typeof document === 'undefined') return;
  const batchId = 'boxer-google-fonts-batch';
  if (document.getElementById(batchId)) return;

  const familiesParam = GOOGLE_FONT_CATALOG.map(
    (f) => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@400;700`
  ).join('&');

  const link = document.createElement('link');
  link.id = batchId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${familiesParam}&display=swap`;
  document.head.appendChild(link);
  for (const f of GOOGLE_FONT_CATALOG) {
    loadedFamilies.add(f.family);
  }
}

function buildFallbackSvgDataUrl(
  config: TextArtworkConfig,
  fillColor: string
): { dataUrl: string; aspectRatio: number } {
  const lines = (config.text || 'TEXT').split(/\r?\n/);
  const fontSize = 64;
  const lineH = fontSize * config.lineHeight;
  const maxChars = Math.max(1, ...lines.map((l) => l.length));
  const estWidth = Math.max(140, maxChars * fontSize * (0.62 + config.letterSpacingEm));
  const estHeight = Math.max(80, lines.length * lineH + 24);
  const anchor =
    config.textAlign === 'left'
      ? 'start'
      : config.textAlign === 'right'
      ? 'end'
      : 'middle';
  const xPos =
    config.textAlign === 'left'
      ? 16
      : config.textAlign === 'right'
      ? estWidth - 16
      : estWidth / 2;

  const tspans = lines
    .map((line, i) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const y = 12 + fontSize * 0.85 + i * lineH;
      return `<text x="${xPos.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-family="'${config.fontFamily}', sans-serif" font-weight="${config.fontWeight}" font-style="${config.fontStyle}" font-size="${fontSize}" letter-spacing="${config.letterSpacingEm}em" fill="${fillColor}">${escaped}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${estWidth.toFixed(0)} ${estHeight.toFixed(0)}">${tspans}</svg>`;
  return {
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    aspectRatio: estWidth / estHeight,
  };
}

/**
 * Renders a `TextArtworkConfig` into a high-resolution PNG Data URL (using HTML5 Canvas so that
 * loaded Google Fonts are baked into the texture for 3D, 2D SVG `<image>`, and PDF export without
 * external font security restrictions) plus its natural width/height aspect ratio.
 */
export function renderTextArtworkToDataUrl(
  config: TextArtworkConfig,
  mode: 'print' | 'engrave'
): { dataUrl: string; aspectRatio: number } {
  const fillColor = mode === 'engrave' ? '#111827' : config.color || '#111827';
  const lines = (config.text || 'TEXT').split(/\r?\n/).filter((l, idx, arr) => l.length > 0 || arr.length === 1);
  const safeLines = lines.length > 0 ? lines : ['TEXT'];

  if (typeof document === 'undefined') {
    return buildFallbackSvgDataUrl(config, fillColor);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return buildFallbackSvgDataUrl(config, fillColor);
  }

  const fontSizePx = 110;
  const fontSpec = `${config.fontStyle === 'italic' ? 'italic ' : ''}${config.fontWeight} ${fontSizePx}px "${config.fontFamily}", sans-serif`;
  ctx.font = fontSpec;

  const extraTrackingPx = config.letterSpacingEm * fontSizePx;
  const measureLine = (line: string): number => {
    if (!line) return fontSizePx * 0.5;
    const base = ctx.measureText(line).width;
    return Math.max(20, base + Math.max(0, line.length - 1) * extraTrackingPx);
  };

  const lineWidths = safeLines.map(measureLine);
  const maxLineW = Math.max(60, ...lineWidths);
  const lineStepPx = fontSizePx * Math.max(0.85, config.lineHeight);
  const padX = Math.round(fontSizePx * 0.28);
  const padY = Math.round(fontSizePx * 0.28);

  const totalW = Math.ceil(maxLineW + padX * 2);
  const totalH = Math.ceil(
    fontSizePx + Math.max(0, safeLines.length - 1) * lineStepPx + padY * 2
  );

  canvas.width = totalW;
  canvas.height = totalH;

  const drawCtx = canvas.getContext('2d');
  if (!drawCtx) {
    return buildFallbackSvgDataUrl(config, fillColor);
  }

  drawCtx.clearRect(0, 0, totalW, totalH);
  drawCtx.font = fontSpec;
  drawCtx.fillStyle = fillColor;
  drawCtx.textBaseline = 'top';

  safeLines.forEach((line, idx) => {
    const lw = lineWidths[idx];
    let startX = padX;
    if (config.textAlign === 'center') {
      startX = (totalW - lw) / 2;
    } else if (config.textAlign === 'right') {
      startX = totalW - padX - lw;
    }
    const y = padY + idx * lineStepPx;

    if (Math.abs(extraTrackingPx) < 0.5) {
      drawCtx.fillText(line, startX, y);
    } else {
      let cursorX = startX;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        drawCtx.fillText(ch, cursorX, y);
        cursorX += drawCtx.measureText(ch).width + extraTrackingPx;
      }
    }
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    aspectRatio: Math.max(0.15, Math.min(12, totalW / totalH)),
  };
}

/**
 * Resolves the safe interior dimensions (widthMm, heightMm) of a box piece/face (`top`, `front`, `back`, `left`, `right`, `bottom`)
 * so text and graphics can be aligned accurately to any edge, corner, or center of that piece.
 */
export function resolvePieceDimensions(
  model: GeneratedBoxModel,
  faceId: string
): { widthMm: number; heightMm: number } {
  for (const panel of model.panels2D) {
    if (panel.id === faceId || panel.id === `base-${faceId}`) {
      return {
        widthMm: panel.safeRect.width,
        heightMm: panel.safeRect.height,
      };
    }
    const sub = panel.subFaces?.find((s) => s.id === faceId);
    if (sub) {
      return {
        widthMm: sub.width,
        heightMm: sub.height,
      };
    }
  }
  return {
    widthMm: model.innerDims.widthMm,
    heightMm: model.innerDims.heightMm,
  };
}

/**
 * Computes the aligned `{ xMm, yMm }` center offset of an artwork item on a piece,
 * accounting for the artwork's rotation bounding box and a safe edge inset margin.
 * `anchorX`: -1 = Left edge, 0 = Horizontal Center, 1 = Right edge (or undefined to keep current xMm)
 * `anchorY`: -1 = Top edge, 0 = Vertical Center, 1 = Bottom edge (or undefined to keep current yMm)
 */
export function computePieceAlignmentOffset(params: {
  pieceWidthMm: number;
  pieceHeightMm: number;
  artWidthMm: number;
  artHeightMm: number;
  rotationDeg: number;
  currentXMm: number;
  currentYMm: number;
  anchorX?: -1 | 0 | 1;
  anchorY?: -1 | 0 | 1;
  marginMm?: number;
}): { xMm: number; yMm: number } {
  const {
    pieceWidthMm,
    pieceHeightMm,
    artWidthMm,
    artHeightMm,
    rotationDeg,
    currentXMm,
    currentYMm,
    anchorX,
    anchorY,
    marginMm = 4,
  } = params;

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotBoundW = artWidthMm * cos + artHeightMm * sin;
  const rotBoundH = artWidthMm * sin + artHeightMm * cos;

  const maxOffsetX = Math.max(0, pieceWidthMm / 2 - marginMm - rotBoundW / 2);
  const maxOffsetY = Math.max(0, pieceHeightMm / 2 - marginMm - rotBoundH / 2);

  const nextX =
    anchorX === undefined ? currentXMm : Number((anchorX * maxOffsetX).toFixed(1));
  const nextY =
    anchorY === undefined ? currentYMm : Number((anchorY * maxOffsetY).toFixed(1));

  return { xMm: nextX, yMm: nextY };
}
