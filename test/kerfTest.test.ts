import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateKerfTestModel, kerfTestValues } from '../src/engine/kerfTest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { Panel3DTransform, Point2D } from '../src/engine/types';

const params = { ...DEFAULT_BOX_PARAMETERS, materialThicknessMm: 3, kerfMm: 0.12 };

/** A panel's outline in world (x, z), closed. */
const world = (p: Panel3DTransform): Point2D[] =>
  p.outlinePoints!.map((pt) => {
    const v = new THREE.Vector3(pt.x - p.widthMm / 2, -(pt.y - p.heightMm / 2), 0)
      .applyEuler(new THREE.Euler(...p.rotation))
      .add(new THREE.Vector3(...p.closedPos));
    return { x: v.x, y: v.z };
  });

describe('kerf test values', () => {
  it('runs six values 0.04 apart from 0.02 under the material kerf', () => {
    expect(kerfTestValues(0.12, 0)).toEqual([0.1, 0.14, 0.18, 0.22, 0.26, 0.3]);
  });
  it('shifts by 0.12 a step and never goes below zero', () => {
    expect(kerfTestValues(0.12, 1)).toEqual([0.22, 0.26, 0.3, 0.34, 0.38, 0.42]);
    expect(kerfTestValues(0.12, -1)[0]).toBe(0);
  });
});

describe('kerf test model', () => {
  const values = kerfTestValues(0.12, 0);
  const m = generateKerfTestModel(params, values, 2);

  it('cuts two hexagons, each with a value on every side and the thickness in the middle', () => {
    expect(m.panels2D.map((p) => p.id)).toEqual(['kerf-test-a', 'kerf-test-b']);
    for (const p of m.panels2D) {
      expect(p.paths.filter((x) => x.layer === 'cut')).toHaveLength(1);
      expect(p.paths.filter((x) => x.id.includes('-label-'))).toHaveLength(6);
      expect(p.paths.some((x) => x.id.endsWith('-thickness'))).toBe(true);
    }
  });

  it('closed, B sits flush against A at zero kerf: the docked side shares its finger corners', () => {
    const flush = generateKerfTestModel(params, new Array(6).fill(0), 2);
    const [A, B] = flush.panels3D.map(world);
    const shared = B.filter((b) => A.some((a) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6));
    // Four finger transitions on the side, two corners each.
    expect(shared.length).toBeGreaterThanOrEqual(8);
  });

  it('with kerf, the docked side interferes: the tabs are drawn wider than the gaps they fill', () => {
    const [A, B] = m.panels3D.map(world);
    const shared = B.filter((b) => A.some((a) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6));
    expect(shared.length).toBeLessThan(8);
  });

  it('opens by sliding B straight out from the docked side', () => {
    const b = m.panels3D[1];
    const dir = new THREE.Vector3(...b.explodedPos).sub(new THREE.Vector3(...b.closedPos));
    const toB = new THREE.Vector3(...b.closedPos).sub(new THREE.Vector3(...m.panels3D[0].closedPos));
    expect(dir.y).toBeCloseTo(0, 9);
    expect(dir.clone().normalize().dot(toB.clone().normalize())).toBeCloseTo(1, 2);
  });
});
