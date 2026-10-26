import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { computePrintBoxDims } from '../src/engine/printParts';
const p = { ...DEFAULT_BOX_PARAMETERS, category: '3d-print' as const, templateId: '3d-snap-box' as const };
describe('print box dims', () => {
  it('derives shells, lip, hinge and clasp from the spec values', () => {
    const d = computePrintBoxDims(p, 110, 80, 55);
    expect(d.outerW).toBeCloseTo(110 + 2 * p.wallThickness3dMm);
    expect(d.lip.thickness).toBeCloseTo(Math.max(1, p.wallThickness3dMm / 2));
    expect(d.hinge!.hole).toBeCloseTo(1.75 + 0.25);
    expect(d.hinge!.R).toBeCloseTo(1.0 + p.wallThickness3dMm);
    expect(d.hinge!.segments.length % 2).toBe(1);
    expect(d.hinge!.segments.filter((s) => s.owner === 'base').length).toBe(d.hinge!.segments.filter((s) => s.owner === 'lid').length + 1);
    for (let i = 1; i < d.hinge!.segments.length; i++) expect(d.hinge!.segments[i].x0 - d.hinge!.segments[i - 1].x1).toBeCloseTo(0.3, 3);
    expect(d.clasp!.width).toBeCloseTo(Math.min(18, Math.max(10, d.outerW * 0.25)));
  });
  it('keeps the lip inside a short base', () => {
    const d = computePrintBoxDims({ ...p, lidHeightMm: 100 }, 60, 60, 20);
    expect(d.baseH - d.floor).toBeGreaterThanOrEqual(d.lip.height + 2);
  });
  it('falls back to two knuckles on a tiny box', () => {
    const d = computePrintBoxDims(p, 30, 30, 20);
    expect(d.hinge!.segments.length).toBe(2);
  });
  it('keeps the knuckle wall at two perimeters with a fat pin and thin wall', () => {
    const d = computePrintBoxDims({ ...p, hingePinDiameterMm: 3, wallThickness3dMm: 1.2 }, 60, 60, 40);
    expect(d.hinge!.R).toBeGreaterThanOrEqual(2.6);
  });
  it('floors the knuckle radius at 2.6 with the default pin and a thin wall', () => {
    const d = computePrintBoxDims({ ...p, hingePinDiameterMm: 1.75, wallThickness3dMm: 1.2 }, 60, 60, 40);
    expect(d.hinge!.R).toBe(2.6);
  });
  it('keeps the clasp between the corner fillets and drops it when it cannot fit', () => {
    const small = computePrintBoxDims({ ...p, outerFilletMm: 4 }, 15, 15, 20);
    expect(small.outerW).toBeCloseTo(19.8);
    expect(small.clasp!.width).toBeLessThanOrEqual(19.8 - 12 + 1e-9);
    expect(small.clasp!.width).toBeCloseTo(7.8);
    const none = computePrintBoxDims({ ...p, outerFilletMm: 6 }, 15, 15, 20);
    expect(none.clasp).toBeNull();
  });
  it('nulls features that are switched off', () => {
    const d = computePrintBoxDims({ ...p, include3dHinge: false, includeSnapClasp: false }, 60, 60, 40);
    expect(d.hinge).toBeNull(); expect(d.clasp).toBeNull();
  });

  // Added coverage for the rulings and exact numbers.
  it('puts the hinge axis behind the back face (y = outerD) and gives the base the even knuckles', () => {
    const d = computePrintBoxDims(p, 110, 80, 55);
    const h = d.hinge!;
    expect(h.axisY).toBeCloseTo(d.outerD + h.R);
    expect(h.segments.map((s) => s.owner)).toEqual(['base', 'lid', 'base', 'lid', 'base']);
    // The run is centred on the box and is symmetric under x -> outerW - x.
    const first = h.segments[0];
    const last = h.segments[h.segments.length - 1];
    expect(first.x0 + last.x1).toBeCloseTo(d.outerW);
    expect(h.runLen).toBeCloseTo(Math.min(d.outerW - 2 * (d.rOut + 2), 0.6 * d.outerW));
    expect(last.x1 - first.x0).toBeCloseTo(h.runLen, 3);
  });
  it('gives the base index 0 and the lid index 1 for two knuckles', () => {
    const d = computePrintBoxDims(p, 30, 30, 20);
    expect(d.hinge!.segments.map((s) => s.owner)).toEqual(['base', 'lid']);
  });
  it('uses the single lid clamp: base and lid add up to the box height', () => {
    const d = computePrintBoxDims(p, 110, 80, 55);
    // lidHeightMm 18 -> lid interior 18, lid bed-to-rim 18 + floor, base interior 55 - 18.
    expect(d.lidH).toBeCloseTo(18 + d.floor);
    expect(d.baseH).toBeCloseTo(55 - 18 + d.floor);
    expect(d.baseH + d.lidH).toBeCloseTo(55 + 2 * d.floor);
    const tall = computePrintBoxDims({ ...p, lidHeightMm: 100 }, 60, 60, 40);
    expect(tall.lidH).toBeCloseTo(40 - 8 + tall.floor);
    const small = computePrintBoxDims({ ...p, lidHeightMm: 2 }, 60, 60, 40);
    expect(small.lidH).toBeCloseTo(10 + small.floor);
  });
  it('sets the clasp constants and ridge position', () => {
    const c = computePrintBoxDims(p, 110, 80, 55).clasp!;
    expect(c).toMatchObject({ tongueT: 1.6, hang: 8, hookProud: 0.8, standoff: 1.0, ridgeH: 1.5 });
    expect(c.ridgeTop).toBeCloseTo(8 - 0.8 - 1.5 - 0.1);
  });
});
