/**
 * Uploaded SVG artwork, written into an exported SVG as its own vector shapes rather than as an
 * embedded image, so laser software can line- or fill-engrave them.
 */

/** Root attributes that place or declare the drawing; everything else (fill, stroke, style...) carries over. */
const PLACEMENT_ATTRS = new Set(['width', 'height', 'viewbox', 'x', 'y', 'preserveaspectratio', 'version', 'id', 'xml:space', 'baseprofile']);

function parseAttrs(tag: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out.push([m[1], m[3] ?? m[4] ?? '']);
  return out;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** A length in user units: a bare number or px. Real units (mm, in) need a viewBox to place. */
function userUnits(value: string | undefined): number | null {
  const m = value?.trim().match(/^([\d.]+)(px)?$/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The SVG's contents as a group placed in a box: fitted inside it at its own shape and centred (the
 * export's `xMidYMid meet`), then turned `rotationDeg` about the box's centre. Scripts, event
 * handlers and foreign objects are dropped, and every id (and each reference to one) is prefixed
 * with `idPrefix` so two drawings' gradients, masks or clip paths can't collide. Null when the SVG
 * has no viewBox and no plain width and height to place it by.
 */
export function inlineSvgArtwork(
  svg: string,
  idPrefix: string,
  box: { x: number; y: number; w: number; h: number },
  rotationDeg: number
): string | null {
  const open = svg.match(/<svg\b[^>]*>/i);
  const close = svg.toLowerCase().lastIndexOf('</svg>');
  if (!open || open.index === undefined || close < 0) return null;
  const attrs = parseAttrs(open[0]);
  const get = (name: string) => attrs.find(([k]) => k.toLowerCase() === name)?.[1];

  let vb = get('viewbox')?.trim().split(/[\s,]+/).map(Number);
  if (!vb || vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) {
    const w = userUnits(get('width'));
    const h = userUnits(get('height'));
    if (!w || !h) return null;
    vb = [0, 0, w, h];
  }
  const [minX, minY, vw, vh] = vb;

  let body = svg.slice(open.index + open[0].length, close);
  body = body
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(\sid\s*=\s*["'])([^"']+)(["'])/g, `$1${idPrefix}$2$3`)
    .replace(/url\(\s*(['"]?)#([^)'"]+)\1\s*\)/g, `url(#${idPrefix}$2)`)
    .replace(/((?:xlink:)?href\s*=\s*["'])#([^"']+)(["'])/g, `$1#${idPrefix}$2$3`);

  const s = Math.min(box.w / vw, box.h / vh);
  const ox = box.x + (box.w - vw * s) / 2;
  const oy = box.y + (box.h - vh * s) / 2;
  const n = (v: number) => Number(v.toFixed(4)).toString();
  const turn = rotationDeg !== 0 ? `rotate(${n(rotationDeg)} ${n(box.x + box.w / 2)} ${n(box.y + box.h / 2)}) ` : '';
  const transform = `${turn}translate(${n(ox)} ${n(oy)}) scale(${n(s)}) translate(${n(-minX)} ${n(-minY)})`;
  const carried = attrs
    .filter(([k]) => !PLACEMENT_ATTRS.has(k.toLowerCase()) && !k.toLowerCase().startsWith('xmlns') && !/^on/i.test(k))
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  return `<g id="${idPrefix}art" transform="${transform}"${carried}>${body}</g>`;
}
