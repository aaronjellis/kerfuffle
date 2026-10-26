import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS, MATERIAL_PRESETS, laserSettingsFor } from '../src/engine/presets';

describe('laserSettingsFor', () => {
  it('returns the matching preset settings for E-flute', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      materialThicknessMm: 1.5,
    });
    expect(laser).toEqual({ cutPower: 90, cutSpeed: 10, cutPasses: 1, scorePower: 18, scoreSpeed: 100 });
  });

  it('falls back to the first preset of the category for an unknown thickness', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'cardboard-fold',
      materialThicknessMm: 2.2,
    });
    const first = MATERIAL_PRESETS.find((m) => m.category === 'cardboard-fold')!;
    expect(laser).toEqual(first.laser);
  });

  it('matches within 0.01 mm', () => {
    const laser = laserSettingsFor({
      ...DEFAULT_BOX_PARAMETERS,
      category: 'wood-finger',
      materialThicknessMm: 6.005,
    });
    expect(laser.cutPasses).toBe(2);
  });

  it('every preset carries a laser block', () => {
    for (const m of MATERIAL_PRESETS) {
      expect(m.laser).toBeDefined();
      expect(Object.keys(m.laser).sort()).toEqual(
        ['cutPasses', 'cutPower', 'cutSpeed', 'scorePower', 'scoreSpeed']
      );
    }
  });
});
