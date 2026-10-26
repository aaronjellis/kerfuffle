import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { computeMailerSpans } from '../src/engine/mailerEngine';

const base = { ...DEFAULT_BOX_PARAMETERS, category: 'cardboard-fold' as const, templateId: 'cardboard-mailer' as const };

describe('mailer ply model', () => {
  for (const T of [1.5, 3]) {
    it(`spans follow the ply table at T=${T}`, () => {
      const s = computeMailerSpans({ ...base, materialThicknessMm: T, includeLidFlaps: true }, 110, 80, 55);
      expect(s.roll).toBeCloseTo(3 * T);
      expect(s.floorW).toBeCloseTo(110 + T + 6 * T);
      expect(s.floorD).toBeCloseTo(80 + 2 * T);
      expect(s.backH).toBeCloseTo(55 + T);
      expect(s.frontH).toBeCloseTo(55 + T);
      expect(s.outerSideH).toBeCloseTo(55 + T / 2);
      expect(s.innerSideH).toBeCloseTo(55 - T / 2);
      expect(s.lidD).toBeCloseTo(80 + 3 * T);
      expect(s.tuckW).toBeCloseTo(110 - 2 * T);
      expect(s.lidFlapDepth).toBeCloseTo(55 - T);
      expect(s.earH).toBeCloseTo(55 - 2 * T);
      expect(s.slot.inset).toBeCloseTo(T / 2 + 3 * T);
      expect(s.slot.width).toBeCloseTo(T + 0.5);
      expect(s.tab.depth).toBeCloseTo(2 * T + 6);
    });
  }
  it('roll drops to 2T with lid flaps off', () => {
    const s = computeMailerSpans({ ...base, includeLidFlaps: false }, 110, 80, 55);
    expect(s.roll).toBeCloseTo(2 * s.T);
    expect(s.lidFlapDepth).toBe(0);
  });
  it('front lock has tabs and slits; tuck top has a notch instead', () => {
    const lock = computeMailerSpans({ ...base, cardboardLockStyle: 'front-lock' }, 110, 80, 55);
    expect(lock.lock).toEqual({ tabW: 12, tabLen: 30, slitLen: 31 });
    expect(lock.notchR).toBe(0);
    const tuck = computeMailerSpans({ ...base, cardboardLockStyle: 'tuck', thumbNotch: true }, 110, 80, 55);
    expect(tuck.lock).toBeNull();
    expect(tuck.notchR).toBeCloseTo(Math.min(12, 110 / 8));
  });
  it('keeps a shallow box printable: inner wall ≥ 8 and tab shallower than the wall', () => {
    const s = computeMailerSpans({ ...base, materialThicknessMm: 3 }, 60, 60, 15);
    expect(s.innerSideH).toBeGreaterThanOrEqual(8);
    expect(s.tab.depth).toBeLessThan(s.innerSideH);
  });
});
