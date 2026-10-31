import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters } from '../src/engine/types';
import { WINE_BOTTLES, shoulderProfile, taperHalfGapMm, wineCarrierLayout } from '../src/engine/wineBottles';

const carrier = (p: Partial<BoxParameters> = {}): BoxParameters => ({
  ...DEFAULT_BOX_PARAMETERS,
  category: 'wood-finger',
  templateId: 'finger-wine-carrier',
  ...p,
});

describe('wine bottles', () => {
  it('lists the six bottles in order', () => {
    expect(WINE_BOTTLES.map((b) => b.id)).toEqual(['bordeaux-750', 'burgundy-750', 'champagne-750', 'riesling-750', 'half-375', 'magnum-1500']);
  });
});

describe('wine carrier layout', () => {
  it('sizes the box from the bottle', () => {
    const l = wineCarrierLayout(carrier());
    expect(l.innerSideMm).toBe(84);
    expect(l.bodyHeightMm).toBe(214);
  });

  it('solves a shoulder profile that meets its inset and height', () => {
    const r = shoulderProfile(42, 90, 12)!;
    const inset = 2 * 12 * (1 - Math.cos(r.angleRad)) + r.slopeMm * Math.sin(r.angleRad);
    const height = 2 * 12 * Math.sin(r.angleRad) + r.slopeMm * Math.cos(r.angleRad);
    expect(inset).toBeCloseTo(42, 2);
    expect(height).toBeCloseTo(90, 2);
  });

  it('returns no profile when the shoulder is too short', () => {
    expect(shoulderProfile(42, 20, 12)).toBeNull();
  });

  it('clamps a shoulder below the minimum and says so', () => {
    const l = wineCarrierLayout(carrier({ wineShoulderHeightMm: 10 }));
    expect(l.shoulderClamped).toBe(true);
    expect(l.shoulderHeightMm).toBe(l.minShoulderHeightMm);
  });

  it('clears the neck at the bottle top', () => {
    for (const b of WINE_BOTTLES) {
      const p = carrier({ wineBottleId: b.id, wineBottleDiameterMm: b.diameterMm, wineBottleHeightMm: b.heightMm, wineBottleShoulderMm: b.shoulderMm });
      const l = wineCarrierLayout(p);
      expect(taperHalfGapMm(l, p.materialThicknessMm, b.heightMm - l.bodyHeightMm)).toBeGreaterThanOrEqual(l.neckClearanceMm - 1e-6);
    }
  });

  it('never errors on a bottle shorter than its shoulder', () => {
    const l = wineCarrierLayout(carrier({ wineBottleId: 'custom', wineBottleHeightMm: 150, wineBottleShoulderMm: 210 }));
    for (const v of Object.values(l)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  });
});
