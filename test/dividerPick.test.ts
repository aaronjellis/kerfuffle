import { expect, it } from 'vitest';
import * as THREE from 'three';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { floorWorldY, interiorToWorld, worldToInterior } from '../src/engine/dividerPick';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { computePrintBoxDims } from '../src/engine/printParts';
import { buildPrintPartWorldGeometry } from '../src/engine/printWorld';

const p = { ...DEFAULT_BOX_PARAMETERS, category: '3d-print' as const, templateId: '3d-snap-box' as const };
const d = computePrintBoxDims(p, 110, 80, 55);

it('puts the floor on top of the base plate', () => {
  expect(floorWorldY(d)).toBeCloseTo(-(d.baseH + d.lidH) / 2 + d.floor);
});
it('maps the front-left inner corner to the interior origin', () => {
  expect(worldToInterior(d, { x: -55, z: 40 })).toEqual({ x: 0, y: 0 });
  expect(worldToInterior(d, { x: 55, z: -40 })).toEqual({ x: 110, y: 80 });
});
it('round-trips', () => {
  expect(worldToInterior(d, interiorToWorld(d, { x: 30, y: 12 }))).toEqual({ x: 30, y: 12 });
});
it('agrees with the print-to-world transform', () => {
  const model = generateBoxModel({
    ...p,
    printDividersBasis: { w: 110, d: 80 },
    // `v` runs between two dividers, so neither end reaches into a wall.
    printDividers: [
      { id: 'h', axis: 'x', pos: 20, from: 0, to: 110 },
      { id: 'h2', axis: 'x', pos: 60, from: 0, to: 110 },
      { id: 'v', axis: 'y', pos: 30, from: 20, to: 60 },
    ],
  });
  const { widthMm, depthMm, heightMm } = model.innerDims;
  const dims = computePrintBoxDims(model.params, widthMm, depthMm, heightMm);
  const sx = widthMm / 110;
  const sy = depthMm / 80;
  const piece = buildPrintPartWorldGeometry(model, 'base').find((x) => x.dividerId === 'v')!;
  const box = new THREE.Box3().setFromBufferAttribute(piece.geometry.getAttribute('position') as THREE.BufferAttribute);
  const c = box.getCenter(new THREE.Vector3());
  const w = interiorToWorld(dims, { x: 30 * sx, y: 40 * sy });
  expect(c.x).toBeCloseTo(w.x, 3);
  expect(c.z).toBeCloseTo(w.z, 3);
  expect(box.min.y).toBeCloseTo(floorWorldY(dims), 1);
});
