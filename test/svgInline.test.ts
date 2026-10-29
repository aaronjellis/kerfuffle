import { describe, expect, it } from 'vitest';
import { inlineSvgArtwork } from '../src/engine/svgInline';
import { exportBoxSvg } from '../src/engine/exporters';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { FaceArtwork } from '../src/engine/types';
import type { TextOutline } from '../src/engine/textPlacement';

const logo =
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="10 20 400 100" fill="#222" onload="alert(1)">' +
  '<defs><linearGradient id="g"><stop offset="0"/></linearGradient><path id="p" d="M0 0 L10 10"/></defs>' +
  '<script>alert(2)</script><rect x="10" y="20" width="400" height="100" fill="url(#g)" onclick="x()"/>' +
  '<use xlink:href="#p"/><use href="#p"/></svg>';

describe('inlining uploaded SVG artwork', () => {
  const g = inlineSvgArtwork(logo, 'art1-', { x: 50, y: 30, w: 80, h: 80 }, 0)!;

  it('fits the drawing inside its box at its own shape, centred, from its viewBox origin', () => {
    // 400 × 100 into 80 × 80: scale 0.2, 80 × 20, centred 30 down from the box's top.
    expect(g).toContain('transform="translate(50 60) scale(0.2) translate(-10 -20)"');
  });

  it('keeps the shapes and the root’s fill, and drops scripts and event handlers', () => {
    expect(g).toContain('<rect x="10" y="20" width="400" height="100"');
    expect(g).toContain('fill="#222"');
    expect(g).not.toMatch(/script|onload|onclick|alert/);
  });

  it('prefixes ids and every reference to them', () => {
    expect(g).toContain('id="art1-g"');
    expect(g).toContain('url(#art1-g)');
    expect(g).toContain('xlink:href="#art1-p"');
    expect(g).toContain('href="#art1-p"');
    expect(g).not.toContain('"#p"');
  });

  it('turns about the box’s centre', () => {
    expect(inlineSvgArtwork(logo, 'a-', { x: 0, y: 0, w: 40, h: 10 }, 90)).toContain('rotate(90 20 5) translate(0 0)');
  });

  it('places by plain width and height without a viewBox, and gives up on real units alone', () => {
    expect(inlineSvgArtwork('<svg width="200" height="100"><path d="M0 0"/></svg>', 'b-', { x: 0, y: 0, w: 20, h: 10 }, 0)).toContain(
      'scale(0.1) translate(0 0)'
    );
    expect(inlineSvgArtwork('<svg width="20mm" height="10mm"><path d="M0 0"/></svg>', 'c-', { x: 0, y: 0, w: 20, h: 10 }, 0)).toBeNull();
  });
});

describe('artwork in the SVG export', () => {
  const model = generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, woodLidStyle: 'closed' });
  const art = (mode: FaceArtwork['mode'], dataUrl: string, id: string): FaceArtwork => ({
    id,
    faceId: 'top',
    name: id,
    dataUrl,
    xMm: 0,
    yMm: 0,
    widthMm: 40,
    heightMm: 10,
    rotationDeg: 0,
    mode,
  });
  const svgUrl = `data:image/svg+xml;base64,${btoa(logo)}`;
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  it('writes an uploaded SVG as vector shapes, on the Engrave layer when set to engrave', () => {
    const out = exportBoxSvg(model, [art('engrave', svgUrl, 'logo'), art('print', png, 'photo')]);
    const engrave = out.slice(out.indexOf('id="Engrave_Artwork"'));
    expect(engrave).toContain('inkscape:label="Engrave"');
    expect(engrave).toContain('<rect x="10" y="20" width="400" height="100"');
    expect(out).not.toContain('href="data:image/svg+xml');
    // The photo has no shapes to write: it prints as an image.
    const print = out.slice(out.indexOf('id="Print_Artwork"'), out.indexOf('id="Engrave_Artwork"'));
    expect(print).toContain('<image id="art-photo"');
  });

  const text = (mode: FaceArtwork['mode']) => ({
    ...art(mode, png, 'words'),
    textConfig: { text: 'Hi\nthere', fontFamily: 'Inter', fontWeight: '400' as const, fontStyle: 'normal' as const, textAlign: 'center' as const, color: '#b45309', letterSpacingEm: 0, lineHeight: 1.2 },
  });
  // A 200 × 100 px render whose lines are each one square.
  const outline: TextOutline = {
    widthPx: 200,
    heightPx: 100,
    groups: [
      { text: 'Hi', contours: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]] },
      { text: 'there', contours: [[{ x: 100, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 100 }, { x: 100, y: 100 }]] },
    ],
  };

  it('keeps text as an image when it has no outline', () => {
    const out = exportBoxSvg(model, [text('engrave')]);
    expect(out).toContain('<image id="art-words"');
  });

  it('writes text as its letters\' outlines on the Engrave layer, a filled path per line', () => {
    const out = exportBoxSvg(model, [text('engrave')], 'all', new Map([['words', outline]]));
    const engrave = out.slice(out.indexOf('id="Engrave_Artwork"'));
    expect(out).not.toContain('<image id="art-words"');
    expect(engrave).toContain('id="art1-text" data-name="words"');
    expect(engrave).toContain('data-text="Hi"');
    expect(engrave).toContain('data-text="there"');
    expect(engrave.match(/<path id="art1-text-\d" [^>]*fill="#000000" fill-rule="nonzero"/g)).toHaveLength(2);
  });

  it('prints text outlines in the text\'s own colour', () => {
    const out = exportBoxSvg(model, [text('print')], 'all', new Map([['words', outline]]));
    const print = out.slice(out.indexOf('id="Print_Artwork"'));
    expect(print).toContain('fill="#b45309"');
  });

  it('places text outlines in the artwork\'s box at the render\'s shape', () => {
    const out = exportBoxSvg(model, [text('engrave')], 'all', new Map([['words', outline]]));
    const d = out.match(/data-text="Hi" d="([^"]+)"/)![1];
    const pts = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
    // 200 × 100 px into the 40 × 10 mm box: 20 × 10 mm, the first line the top-left quarter of it.
    const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    expect(w).toBeCloseTo(10, 3);
    expect(h).toBeCloseTo(5, 3);
  });
});
