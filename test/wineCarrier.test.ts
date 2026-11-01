import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { bounds } from '../src/engine/geom';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters, Point2D } from '../src/engine/types';
import { WINE_BOTTLES, shoulderLengthMm, taperHalfGapMm, wineCarrierLayout } from '../src/engine/wineBottles';
import { HOOK, wineCarrierPieces } from '../src/engine/wineCarrier';

const carrier = (p: Partial<BoxParameters> = {}): BoxParameters => ({
  ...DEFAULT_BOX_PARAMETERS,
  category: 'wood-finger',
  templateId: 'finger-wine-carrier',
  ...p,
});
const bottle = (id: string): Partial<BoxParameters> => {
  const b = WINE_BOTTLES.find((x) => x.id === id)!;
  return { wineBottleId: b.id, wineBottleDiameterMm: b.diameterMm, wineBottleHeightMm: b.heightMm, wineBottleShoulderMm: b.shoulderMm };
};

/** Even-odd point in polygon. */
const inside = (p: Point2D, poly: Point2D[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
/** The most an outline turns at one vertex, in degrees, among vertices `where` picks. */
const sharpestTurn = (ring: Point2D[], where: (p: Point2D) => boolean) => {
  let worst = 0;
  ring.forEach((p, i) => {
    if (!where(p)) return;
    const a = ring[(i - 1 + ring.length) % ring.length];
    const b = ring[(i + 1) % ring.length];
    const t = Math.abs(Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x));
    worst = Math.max(worst, (Math.min(t, 2 * Math.PI - t) * 180) / Math.PI);
  });
  return worst;
};

describe('wine carrier pieces', () => {
  const p = carrier();
  const l = wineCarrierLayout(p);
  const T = p.materialThicknessMm;
  const parts = wineCarrierPieces(p);

  it('makes five pieces', () => {
    expect(generateBoxModel(p).panels2D.map((q) => q.id).sort()).toEqual(['back', 'bottom', 'front', 'left', 'right']);
  });

  it('unrolls the front to the body, both bends, the slope and the handle', () => {
    const front = parts.front;
    expect(front.heightMm).toBeCloseTo(l.bodyHeightMm + shoulderLengthMm(l) + l.handleHeightMm, 2);
  });

  it('cuts one unbroken hinge up both bends when no slope comes between them', () => {
    const handleFrom = l.bodyHeightMm + shoulderLengthMm(l);
    expect(l.slopeLengthMm).toBeLessThan(0.5);
    expect(parts.meta.bendZones).toEqual([[l.bodyHeightMm, handleFrom]]);
    // No gap between rows of slits wider than two rows' spacing, anywhere up the hinge.
    const ys = [...new Set(parts.front.cutsUp.flat().map((q) => Math.round(q.y * 100) / 100))].sort((a, b) => a - b);
    let widest = 0;
    for (let i = 1; i < ys.length; i++) widest = Math.max(widest, ys[i] - ys[i - 1]);
    expect(widest).toBeLessThan(2 * p.livingHingePitchMm + 0.01);
  });

  it('keeps a solid slope between the hinges when the shoulder is too short for one bend', () => {
    const q = carrier({ wineShoulderHeightMm: 0, livingHingePitchMm: 6, livingHingeCutMm: 10, livingHingeBridgeMm: 6 });
    const lq = wineCarrierLayout(q);
    if (lq.slopeLengthMm < 0.5) return;
    expect(wineCarrierPieces(q).meta.bendZones).toHaveLength(2);
  });

  it('puts hinge slits only in the bend zones', () => {
    const zones = parts.meta.bendZones;
    expect(parts.front.cutsUp.length).toBeGreaterThan(10);
    for (const cut of parts.front.cutsUp) {
      const ys = cut.map((q) => q.y);
      const inZone = zones.some(([lo, hi]) => Math.min(...ys) >= lo - 1e-6 && Math.max(...ys) <= hi + 1e-6);
      expect(inZone).toBe(true);
    }
  });

  it('lines up every side tab with a front and back slot', () => {
    expect(parts.meta.sideTabCentres.length).toBeGreaterThanOrEqual(2);
    expect(parts.meta.frontSlotCentres).toEqual(parts.meta.sideTabCentres.map((c) => expect.closeTo(c, 6)));
  });

  it('has no tabs or slots on the taper', () => {
    for (const c of [...parts.meta.sideTabCentres, ...parts.meta.frontSlotCentres]) expect(c).toBeLessThan(l.bodyHeightMm);
  });

  it('lets the hooked tabs through pressed down, and holds them when carried', () => {
    const { earSlot, tabLo, tabHi } = parts.meta;
    // Pressed down by the hook's height, the whole tab (notch and hook) fits the slot.
    const down = [
      { x: -T + 0.5, y: tabLo - HOOK.hookMm + 0.5 },
      { x: T - 0.5, y: tabLo - HOOK.hookMm + 0.5 },
      { x: T - 0.5, y: tabHi - HOOK.hookMm - 0.5 },
      { x: -T + 0.5, y: tabHi - HOOK.hookMm - 0.5 },
    ];
    for (const q of down) expect(inside(q, earSlot)).toBe(true);
    // Carried, the notch sits in the slot and the hook rises above it, behind solid ear.
    const slotTop = Math.max(...earSlot.map((q) => q.y));
    expect(tabHi - HOOK.hookMm).toBeLessThanOrEqual(slotTop + 1e-6);
    expect(inside({ x: 0, y: tabHi - 0.5 }, earSlot)).toBe(false);
  });

  it('rounds every touchable corner', () => {
    const handleFrom = l.bodyHeightMm + shoulderLengthMm(l) + 1;
    // The notch's inside corners are square on purpose: they sit inside the ear, where the hook seats.
    const notchY = handleFrom - 1 + parts.meta.notchHiMm;
    const { handleLeftMm: hl, handleRightMm: hr } = parts.meta;
    const inNotch = (q: { x: number; y: number }) => Math.abs(q.y - notchY) < 1e-6 && [hl, hl - T, hr, hr + T].some((x) => Math.abs(q.x - x) < 1e-6);
    expect(sharpestTurn(parts.front.outlineUp, (q) => q.y > handleFrom && !inNotch(q))).toBeLessThan(30);
    expect(sharpestTurn(parts.left.outlineUp, (q) => q.y > l.bodyHeightMm + 2)).toBeLessThan(30);
  });

  it('fits the ear features on a half bottle and in 6 mm wood', () => {
    for (const q of [carrier(bottle('half-375')), carrier({ materialThicknessMm: 6 })]) {
      const m = wineCarrierPieces(q).meta;
      const slot = bounds([m.earSlot])!;
      // The patch sits low on the side, inside its outline (centred like the patch).
      const S = wineCarrierLayout(q).innerSideMm;
      const side = wineCarrierPieces(q).left.outlineUp.map((pt) => ({ x: pt.x - S / 2, y: pt.y }));
      for (const ring of m.earPatch) for (const pt of ring) expect(inside(pt, side)).toBe(true);
      for (const pt of m.earSlot) expect(inside({ x: pt.x * 0.98, y: pt.y }, m.ear)).toBe(true);
      const patchTop = Math.max(...m.earPatch.flat().map((pt) => pt.y));
      expect(patchTop).toBeLessThan(slot.y);
    }
  });

  it('keeps patterns to the body', () => {
    for (const piece of [parts.front, parts.left]) expect(piece.safeUp.y + piece.safeUp.height).toBeLessThanOrEqual(l.bodyHeightMm);
  });

  it('splits a magnum front onto sheets when the bed is small', () => {
    const m = generateBoxModel(carrier({ ...bottle('magnum-1500'), bedPresetId: 'xtool-m2' }));
    const front = m.panels2D.find((q) => q.id === 'front')!;
    expect(front.heightMm).toBeGreaterThan(300);
    expect(m.fitsOnBed).toBe(false);
    expect(m.sheets.length > 1 || m.oversizePanelIds.includes('front')).toBe(true);
  });
});

describe('wine carrier fit', () => {
  it('cuts the ear slot square and full width for its whole height, so the stacked hook passes', () => {
    for (const q of [carrier(), carrier({ materialThicknessMm: 6 }), carrier({ kerfMm: 0 })]) {
      const T = q.materialThicknessMm;
      const { earSlot } = wineCarrierPieces(q).meta;
      expect(earSlot).toHaveLength(4);
      const b = bounds([earSlot])!;
      expect(b.w).toBeCloseTo(2 * T - q.kerfMm, 6);
      expect(b.h).toBeCloseTo(HOOK.notchMm + HOOK.hookMm, 6);
    }
  });

  it('keeps the notch’s inside corners square, so the hook seats its full depth', () => {
    const q = carrier();
    const l = wineCarrierLayout(q);
    const T = q.materialThicknessMm;
    const parts = wineCarrierPieces(q);
    const handleFrom = l.bodyHeightMm + shoulderLengthMm(l);
    const y = handleFrom + parts.meta.notchHiMm;
    const has = (x: number) => parts.front.outlineUp.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);
    const { handleLeftMm, handleRightMm } = parts.meta;
    expect(has(handleLeftMm)).toBe(true);
    expect(has(handleLeftMm - T)).toBe(true);
    expect(has(handleRightMm)).toBe(true);
    expect(has(handleRightMm + T)).toBe(true);
  });

  it('keeps solid wood between every front slot and the front’s edge', () => {
    const parts = wineCarrierPieces(carrier());
    const b = bounds([parts.front.outlineUp])!;
    const bodyLeft = Math.min(...parts.front.outlineUp.filter((p) => p.y < 10).map((p) => p.x));
    const bodyRight = Math.max(...parts.front.outlineUp.filter((p) => p.y < 10).map((p) => p.x));
    for (const hole of parts.front.holesUp.slice(1)) {
      expect(Math.min(...hole.map((p) => p.x)) - bodyLeft).toBeGreaterThanOrEqual(2);
      expect(bodyRight - Math.max(...hole.map((p) => p.x))).toBeGreaterThanOrEqual(2);
    }
    expect(b.w).toBeGreaterThan(0);
  });

  it('lets the ear’s hinge slits run out to its edges, with no solid border to crack', () => {
    const { earPatch, ear } = wineCarrierPieces(carrier()).meta;
    const half = Math.max(...ear.map((p) => p.x));
    const widest = Math.max(...earPatch.flat().map((p) => Math.abs(p.x)));
    expect(half - widest).toBeLessThan(0.5);
  });
});

describe('wine carrier sides', () => {
  const p = carrier();
  const l = wineCarrierLayout(p);
  const parts = wineCarrierPieces(p);

  it('never narrows a side below its ear', () => {
    const ear = Math.max(...parts.meta.ear.map((q) => q.x)) * 2;
    // At least half the box's depth: the ears frame the handle rather than pinching to a sliver.
    expect(ear).toBeGreaterThanOrEqual(l.innerSideMm / 2 - 1e-6);
    const ring = parts.left.outlineUp;
    const top = Math.max(...ring.map((q) => q.y));
    // Off the outline's vertices, so every probe crosses its edges.
    for (let y = l.bodyHeightMm + 1.123; y < top - ear; y += 5) {
      // The outline's width at height y: where its edges cross that height.
      const xs: number[] = [];
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
      });
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(ear - 0.5);
    }
  });

  it('draws the ears’ hinge slits in 3D', () => {
    const m = generateBoxModel(p);
    for (const id of ['left', 'right']) expect(m.panels3D.find((q) => q.id === id)!.surfaceLines!.length).toBe(parts.left.cutsUp.length);
  });
});

describe('wine carrier ear and base', () => {
  const p = carrier();
  const l = wineCarrierLayout(p);
  const parts = wineCarrierPieces(p);

  it('puts the ear’s hinge low, where the side is near full width', () => {
    const ys = parts.left.cutsUp.flat().map((q) => q.y);
    const xs = parts.left.cutsUp.flat().map((q) => q.x);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeLessThan(l.bodyHeightMm + 0.35 * l.shoulderHeightMm);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.8 * l.innerSideMm);
  });

  it('tabs the bottom into all four walls', () => {
    const bottomTabs = parts.meta.bottomTabCount;
    const bottomSlots = (piece: typeof parts.front) => piece.holesUp.filter((h) => Math.max(...h.map((q) => q.y)) < l.bodyHeightMm / 4 && Math.max(...h.map((q) => q.x)) - Math.min(...h.map((q) => q.x)) > Math.max(...h.map((q) => q.y)) - Math.min(...h.map((q) => q.y))).length;
    for (const piece of [parts.front, parts.back, parts.left, parts.right]) expect(bottomSlots(piece)).toBe(bottomTabs);
  });
});

describe('wine carrier side sweep', () => {
  const p = carrier();
  const l = wineCarrierLayout(p);
  const parts = wineCarrierPieces(p);
  const widthAt = (y: number) => {
    const ring = parts.left.outlineUp;
    const xs: number[] = [];
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
    });
    return Math.max(...xs) - Math.min(...xs);
  };

  it('sweeps in all the way up the shoulder, with no straight-sided strip', () => {
    let last = Infinity;
    // Up the taper, the side keeps narrowing: never two equal widths in a row.
    for (let y = l.bodyHeightMm + 5.123; y < l.bodyHeightMm + l.shoulderHeightMm - 5; y += 5) {
      const w = widthAt(y);
      expect(w).toBeLessThan(last);
      last = w;
    }
  });
});

describe('wine carrier side curve', () => {
  const p = carrier();
  const l = wineCarrierLayout(p);
  const parts = wineCarrierPieces(p);
  const T = p.materialThicknessMm;
  const S = l.innerSideMm;
  const halfAt = (y: number) => {
    const ring = parts.left.outlineUp;
    const xs: number[] = [];
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
    });
    return Math.max(...xs) - S / 2;
  };

  it('turns gently all the way up: no tight bend where it meets the ear', () => {
    // Curvature from the edge's second difference: no tighter than a 60 mm radius anywhere up the taper.
    const step = 4;
    for (let h = step + 0.123; h < l.shoulderHeightMm - step; h += step) {
      const y = l.bodyHeightMm + h;
      const [a, b, c] = [halfAt(y - step), halfAt(y), halfAt(y + step)];
      const slope = (c - a) / (2 * step);
      const curve = Math.abs(a - 2 * b + c) / (step * step) / Math.pow(1 + slope * slope, 1.5);
      expect(1 / curve).toBeGreaterThan(60);
    }
  });

  it('never leaves a gap inside the closed flaps', () => {
    // Its edge reaches at least the flaps' inside faces all the way up.
    for (let h = 1.123; h < l.shoulderHeightMm; h += 3) expect(halfAt(l.bodyHeightMm + h)).toBeGreaterThanOrEqual(taperHalfGapMm(l, T, h) - 0.05);
  });
});
