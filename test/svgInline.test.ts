import { describe, expect, it } from 'vitest';
import { inlineSvgArtwork } from '../src/engine/svgInline';
import { exportBoxSvg } from '../src/engine/exporters';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { FaceArtwork } from '../src/engine/types';

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

  it('keeps text, set in a web font, as an image', () => {
    const text = { ...art('engrave', svgUrl, 'words'), textConfig: { text: 'Hi', fontFamily: 'Inter', fontWeight: '400' as const, fontStyle: 'normal' as const, textAlign: 'center' as const, color: '#000', letterSpacingEm: 0, lineHeight: 1.2 } };
    const out = exportBoxSvg(model, [text]);
    expect(out).toContain('<image id="art-words"');
  });
});
