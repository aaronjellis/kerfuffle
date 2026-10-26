import { describe, expect, it } from 'vitest';
import { formatFromMm, parseDraft } from '../src/components/numberDraft';

describe('parseDraft', () => {
  const mm = { displayUnit: 'mm' as const, mmDecimals: 1, minMm: 20, maxMm: 500 };
  const inch = { displayUnit: 'in' as const, inDecimals: 3, mmDecimals: 2, minMm: 0.2, maxMm: 15 };

  it('commits nothing when the draft still reads as the current value', () => {
    expect(parseDraft('110', 110, mm)).toBeNull();
    // 3 mm shows as 0.118 in; a blur on that unedited text must not write back 2.997 mm.
    const shown = formatFromMm(3, inch);
    expect(shown).toBe('0.118');
    expect(parseDraft(shown, 3, inch)).toBeNull();
    expect(parseDraft(` ${shown} `, 3, inch)).toBeNull();
  });

  it('commits nothing for a blank or non-numeric draft', () => {
    expect(parseDraft('', 110, mm)).toBeNull();
    expect(parseDraft('  ', 110, mm)).toBeNull();
    expect(parseDraft('abc', 110, mm)).toBeNull();
  });

  it('commits an edit, converted to mm and clamped', () => {
    expect(parseDraft('120', 110, mm)).toBe(120);
    expect(parseDraft('5', 110, mm)).toBe(20);
    expect(parseDraft('900', 110, mm)).toBe(500);
    expect(parseDraft('0.125', 3, inch)).toBe(3.175);
  });

  it('rounds raw counts', () => {
    expect(parseDraft('2.6', 2, { isRawCount: true, minMm: 1, maxMm: 6 })).toBe(3);
    expect(parseDraft('2', 2, { isRawCount: true, minMm: 1, maxMm: 6 })).toBeNull();
  });
});
