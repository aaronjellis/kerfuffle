import { describe, expect, it } from 'vitest';
import {
  availableStyle,
  fontFileUrls,
  fontsourceId,
  nearestWeight,
  offeredWeights,
  parseUnicodeRange,
  snapWeight,
  subsetsForText,
  type FontsourceMeta,
} from '../src/engine/fontSource';

// Paytone One's listing, as Fontsource's API gives it (trimmed).
const paytone: FontsourceMeta = {
  id: 'paytone-one',
  family: 'Paytone One',
  weights: [400],
  styles: ['normal'],
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  defSubset: 'latin',
  unicodeRange: {
    vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  variants: {
    '400': {
      normal: Object.fromEntries(
        ['latin', 'latin-ext', 'vietnamese'].map((s) => [
          s,
          { url: { ttf: `https://cdn.jsdelivr.net/fontsource/fonts/paytone-one@latest/${s}-400-normal.ttf` } },
        ])
      ),
    },
  },
};

describe('Fontsource fonts', () => {
  it('names a family as Fontsource does', () => {
    expect(fontsourceId('Paytone One')).toBe('paytone-one');
    expect(fontsourceId('  Playfair Display SC ')).toBe('playfair-display-sc');
    expect(fontsourceId('M PLUS 1p')).toBe('m-plus-1p');
  });

  it('reads unicode ranges', () => {
    expect(parseUnicodeRange('U+0000-00FF, U+0131,U+2000-206F')).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x2000, 0x206f],
    ]);
  });

  it('fetches only the subsets the text needs', () => {
    expect(subsetsForText(paytone, 'Café crème')).toEqual(['latin']);
    expect(subsetsForText(paytone, 'Łódź')).toEqual(['latin', 'latin-ext']);
    expect(subsetsForText(paytone, 'Phở')).toEqual(['latin', 'vietnamese']);
    expect(subsetsForText(paytone, 'Việt')).toEqual(['latin', 'vietnamese']);
  });

  it('picks the TTF for each subset', () => {
    expect(fontFileUrls(paytone, 400, 'normal', 'Łódź')).toEqual([
      'https://cdn.jsdelivr.net/fontsource/fonts/paytone-one@latest/latin-400-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/paytone-one@latest/latin-ext-400-normal.ttf',
    ]);
    expect(fontFileUrls(paytone, 700, 'normal', 'Hi')).toEqual([]);
  });

  it('uses the weight and slant the font really has', () => {
    expect(nearestWeight([400], 700)).toBe(400);
    expect(nearestWeight([300, 500], 400)).toBe(500);
    expect(availableStyle(['normal'], 'italic')).toBe('normal');
    expect(availableStyle(['normal', 'italic'], 'italic')).toBe('italic');
  });

  it('offers only weights the font has, so the canvas never fakes a bold', () => {
    expect(offeredWeights([400])).toEqual(['400']);
    expect(offeredWeights([100, 200, 300, 400, 500, 600, 700, 800, 900])).toEqual(['400', '600', '700', '800']);
    expect(offeredWeights([300])).toEqual(['400']);
    expect(snapWeight([400], '700')).toBe('400');
    expect(snapWeight([400, 700, 900], '800')).toBe('700');
    expect(snapWeight([400, 700], '700')).toBe('700');
  });
});
