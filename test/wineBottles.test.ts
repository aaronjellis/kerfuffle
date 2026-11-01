import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters } from '../src/engine/types';
import { WINE_BOTTLES, bottlePatch, carrierFloorMm, shoulderProfile, taperHalfGapMm, wineCarrierChecks, wineCarrierLayout } from '../src/engine/wineBottles';

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
    // The bottom's top (12 mm feet allowance + 3 mm ply) + the shoulder at 210 + 4 mm clearance.
    expect(l.bodyHeightMm).toBe(229);
  });

  it('meets its inset and height with a soft lower bend, a slope and a short top bend', () => {
    const r = shoulderProfile(42, 140, 60, 20)!;
    const sum = 60 + 20;
    expect(sum * (1 - Math.cos(r.angleRad)) + r.slopeMm * Math.sin(r.angleRad)).toBeCloseTo(42, 4);
    expect(sum * Math.sin(r.angleRad) + r.slopeMm * Math.cos(r.angleRad)).toBeCloseTo(140, 4);
  });

  it('softens the lower bend, keeps the top one short, and runs a straight slope between', () => {
    const l = wineCarrierLayout(carrier());
    expect(l.bendRadiusMm).toBeGreaterThan(2 * l.topBendRadiusMm);
    expect(l.slopeLengthMm).toBeGreaterThan(0);
  });

  it('clamps a shoulder below the minimum and says so', () => {
    const l = wineCarrierLayout(carrier({ wineShoulderHeightMm: 10 }));
    expect(l.shoulderClamped).toBe(true);
    expect(l.shoulderHeightMm).toBe(l.minShoulderHeightMm);
  });

  // The bottle stands on the bottom, which sits above the feet: heights count from there.
  it('clears the neck where the bottle really stands, with and without feet', () => {
    for (const wineFeet of [true, false])
      for (const b of WINE_BOTTLES) {
        const p = carrier({ wineFeet, wineBottleId: b.id, wineBottleDiameterMm: b.diameterMm, wineBottleHeightMm: b.heightMm, wineBottleShoulderMm: b.shoulderMm });
        const l = wineCarrierLayout(p);
        const stand = carrierFloorMm(p) + p.materialThicknessMm;
        expect(taperHalfGapMm(l, p.materialThicknessMm, stand + b.heightMm - l.bodyHeightMm)).toBeGreaterThanOrEqual(l.neckClearanceMm - 1e-6);
      }
  });

  it('starts the taper above the bottle’s shoulder, even with no clearance', () => {
    for (const b of WINE_BOTTLES) {
      const p = carrier({ wineClearanceMm: 0, wineBottleId: b.id, wineBottleDiameterMm: b.diameterMm, wineBottleHeightMm: b.heightMm, wineBottleShoulderMm: b.shoulderMm });
      expect(wineCarrierLayout(p).bodyHeightMm).toBeGreaterThanOrEqual(carrierFloorMm(p) + p.materialThicknessMm + b.shoulderMm);
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

  it('bends the shoulders gently enough for the default hinge, with its margin', () => {
    const c = wineCarrierChecks(carrier());
    expect(wineCarrierLayout(carrier()).topBendRadiusMm).toBeGreaterThanOrEqual(c.shoulderBendMm - 1e-6);
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

describe('the ears flex without cracking', () => {
  it('passes the ears at the defaults and in 6 mm wood', () => {
    expect(wineCarrierChecks(carrier()).earCracks).toBe(false);
    expect(wineCarrierChecks(carrier({ materialThicknessMm: 6 })).earCracks).toBe(false);
  });

  it('asks the ear for a tighter bend the further it must move to free the tabs', () => {
    expect(wineCarrierChecks(carrier({ materialThicknessMm: 6 })).earNeedMm).toBeLessThan(wineCarrierChecks(carrier()).earNeedMm);
  });
});
