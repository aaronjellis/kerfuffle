import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters } from '../src/engine/types';
import { WINE_BOTTLES, bottlePatch, shoulderProfile, taperHalfGapMm, wineCarrierChecks, wineCarrierLayout } from '../src/engine/wineBottles';

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

describe('wine carrier bend checks', () => {
  it('passes the defaults with no notes', () => {
    const c = wineCarrierChecks(carrier());
    expect(c.shoulderCracks || c.earCracks || c.thinWeb).toBe(false);
    expect(c.notes).toEqual([]);
  });

  it('warns that stiff hinges will crack the shoulders and ears', () => {
    const c = wineCarrierChecks(carrier({ livingHingePitchMm: 6, livingHingeCutMm: 10, livingHingeBridgeMm: 6 }));
    expect(c.shoulderCracks).toBe(true);
    expect(c.earCracks).toBe(true);
    expect(c.notes).toContain('The shoulders open and close each time; at these settings they may crack. Move the hinge rows closer or lengthen the slits.');
    expect(c.notes).toContain('The ears flex each time you open it; at these settings they may crack. Move the hinge rows closer or lengthen the slits.');
  });

  it('says when it raised the shoulders to clear the neck', () => {
    const p = carrier({ wineShoulderHeightMm: 10 });
    const min = wineCarrierLayout(p).minShoulderHeightMm;
    expect(wineCarrierChecks(p).notes).toContain(`Shoulders raised to ${min} mm so the taper clears the bottle's neck.`);
  });

  it('caps the shoulder bend at 40 mm however stiff the hinge', () => {
    expect(wineCarrierLayout(carrier({ livingHingePitchMm: 6, livingHingeCutMm: 10, livingHingeBridgeMm: 6 })).bendRadiusMm).toBe(40);
  });
});

describe('picking a bottle', () => {
  it('fills in the magnum’s size', () => {
    expect(bottlePatch('magnum-1500')).toEqual({ wineBottleId: 'magnum-1500', wineBottleDiameterMm: 100, wineBottleHeightMm: 350, wineBottleShoulderMm: 245 });
  });

  it('keeps the size when switching to custom', () => {
    expect(bottlePatch('custom')).toEqual({ wineBottleId: 'custom' });
  });
});
