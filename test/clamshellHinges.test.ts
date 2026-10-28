import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters, Panel3DTransform, Point2D } from '../src/engine/types';

const W = 110;
const D = 80;
const H = 55;
const HINGES: BoxParameters['clamshellHingeType'][] = ['butt-hardware', 'printed-hinge', 'side-pivot', 'knuckle-pin'];

const clamshell = (hinge: BoxParameters['clamshellHingeType'], T: number) =>
  generateBoxModel({
    ...DEFAULT_BOX_PARAMETERS,
    category: 'wood-finger',
    templateId: 'finger-clamshell',
    clamshellHingeType: hinge,
    widthMm: W,
    depthMm: D,
    heightMm: H,
    materialThicknessMm: T,
    hingePinDiameterMm: hinge === 'printed-hinge' ? 1.75 : 2,
    dimensionReference: 'inner',
  });

/** A point in a panel's outline frame (and through-thickness offset), in world space, closed. */
const toWorld = (p: Panel3DTransform, q: Point2D, dz = 0) =>
  new THREE.Vector3(q.x - p.widthMm / 2, -(q.y - p.heightMm / 2), dz)
    .applyEuler(new THREE.Euler(...p.rotation))
    .add(new THREE.Vector3(...p.closedPos));

const outline = (p: Panel3DTransform): Point2D[] =>
  p.outlinePoints ?? [
    { x: 0, y: 0 },
    { x: p.widthMm, y: 0 },
    { x: p.widthMm, y: p.heightMm },
    { x: 0, y: p.heightMm },
  ];

const centroid = (pts: Point2D[]) => ({ x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length });

describe('clamshell hinges', () => {
  for (const hinge of HINGES) {
    for (const T of [3, 6]) {
      describe(`${hinge}, T=${T}`, () => {
        const m = clamshell(hinge, T);
        const lidParts = m.panels3D.filter((p) => p.foldRig);
        // The base's walls and floor; the hinge's own base-side parts sit outside them by design.
        const baseIds = ['bottom', 'base-front', 'base-back', 'base-left', 'base-right'];
        const baseBoxes = m.panels3D
          .filter((p) => baseIds.includes(p.id))
          .map((p) => {
            const box = new THREE.Box3();
            for (const q of outline(p)) for (const dz of [-p.thicknessMm / 2, p.thicknessMm / 2]) box.expandByPoint(toWorld(p, q, dz));
            return { id: p.id, box };
          });

        it('turns every lid part about one line, at or behind the back face', () => {
          const pivots = new Set(lidParts.map((p) => p.foldRig!.pivotOffset.join(',')));
          expect(pivots.size).toBe(1);
          const [, , z] = lidParts[0].foldRig!.pivotOffset;
          if (hinge !== 'side-pivot') expect(z).toBeLessThanOrEqual(-(D / 2 + T) + 1e-9);
        });

        it('opens to its full angle without any lid point passing into the base', () => {
          const rig = lidParts[0].foldRig!;
          const pivot = new THREE.Vector3(...rig.pivotOffset);
          const axis = new THREE.Vector3(1, 0, 0);
          const tol = 1e-3;
          for (let i = 1; i <= 30; i++) {
            const angle = (rig.flatAngleRad * i) / 30;
            for (const p of lidParts) {
              for (const q of outline(p)) {
                for (const dz of [-p.thicknessMm / 2, 0, p.thicknessMm / 2]) {
                  const v = toWorld(p, q, dz).sub(pivot).applyAxisAngle(axis, angle).add(pivot);
                  for (const { id, box } of baseBoxes) {
                    const inside =
                      v.x > box.min.x + tol && v.x < box.max.x - tol &&
                      v.y > box.min.y + tol && v.y < box.max.y - tol &&
                      v.z > box.min.z + tol && v.z < box.max.z - tol;
                    expect(inside, `${p.id} enters ${id} at ${((angle * 180) / Math.PI).toFixed(0)}°`).toBe(false);
                  }
                }
              }
            }
          }
        });
      });
    }
  }

  it('printed hinge: both leaves and every knuckle segment sit on the turning line, on the back face', () => {
    const T = 3;
    const m = clamshell('printed-hinge', T);
    const at = (id: string) => m.panels3D.find((p) => p.id === id)!;
    const [, py, pz] = at('top').foldRig!.pivotOffset;
    for (const j of [1, 2, 3]) {
      const k = at(`printed-hinge-1-knuckle-${j}`);
      expect(k.closedPos[1]).toBeCloseTo(py, 9);
      expect(k.closedPos[2]).toBeCloseTo(pz, 9);
    }
    for (const leaf of ['base', 'lid']) {
      const l = at(`printed-hinge-1-${leaf}`);
      expect(l.closedPos[2] + l.thicknessMm / 2).toBeCloseTo(-(D / 2 + T), 9);
    }
  });

  it('side pivot: the cheek plate’s hole and the base side wall’s hole meet on the turning line', () => {
    const T = 3;
    const m = clamshell('side-pivot', T);
    const at = (id: string) => m.panels3D.find((p) => p.id === id)!;
    const pivot = new THREE.Vector3(...at('top').foldRig!.pivotOffset);
    for (const side of ['left', 'right']) {
      const plate = at(`lid-pivot-${side}`);
      const plateHole = toWorld(plate, centroid(plate.holeContours![0]));
      const wall = at(`base-${side}`);
      const wallHole = toWorld(wall, centroid(wall.holeContours![0]));
      for (const v of [plateHole, wallHole]) {
        expect(v.y).toBeCloseTo(pivot.y, 6);
        expect(v.z).toBeCloseTo(pivot.z, 6);
      }
      // The plate sits against the base side wall's outer face.
      expect(Math.abs(plate.closedPos[0]) - plate.thicknessMm / 2).toBeCloseTo(W / 2 + T, 9);
    }
  });

  it('knuckle plates: every pin hole on the turning line, base and lid plates alternating, one slot each', () => {
    const T = 3;
    const m = clamshell('knuckle-pin', T);
    const pivot = new THREE.Vector3(...m.panels3D.find((p) => p.id === 'top')!.foldRig!.pivotOffset);
    const plates = m.panels3D.filter((p) => p.id.startsWith('hinge-knuckle-'));
    expect(plates).toHaveLength(10);
    for (const p of plates) {
      const hole = toWorld(p, centroid(p.holeContours![0]));
      expect(hole.y).toBeCloseTo(pivot.y, 6);
      expect(hole.z).toBeCloseTo(pivot.z, 6);
      const j = Number(p.id.split('-').pop());
      expect(Boolean(p.foldRig)).toBe(j % 2 === 0);
    }
    const sheet = (id: string) => m.panels2D.find((p) => p.id === id)!.paths.filter((x) => x.id.includes('knuckle-slot'));
    expect(sheet('base-back')).toHaveLength(6);
    expect(sheet('lid-back')).toHaveLength(4);
    expect(m.panels2D.filter((p) => p.id.startsWith('hinge-knuckle-'))).toHaveLength(10);
  });
});
