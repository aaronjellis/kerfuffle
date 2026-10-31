import { describe, expect, it } from 'vitest';
import { previewCssUrl } from '../src/engine/previewFonts';

describe('previewCssUrl', () => {
  it('asks for one face per family, an italic through the ital axis', () => {
    const url = previewCssUrl([
      { family: 'Bebas Neue', weight: 400, style: 'normal' },
      { family: 'Playfair Display', weight: 700, style: 'italic' },
    ]);
    expect(url).toBe('https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400&family=Playfair+Display:ital,wght@1,700&display=swap');
  });
});
