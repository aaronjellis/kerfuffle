import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { hasPivotLid, pivotLidFrontGapMm, pivotLidGeometry, pivotLidMinDepthMm } from '../src/engine/fingerJointEngine';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters, Panel3DTransform, Point2D } from '../src/engine/types';
import { BOX_TYPES, currentBoxType } from '../src/ui/boxTypes';

const W = 110;
const D = 80;
const H = 55;
const box = (p: Partial<BoxParameters> = {}): BoxParameters => ({
  ...DEFAULT_BOX_PARAMETERS,
  category: 'wood-finger',
  templateId: 'finger-basic',
  woodLidStyle: 'pivot-lid',
  dimensionReference: 'inner',
  widthMm: W,
  depthMm: D,
  heightMm: H,
  materialThicknessMm: 3,
  ...p,
});
const model = (p: Partial<BoxParameters> = {}) => generateBoxModel(box(p));
const p3 = (m: ReturnType<typeof model>, id: string) => m.panels3D.find((p) => p.id === id)!;
/** A panel outline point in the world, the panel closed. */
const world = (p: Panel3DTransform, o: Point2D) =>
  new THREE.Vector3(o.x - p.widthMm / 2, -(o.y - p.heightMm / 2), 0)
    .applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)))
    .add(new THREE.Vector3(...p.closedPos));
const centre = (ring: Point2D[]) => ({ x: ring.reduce((a, p) => a + p.x, 0) / ring.length, y: ring.reduce((a, p) => a + p.y, 0) / ring.length });

describe.each([3, 6])('pivot lid in %i mm wood', (T) => {
  const m = model({ materialThicknessMm: T });
  const g = pivotLidGeometry(T, W);
  const lid = p3(m, 'top');
  const pivot = new THREE.Vector3(...lid.foldRig!.pivotOffset);

  it('has a lid, four walls and a bottom', () =>
    expect(m.panels3D.map((p) => p.id).sort()).toEqual(['back', 'bottom', 'front', 'left', 'right', 'top']));

  it('lies flush with the wall tops, between the walls', () => {
    const top = H / 2 + T;
    for (const id of ['front', 'back']) {
      const ys = p3(m, id).outlinePoints!.map((o) => world(p3(m, id), o).y);
      expect(Math.max(...ys)).toBeCloseTo(top);
    }
    expect(lid.closedPos[1] + T / 2).toBeCloseTo(top);
    // The lid's body keeps inside the side walls' inner faces; only the pins and the tab go further.
    const pts = lid.outlinePoints!.map((o) => world(lid, o));
    const body = pts.filter((v) => Math.abs(v.x) < W / 2 + T - 1e-6);
    expect(body.length).toBe(pts.length - 4);
    for (const v of body) expect(Math.abs(v.x)).toBeLessThan(W / 2);
    // Its back edge stops a hair in front of the back wall; its front edge a hair behind the front wall.
    expect(Math.min(...pts.map((v) => v.z))).toBeCloseTo(-D / 2 + g.backGap);
    expect(g.backGap).toBeGreaterThan(0.2);
    expect(g.backGap).toBeLessThan(1.2);
  });

  it('runs a pin out to each side wall\'s outer face, centred on the pivot', () => {
    const pts = lid.outlinePoints!.map((o) => world(lid, o));
    for (const side of [-1, 1]) {
      const pin = pts.filter((v) => Math.abs(v.x - side * (W / 2 + T)) < 1e-6);
      expect(pin.length).toBe(2);
      expect((pin[0].z + pin[1].z) / 2).toBeCloseTo(pivot.z);
      // Drawn a kerf wide, so it cuts to a square.
      expect(Math.abs(pin[0].z - pin[1].z)).toBeCloseTo(T + m.params.kerfMm);
    }
    expect(pivot.y).toBeCloseTo(lid.closedPos[1]);
  });

  it('puts a hole round each pin, with an ear of sound wood round the hole', () => {
    for (const id of ['left', 'right']) {
      const wall = p3(m, id);
      const hole = wall.holeContours![0];
      const c = world(wall, centre(hole));
      expect(c.y).toBeCloseTo(pivot.y, 3);
      expect(c.z).toBeCloseTo(pivot.z, 3);
      // The square pin turns inside the hole.
      expect(g.holeR).toBeGreaterThan(Math.SQRT1_2 * T);
      // No point of the outline comes nearer the hole than 2 mm.
      const hc = centre(hole);
      const ring = wall.outlinePoints!;
      const toEdge = (a: Point2D, b: Point2D) => {
        const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((hc.x - a.x) * (b.x - a.x) + (hc.y - a.y) * (b.y - a.y)) / l2));
        return Math.hypot(hc.x - (a.x + t * (b.x - a.x)), hc.y - (a.y + t * (b.y - a.y)));
      };
      const nearest = Math.min(...ring.map((o, i) => toEdge(o, ring[(i + 1) % ring.length])));
      expect(nearest - g.holeR).toBeGreaterThanOrEqual(2 - 0.05);
      // As cut, the hole is a kerf wider than drawn: just room for the square pin's corners.
      const drawnR = Math.hypot(hole[0].x - hc.x, hole[0].y - hc.y);
      expect(drawnR + m.params.kerfMm / 2).toBeCloseTo(Math.SQRT1_2 * T + 0.15);
      // The ear stands above the wall's top edge.
      expect(Math.min(...wall.outlinePoints!.map((o) => o.y))).toBeCloseTo(-g.earRiseMm, 2);
    }
  });

  it('matches the walls on the sheet to the walls in 3D', () => {
    for (const id of ['left', 'right']) {
      const p2 = m.panels2D.find((p) => p.id === id)!;
      expect(p2.heightMm).toBeCloseTo(H + 2 * T + g.earRiseMm, 2);
      expect(p2.paths.filter((p) => p.id.endsWith('-pin-hole')).length).toBe(1);
      expect(p2.safeRect.y).toBeCloseTo(T + g.earRiseMm, 2);
    }
  });

  it('drops the lid\'s tab into a notch in the front wall', () => {
    const front = p3(m, 'front');
    const notch = front.outlinePoints!.filter((o) => Math.abs(o.y - T) < 1e-6 && o.x > T + 1 && o.x < W + T - 1);
    const lo = Math.min(...notch.map((o) => o.x));
    const hi = Math.max(...notch.map((o) => o.x));
    // As cut (the tab a kerf narrower, the notch a kerf wider), the floor squeezes the tab by 0.1 mm
    // and the mouth leaves it 0.6 mm of room.
    const kerf = m.params.kerfMm;
    const cutTab = g.tabW - kerf;
    expect(hi - lo + kerf).toBeCloseTo(cutTab - 0.1);
    // The mouth has more room than the lid has side play, so the tab always finds it.
    expect(0.6 / 2).toBeGreaterThanOrEqual(0.25);
    const mouth = front.outlinePoints!.filter((o) => Math.abs(o.y) < 1e-6 && o.x > lo - 1 && o.x < hi + 1).map((o) => o.x);
    expect(Math.max(...mouth) - Math.min(...mouth) + kerf).toBeCloseTo(cutTab + 0.6);
    expect((hi + lo) / 2).toBeCloseTo(T + W / 2);
    const tab = lid.outlinePoints!.map((o) => world(lid, o)).filter((v) => Math.abs(v.z - (D / 2 + T)) < 1e-6);
    expect(tab.length).toBe(2);
    expect(Math.abs(tab[0].x - tab[1].x)).toBeCloseTo(g.tabW);
    // The scoop dips below the notch floor, narrower than the tab so the tab still has a ledge each side.
    expect(Math.max(...front.outlinePoints!.filter((o) => o.x > lo && o.x < hi && o.y < H / 2).map((o) => o.y))).toBeCloseTo(T + g.scoopR);
    expect(g.tabW / 2 - g.scoopR).toBeGreaterThanOrEqual(3);
  });

  it('swings open past upright without touching the back wall', () => {
    expect(g.openAngleRad).toBeGreaterThan(Math.PI / 2);
    expect(g.openAngleRad).toBeLessThan((160 * Math.PI) / 180);
    expect(lid.foldRig!.flatAngleRad).toBeCloseTo(-g.openAngleRad);
    const wallFace = -g.pivotIn; // the back wall's inner face, behind the pivot
    for (let i = 0; i <= 200; i++) {
      const a = (g.openAngleRad * i) / 200;
      // The lid's cross-section, in (z forward, y up) from the pivot: its back edge overhangs behind.
      for (const [z0, y0] of [[-g.overhang, -T / 2], [-g.overhang, T / 2], [D - 2 * T, T / 2]] as const) {
        const z = z0 * Math.cos(a) - y0 * Math.sin(a);
        const y = z0 * Math.sin(a) + y0 * Math.cos(a);
        if (y <= T / 2) expect(z, `angle ${a}`).toBeGreaterThanOrEqual(wallFace - 1e-3);
      }
    }
  });

  it('reports the ears in the outside height', () => {
    expect(m.outerDims).toEqual({ widthMm: W + 2 * T, depthMm: D + 2 * T, heightMm: H + 2 * T + g.earRiseMm });
  });

  it('takes patterns on the lid and every wall', () =>
    expect([...m.patternFaceIds].sort()).toEqual(['back', 'bottom', 'front', 'left', 'right', 'top']));
});

describe('pivot lid across sizes', () => {
  const cases = [
    [3, 80], [3, 20], [6, 80], [6, 25], [6, 20], [9, 80], [9, 40], [9, 30], [12, 60],
  ] as const;
  it.each(cases)('T = %i, %i mm deep: the lid swings clear of the front and back walls', (T, depth) => {
    for (const kerfMm of [0, 0.4]) {
      const m = model({ materialThicknessMm: T, depthMm: depth, kerfMm });
      expect(hasPivotLid(m.params, depth)).toBe(true);
      const g = pivotLidGeometry(T, W);
      const lid = p3(m, 'top');
      const pivotZ = lid.foldRig!.pivotOffset[2];
      const zs = lid.outlinePoints!.map((o) => world(lid, o)).filter((v) => Math.abs(v.x) < W / 2).map((v) => v.z - pivotZ);
      const frontWall = depth - g.pivotIn; // the front wall's inner face, ahead of the pivot
      // The lid's front edge, not the tab that runs on through the wall.
      const front = Math.max(...zs.filter((z) => z < frontWall));
      const back = Math.min(...zs);
      expect(frontWall - front).toBeCloseTo(pivotLidFrontGapMm(T, depth));
      for (let i = 0; i <= 400; i++) {
        const a = (g.openAngleRad * i) / 400;
        for (const [z0, y0] of [[front, -T / 2], [front, T / 2], [back, -T / 2], [back, T / 2]] as const) {
          const z = z0 * Math.cos(a) - y0 * Math.sin(a);
          const y = z0 * Math.sin(a) + y0 * Math.cos(a);
          // Below the wall tops, the lid keeps at least 0.15 mm off both walls' inner faces.
          if (y <= T / 2 + 1e-9) {
            expect(z, `front, angle ${a}`).toBeLessThanOrEqual(frontWall - 0.15);
            expect(z, `back, angle ${a}`).toBeGreaterThanOrEqual(-g.pivotIn + 0.15);
          }
        }
      }
      // The pin, the hole and the ear all sit on the side wall, and the lid's outline is sound.
      for (const id of ['left', 'right']) {
        const wall = p3(m, id);
        const xs = [...wall.holeContours![0], ...wall.outlinePoints!.filter((o) => o.y < 0)].map((o) => o.x);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(T - 1e-6);
        expect(Math.max(...xs)).toBeLessThanOrEqual(T + depth + 1e-6);
      }
      expect(front).toBeGreaterThan(T / 2 + kerfMm / 2);
    }
  });

  it.each([[6, 15], [9, 20], [9, 15], [12, 25]] as const)('T = %i, %i mm deep: too shallow, so it gets a flat lift-off lid', (T, depth) => {
    expect(depth).toBeLessThan(pivotLidMinDepthMm(T));
    const m = model({ materialThicknessMm: T, depthMm: depth });
    expect(hasPivotLid(m.params, depth)).toBe(false);
    const flat = model({ materialThicknessMm: T, depthMm: depth, woodLidStyle: 'flat-lid' });
    expect(m.panels3D.map((p) => [p.id, p.outlinePoints])).toEqual(flat.panels3D.map((p) => [p.id, p.outlinePoints]));
    expect(m.outerDims).toEqual(flat.outerDims);
  });
});

describe('pivot lid patterns', () => {
  const grid = { style: 'grid' as const, cellMm: 8, barMm: 2, paddingMm: 2 };
  const holesOf = (m: ReturnType<typeof model>, id: string) =>
    m.panels2D.find((p) => p.id === id)!.paths.filter((p) => p.id.includes('-pattern-')).map((p) => (p.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number));

  it('keeps a front pattern below the finger scoop', () => {
    const m = model({ facePatterns: { front: grid } });
    const g = pivotLidGeometry(3, W);
    const ys = holesOf(m, 'front').flatMap((n) => n.filter((_, i) => i % 2 === 1));
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(3 + g.scoopR + 2 + 2 - 1e-6);
  });

  it('keeps a side pattern below the pin hole', () => {
    const m = model({ facePatterns: { left: grid } });
    const g = pivotLidGeometry(3, W);
    const ys = holesOf(m, 'left').flatMap((n) => n.filter((_, i) => i % 2 === 1));
    expect(ys.length).toBeGreaterThan(0);
    // Sheet y of the hole's lowest point: the ear rise, then half a thickness, then the radius.
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(g.earRiseMm + 1.5 + g.holeR + 2 + 2 - 1e-6);
    // The 3D wall carries the same holes, in its own frame.
    expect(p3(m, 'left').holeContours!.length).toBe(holesOf(m, 'left').length + 1);
  });
});

describe('pivot lid, the rest', () => {
  it('hits a typed outside size', () => {
    const m = model({ dimensionReference: 'outer', widthMm: 120, depthMm: 90, heightMm: 70 });
    expect(m.outerDims.widthMm).toBeCloseTo(120);
    expect(m.outerDims.depthMm).toBeCloseTo(90);
    expect(m.outerDims.heightMm).toBeCloseTo(70);
  });

  it('keeps the tab inside a narrow box', () => {
    const g = pivotLidGeometry(3, 15);
    expect(g.tabW).toBeLessThanOrEqual(15 - 5);
    expect(g.scoopR).toBeGreaterThanOrEqual(0);
    expect(() => model({ widthMm: 15, depthMm: 15, heightMm: 15 })).not.toThrow();
  });

  it('leaves the other lid styles as they were', () => {
    const flat = model({ woodLidStyle: 'flat-lid' });
    expect(flat.outerDims.heightMm).toBe(H + 6);
    expect(p3(flat, 'left').holeContours ?? []).toEqual([]);
    expect(p3(flat, 'top').foldRig).toBeUndefined();
  });

  it('is in the picker as the pin-hinge box', () => {
    const t = BOX_TYPES.find((b) => b.id === 'finger-pin-hinge')!;
    expect(t.params).toEqual({ woodLidStyle: 'pivot-lid' });
    expect(currentBoxType(box())?.id).toBe('finger-pin-hinge');
  });
});
