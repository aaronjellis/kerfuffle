import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CARD_HEADER_MM,
  CARD_HEIGHT_MM,
  CARD_HOLE_AT,
  CARD_HOLE_D_MM,
  CARD_WIDTH_MM,
  cardZone,
  generateHingeCardsModel,
  hingeCardSets,
  hingeZoneLabel,
} from '../src/engine/hingeCards';
import { HINGE_PATTERNS, HINGE_PATTERN_IDS, HINGE_PITCH_RANGE_MM, hingeBendRadiusMm } from '../src/engine/livingHinge';
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

describe('hinge card sets', () => {
  it('makes one card per pattern, its middle zone at the pattern’s defaults', () => {
    const cards = hingeCardSets(all, 'pitch');
    expect(cards.map((c) => c.pattern)).toEqual(all);
    cards.forEach((c, i) => {
      expect(c.zones).toHaveLength(3);
      expect(c.zones[1]).toEqual({ pattern: all[i], ...HINGE_PATTERNS[i].defaults });
    });
  });

  it('steps the row spacing tight to loose, inside the offered range', () => {
    const [straight] = hingeCardSets(['straight'], 'pitch');
    expect(straight.zones.map((z) => z.pitchMm)).toEqual([1.2, 1.5, 2]);
    for (const z of straight.zones) {
      expect(z.pitchMm).toBeGreaterThanOrEqual(HINGE_PITCH_RANGE_MM[0]);
      expect(z.pitchMm).toBeLessThanOrEqual(HINGE_PITCH_RANGE_MM[1]);
    }
  });

  it('steps the slit or the bridge and keeps everything else', () => {
    const [cut] = hingeCardSets(['wave'], 'cut');
    expect(cut.zones.map((z) => z.cutMm)).toEqual([23, 30, 38]);
    const [bridge] = hingeCardSets(['wave'], 'bridge');
    expect(bridge.zones.map((z) => z.bridgeMm)).toEqual([2.1, 3, 4.2]);
    expect(new Set(bridge.zones.map((z) => z.pitchMm)).size).toBe(1);
  });

  it('runs from the tightest bend to the loosest when the spacing grows', () => {
    const [c] = hingeCardSets(['straight'], 'pitch');
    const r = c.zones.map((z) => hingeBendRadiusMm(z, 3, 0.12));
    expect(r[0]).toBeLessThan(r[1]);
    expect(r[1]).toBeLessThan(r[2]);
  });
});

describe('hinge zone labels', () => {
  it('give the zone letter, spacing, slit, bridge and estimated bend', () => {
    const s = { pattern: 'straight' as const, pitchMm: 1.5, cutMm: 30, bridgeMm: 3 };
    const r = Math.round(hingeBendRadiusMm(s, 3, 0.12));
    expect(hingeZoneLabel(0, s, 3, 0.12)).toBe(`A  SP 1.5  SL 30  BR 3  R${r}`);
  });
});

describe('hinge cards model', () => {
  const cards = hingeCardSets(all, 'pitch');
  const m = generateHingeCardsModel(params, cards);

  it('lays out a rounded card per pattern with a bolt hole, a header and three labelled zones', () => {
    expect(m.panels2D.map((p) => p.id)).toEqual(cards.map((_, i) => `hinge-card-${i + 1}`));
    for (const p of m.panels2D) {
      expect(p.widthMm).toBe(CARD_WIDTH_MM);
      expect(p.heightMm).toBe(CARD_HEIGHT_MM);
      const ids = p.paths.map((x) => x.id);
      expect(ids).toContain(`${p.id}-outline`);
      expect(ids).toContain(`${p.id}-hole`);
      expect(p.paths.filter((x) => x.layer === 'score').map((x) => x.id)).toEqual([
        `${p.id}-name`,
        `${p.id}-sheet`,
        `${p.id}-zone-A-label`,
        `${p.id}-zone-B-label`,
        `${p.id}-zone-C-label`,
      ]);
      for (const z of ['A', 'B', 'C']) {
        expect(p.paths.filter((x) => x.id.startsWith(`${p.id}-zone-${z}-slit-`)).length).toBeGreaterThan(8);
      }
    }
  });

  it('keeps each zone’s slits inside its own band, clear of the labels', () => {
    for (const p of m.panels2D) {
      (['A', 'B', 'C'] as const).forEach((z, i) => {
        const { region } = cardZone(i);
        for (const path of p.paths.filter((x) => x.id.startsWith(`${p.id}-zone-${z}-slit-`))) {
          for (const pt of points(path.d)) {
            expect(pt.x).toBeGreaterThanOrEqual(-1e-6);
            expect(pt.x).toBeLessThanOrEqual(CARD_WIDTH_MM + 1e-6);
            expect(pt.y).toBeGreaterThanOrEqual(region.y - 1e-6);
            expect(pt.y).toBeLessThanOrEqual(region.y + region.height + 1e-6);
          }
        }
      });
    }
  });

  it('keeps every label inside the card, on solid wood, clear of the bolt hole', () => {
    const r = CARD_HOLE_D_MM / 2;
    for (const p of m.panels2D) {
      for (const path of p.paths.filter((x) => x.layer === 'score')) {
        const pts = points(path.d);
        expect(pts.length).toBeGreaterThan(0);
        for (const pt of pts) {
          expect(Math.hypot(pt.x - CARD_HOLE_AT.x, pt.y - CARD_HOLE_AT.y)).toBeGreaterThan(r + 1);
          expect(pt.x).toBeGreaterThan(1);
          expect(pt.x).toBeLessThan(CARD_WIDTH_MM - 1);
          // Header text above the first zone; zone labels above their own cuts.
          const zone = [0, 1, 2].find((i) => path.id.endsWith(`-zone-${'ABC'[i]}-label`));
          const bottom = zone === undefined ? CARD_HEADER_MM : cardZone(zone).region.y;
          expect(pt.y).toBeLessThan(bottom);
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
