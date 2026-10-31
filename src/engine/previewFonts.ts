/** Loads Google Fonts into the page, so the stage and the font picker draw them. */

/** One face of a family: the weight and style a preview is drawn in. */
export interface PreviewFace {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

/** Faces asked for already, as `family|weight|style`. */
const requested = new Set<string>();

const faceKey = (f: PreviewFace) => `${f.family}|${f.weight}|${f.style}`;

const encodeFamily = (family: string) => encodeURIComponent(family).replace(/%20/g, '+');

/**
 * The stylesheet URL for the faces, one query term each. Google refuses the whole sheet when a
 * family lacks a requested italic, so callers ask only for faces the family has; a weight it lacks
 * it answers with the nearest.
 */
export function previewCssUrl(faces: PreviewFace[]): string {
  const query = faces.map((f) => `family=${encodeFamily(f.family)}:${f.style === 'italic' ? `ital,wght@1,${f.weight}` : `wght@${f.weight}`}`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

function stylesheetLoaded(link: HTMLLinkElement): Promise<void> {
  if (link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
}

/** Loads the faces; offline or missing fonts are ignored. */
async function loadFaces(faces: PreviewFace[]): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.all(faces.map((f) => document.fonts.load(`${f.style} ${f.weight} 48px "${f.family}"`)));
  } catch {
    // Ignore network/offline errors; the fallback system font still renders cleanly.
  }
}

/**
 * Injects one stylesheet with every face not requested before, for the picker's previews. Resolves
 * once the rules are in the document and the faces have loaded.
 */
export async function loadPreviewCss(faces: PreviewFace[]): Promise<void> {
  if (typeof document === 'undefined') return;
  const fresh: PreviewFace[] = [];
  for (const f of faces) {
    const family = f.family.trim();
    if (!family) continue;
    const face = { ...f, family };
    if (requested.has(faceKey(face))) continue;
    requested.add(faceKey(face));
    fresh.push(face);
  }
  if (fresh.length === 0) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = previewCssUrl(fresh);
  document.head.appendChild(link);
  await stylesheetLoaded(link);
  await loadFaces(fresh);
}
