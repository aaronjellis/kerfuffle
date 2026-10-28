import { describe, expect, it } from 'vitest';
import { containRect, imageAspect, sizeForAspect, svgAspect, svgTextFromDataUrl } from '../src/engine/artworkImage';

const svg = (attrs: string) => `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" ${attrs}><path d="M0 0"/></svg>`;

describe('artwork image shape', () => {
  it('reads an SVG’s shape from its width and height, or its viewBox', () => {
    expect(svgAspect(svg('width="200" height="100"'))).toBeCloseTo(0.5, 9);
    expect(svgAspect(svg('width="40mm" height="30mm" viewBox="0 0 10 10"'))).toBeCloseTo(0.75, 9);
    expect(svgAspect(svg('viewBox="0 0 640 220"'))).toBeCloseTo(220 / 640, 9);
    // Percentages say nothing about shape: fall back to the viewBox.
    expect(svgAspect(svg('width="100%" height="100%" viewBox="0,0,300,150"'))).toBeCloseTo(0.5, 9);
    expect(svgAspect(svg(''))).toBeNull();
  });

  it('decodes SVG data URLs, base64 or not', () => {
    const text = svg('viewBox="0 0 4 1"');
    expect(svgTextFromDataUrl(`data:image/svg+xml;base64,${btoa(text)}`)).toBe(text);
    expect(svgTextFromDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`)).toBe(text);
    expect(svgTextFromDataUrl('data:image/png;base64,AAAA')).toBeNull();
  });

  it('prefers the SVG’s own shape over a natural size the browser made up', () => {
    const url = `data:image/svg+xml;base64,${btoa(svg('viewBox="0 0 400 100"'))}`;
    expect(imageAspect({ naturalWidth: 300, naturalHeight: 150 }, url)).toBeCloseTo(0.25, 9);
    expect(imageAspect({ naturalWidth: 800, naturalHeight: 600 }, 'data:image/png;base64,AAAA')).toBeCloseTo(0.75, 9);
    expect(imageAspect({ naturalWidth: 0, naturalHeight: 0 }, 'data:image/png;base64,AAAA')).toBeNull();
  });

  it('fits without stretching, centred, and sizes by the longer side', () => {
    expect(containRect(60, 60, 0.25)).toEqual({ x: 0, y: 22.5, w: 60, h: 15 });
    expect(containRect(60, 20, 1)).toEqual({ x: 20, y: 0, w: 20, h: 20 });
    expect(sizeForAspect(0.25, 60)).toEqual({ widthMm: 60, heightMm: 15 });
    expect(sizeForAspect(2, 60)).toEqual({ widthMm: 30, heightMm: 60 });
  });
});
