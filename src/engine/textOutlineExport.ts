/**
 * The vector outlines for every text artwork before an export: the same outline the sheet and the
 * 3D view draw (see `textArtwork`), rebuilt at the laser's tolerance for the artwork's size.
 * Loaded on demand with its font libraries, so the app doesn't download them until it needs them.
 */
import { textArtworkOutline } from './textArtwork';
import type { TextOutline } from './textPlacement';
import type { FaceArtwork } from './types';

/**
 * How far a flattened curve may stray from the font's true curve, in millimetres: 5 µm, a twentieth
 * of a typical laser beam.
 */
const TOLERANCE_MM = 0.005;

/** The outline's px per mm, found from a coarse pass: the artwork's box contains the outline. */
async function exportTolerancePx(art: FaceArtwork): Promise<number | null> {
  const coarse = await textArtworkOutline(art.textConfig!, 0.5);
  if ('failed' in coarse) return null;
  const mmPerPx = Math.min(art.widthMm / coarse.widthPx, art.heightMm / coarse.heightPx);
  return TOLERANCE_MM / Math.max(mmPerPx, 1e-6);
}

/** Outlines for every text artwork that can have one, by artwork id; the rest keep their picture. */
export async function buildTextOutlines(artworks: FaceArtwork[]): Promise<Map<string, TextOutline>> {
  const out = new Map<string, TextOutline>();
  await Promise.all(
    artworks
      .filter((a) => a.textConfig)
      .map(async (art) => {
        const tol = await exportTolerancePx(art);
        const result = tol === null ? { failed: 'font-unavailable' } : await textArtworkOutline(art.textConfig!, tol);
        if ('failed' in result) console.info(`Text "${art.name}" exports as a picture: ${result.failed}`);
        else out.set(art.id, result);
      })
  );
  return out;
}
