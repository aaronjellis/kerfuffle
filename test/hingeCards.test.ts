import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CARD_HEIGHT_MM,
  CARD_HOLE_AT,
  CARD_HOLE_D_MM,
  CARD_PATTERN_TOP_MM,
  CARD_WIDTH_MM,
  generateHingeCardsModel,
  hingeCardLabel,
  hingeCardSettings,
} from '../src/engine/hingeCards';
import { HINGE_PATTERNS, HINGE_PATTERN_IDS, hingePatternInfo } from '../src/engine/livingHinge';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { Panel3DTransform, Point2D } from '../src/engine/types';

const params = { ...DEFAULT_BOX_PARAMETERS, materialThicknessMm: 3, kerfMm: 0.12 };
const all = [...HINGE_PATTERN_IDS];

/** Every point of an SVG path made of M and L commands. */
const points = (d: string): Point2D[] =>
  [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

/** A point on a card, in world space. */
const toWorld = (p: Panel3DTransform, pt: Point2D) =>
  new THREE.Vector3(pt.x - p.widthMm / 2, -(pt.y - p.heightMm / 2), 0)
    .applyEuler(new THREE.Euler(...p.rotation))
    .add(new THREE.Vector3(...p.closedPos));

describe('hinge card settings', () => {
  it('makes one card per pattern at its defaults', () => {
    const cards = hingeCardSettings(all, 'none');
    expect(cards.map((c) => c.pattern)).toEqual(all);
    cards.forEach((c, i) => expect(c).toEqual({ pattern: all[i], ...HINGE_PATTERNS[i].defaults }));
  });

  it('steps the pitch under, at and over the default, inside the pattern’s range', () => {
    const cards = hingeCardSettings(['straight', 'honeycomb'], 'pitch');
    expect(cards.map((c) => c.pitchMm)).toEqual([2, 2.5, 3.1, 6.4, 8, 10]);
    for (const c of cards) {
      const [lo, hi] = hingePatternInfo(c.pattern).pitchRangeMm;
      expect(c.pitchMm).toBeGreaterThanOrEqual(lo);
      expect(c.pitchMm).toBeLessThanOrEqual(hi);
    }
  });

  it('steps the bridge and keeps everything else', () => {
    const cards = hingeCardSettings(['wave'], 'bridge');
    expect(cards.map((c) => c.bridgeMm)).toEqual([3.2, 4, 5]);
    expect(new Set(cards.map((c) => c.pitchMm)).size).toBe(1);
  });
});

describe('hinge card labels', () => {
  it('name the pattern and every size it uses', () => {
    expect(hingeCardLabel({ pattern: 'straight', pitchMm: 2.5, cutMm: 30, bridgeMm: 3.5 })).toEqual([
      'Straight',
      'SPACING 2.5',
      'SLIT 30',
      'BRIDGE 3.5',
    ]);
    expect(hingeCardLabel({ pattern: 'honeycomb', pitchMm: 8, cutMm: 30, bridgeMm: 2 })).toEqual([
      'Honeycomb',
      'CELL 8',
      'BRIDGE 2',
    ]);
  });
});

describe('hinge cards model', () => {
  const cards = hingeCardSettings(all, 'none');
  const m = generateHingeCardsModel(params, cards);

  it('lays out a card per setting, each a rounded card with a bolt hole, slits and engraved labels', () => {
    expect(m.panels2D.map((p) => p.id)).toEqual(cards.map((_, i) => `hinge-card-${i + 1}`));
    for (const p of m.panels2D) {
      expect(p.widthMm).toBe(CARD_WIDTH_MM);
      expect(p.heightMm).toBe(CARD_HEIGHT_MM);
      const ids = p.paths.map((x) => x.id);
      expect(ids).toContain(`${p.id}-outline`);
      expect(ids).toContain(`${p.id}-hole`);
      expect(p.paths.filter((x) => x.id.includes('-slit-')).length).toBeGreaterThan(10);
      expect(p.paths.filter((x) => x.layer === 'score').map((x) => x.id)).toEqual([
        `${p.id}-name`,
        `${p.id}-sizes`,
        `${p.id}-thickness`,
      ]);
    }
  });

  it('keeps the slits inside the card, below the label band', () => {
    for (const p of m.panels2D) {
      for (const path of p.paths.filter((x) => x.id.includes('-slit-'))) {
        for (const pt of points(path.d)) {
          expect(pt.x).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.x).toBeLessThanOrEqual(CARD_WIDTH_MM + 1e-6);
          expect(pt.y).toBeGreaterThanOrEqual(CARD_PATTERN_TOP_MM - 1e-6);
          expect(pt.y).toBeLessThanOrEqual(CARD_HEIGHT_MM - 5);
        }
      }
    }
  });

  it('keeps the labels clear of the bolt hole and the pattern', () => {
    const r = CARD_HOLE_D_MM / 2;
    for (const p of m.panels2D) {
      for (const path of p.paths.filter((x) => x.id.endsWith('-name') || x.id.endsWith('-sizes'))) {
        for (const pt of points(path.d)) {
          expect(Math.hypot(pt.x - CARD_HOLE_AT.x, pt.y - CARD_HOLE_AT.y)).toBeGreaterThan(r + 1);
          expect(pt.y).toBeLessThan(CARD_PATTERN_TOP_MM - 1);
          expect(pt.x).toBeLessThan(CARD_WIDTH_MM - 1);
        }
      }
    }
  });

  it('fans the cards in 3D about one bolt, stacked a sheet thick', () => {
    const bolts = m.panels3D.map((p) => toWorld(p, CARD_HOLE_AT));
    for (const b of bolts) {
      expect(b.x).toBeCloseTo(bolts[0].x, 6);
      expect(b.z).toBeCloseTo(bolts[0].z, 6);
    }
    bolts.forEach((b, i) => i > 0 && expect(b.y - bolts[i - 1].y).toBeCloseTo(3, 6));
    // Each card turns further: its far corner points a new way.
    const far = m.panels3D.map((p) => toWorld(p, { x: CARD_WIDTH_MM, y: CARD_HEIGHT_MM }));
    const angles = far.map((f, i) => Math.atan2(f.z - bolts[i].z, f.x - bolts[i].x));
    expect(new Set(angles.map((a) => a.toFixed(3))).size).toBe(cards.length);
  });

  it('centres the fan on the stage', () => {
    const corners = m.panels3D.flatMap((p) =>
      [
        { x: 0, y: 0 },
        { x: CARD_WIDTH_MM, y: 0 },
        { x: CARD_WIDTH_MM, y: CARD_HEIGHT_MM },
        { x: 0, y: CARD_HEIGHT_MM },
      ].map((c) => toWorld(p, c)),
    );
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 6);
  });

  it('draws each card’s slits on it in 3D', () => {
    m.panels3D.forEach((p) => expect(p.surfaceLines!.length).toBeGreaterThan(10));
  });
});
