import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import * as THREE from 'three';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { export3DPrintBoxStl, export3DPrintBoxStlParts } from '../src/engine/exporters';
import { buildClaspPieces, buildHingePieces, buildShellPieces, computePrintBoxDims, type PrintPiece } from '../src/engine/printParts';
import { hingeHoleLayout } from '../src/engine/fingerJointEngine';
import { buildPrintedHingeLeaves, buildPrintedHingePins, exportPrintedHingeStl, printedHingeStl } from '../src/engine/printedHinge';
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
    // 30 mm tall so the base clears the clasp's height rule (baseH >= 10.5).
    const small = computePrintBoxDims({ ...p, outerFilletMm: 4 }, 15, 15, 30);
    expect(small.outerW).toBeCloseTo(19.8);
    expect(small.clasp!.width).toBeLessThanOrEqual(19.8 - 12 + 1e-9);
    expect(small.clasp!.width).toBeCloseTo(7.8);
    const none = computePrintBoxDims({ ...p, outerFilletMm: 6 }, 15, 15, 30);
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
    // R + 0.3: each knuckle clears the other part's back-wall edge by 0.3 mm radially.
    expect(h.axisY).toBeCloseTo(d.outerD + h.R + 0.3);
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
    // A tall lid clamps to innerH - 8, then yields to the clasp: the base must reach 10.5 mm.
    const tall = computePrintBoxDims({ ...p, lidHeightMm: 100 }, 60, 60, 40);
    expect(tall.lidH).toBeCloseTo(40 + tall.floor - 10.5 + tall.floor);
    expect(tall.baseH).toBeCloseTo(10.5);
    expect(tall.clasp).not.toBeNull();
    const tallNoClasp = computePrintBoxDims({ ...p, lidHeightMm: 100, includeSnapClasp: false }, 60, 60, 40);
    expect(tallNoClasp.lidH).toBeCloseTo(40 - 8 + tallNoClasp.floor);
    const small = computePrintBoxDims({ ...p, lidHeightMm: 2 }, 60, 60, 40);
    expect(small.lidH).toBeCloseTo(10 + small.floor);
  });
  it('caps the lid so the clasp fits, and reports why a feature was dropped', () => {
    // 30 x 30 x 20: the 12 mm lid would leave a 10 mm base; it yields to 11.5 so the base is 10.5.
    const t = computePrintBoxDims(p, 30, 30, 20);
    expect(t.clasp).not.toBeNull();
    expect(t.baseH).toBeCloseTo(10.5, 6);
    expect(t.lidH - t.floor).toBeCloseTo(11.5, 6);
    expect(t.lidH - t.floor).toBeGreaterThanOrEqual(10);
    expect(t.baseH + t.lidH).toBeCloseTo(20 + 2 * t.floor, 6);
    expect(t.dropped).toEqual([]);
    // Every box 18.5 to 30 mm tall keeps its clasp with the default floor.
    for (let h = 18.5; h <= 30; h += 0.5) {
      const b = computePrintBoxDims(p, 30, 30, h);
      expect(b.clasp).not.toBeNull();
      expect(b.baseH).toBeGreaterThanOrEqual(10.5 - 1e-9);
    }
    // Under 18.5 mm the lid would have to drop below its 10 mm minimum (it is already innerH - 8).
    const tooShort = computePrintBoxDims(p, 30, 30, 18);
    expect(tooShort.clasp).toBeNull();
    expect(tooShort.dropped).toEqual(['clasp-height']);
    // A narrow, round box has no flat front wide enough.
    expect(computePrintBoxDims({ ...p, outerFilletMm: 6 }, 15, 15, 30).dropped).toContain('clasp-width');
    // wall 8 -> R 9: no lid height keeps both parts 2R + 1.3 tall.
    const thick = computePrintBoxDims({ ...p, wallThickness3dMm: 8 }, 30, 30, 20);
    expect(thick.hinge).toBeNull();
    expect(thick.dropped).toContain('hinge-height');
    expect(computePrintBoxDims(p, 110, 80, 55).dropped).toEqual([]);
    // Switched-off features are not "dropped".
    expect(computePrintBoxDims({ ...p, include3dHinge: false, includeSnapClasp: false }, 15, 15, 15).dropped).toEqual([]);
  });

  it('sets the clasp constants and ridge position', () => {
    const c = computePrintBoxDims(p, 110, 80, 55).clasp!;
    expect(c).toMatchObject({ tongueT: 1.6, hang: 8, hookProud: 0.8, standoff: 1.0, ridgeH: 1.5 });
    expect(c.ridgeTop).toBeCloseTo(8 - 0.8 - 1.5 - 0.3);
  });
});

function bbox(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox!;
}
function unionBox(pieces: PrintPiece[]): THREE.Box3 {
  const b = new THREE.Box3();
  for (const piece of pieces) b.union(bbox(piece.geometry));
  return b;
}

/** Signed volume of a closed non-indexed triangle soup; positive when faces point outward. */
function signedVolume(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    vol += a.dot(b.clone().cross(c)) / 6;
  }
  return vol;
}

const RAY_DIRS = [
  [1, 0.3713, 0.1931],
  [0.2137, 1, 0.4411],
  [0.3313, 0.1771, 1],
].map((v) => new THREE.Vector3(...v).normalize());

/** Ray-parity point-in-mesh test on a closed triangle soup, voting over three skew rays. */
function insideMesh(g: THREE.BufferGeometry, p: THREE.Vector3): boolean {
  const b = bbox(g);
  if (!b.containsPoint(p)) return false;
  const pos = g.getAttribute('position');
  const a = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let votes = 0;
  for (const dir of RAY_DIRS) {
    const ray = new THREE.Ray(p, dir);
    let n = 0;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); c.fromBufferAttribute(pos, i + 1); d.fromBufferAttribute(pos, i + 2);
      if (ray.intersectTriangle(a, c, d, false, hit)) n++;
    }
    if (n % 2 === 1) votes++;
  }
  return votes >= 2;
}

describe('shell and lip pieces', () => {
  const d = computePrintBoxDims(p, 110, 80, 55);

  it('spans the footprint and bed-to-rim height for the base shell', () => {
    const shell = buildShellPieces(d, 'base', p.outerChamferMm).filter((x) => x.partId === 'shell');
    expect(shell.length).toBeGreaterThan(0);
    const b = unionBox(shell);
    expect(b.min.x).toBeCloseTo(0, 3);
    expect(b.max.x).toBeCloseTo(d.outerW, 3);
    expect(b.min.y).toBeCloseTo(0, 3);
    expect(b.max.y).toBeCloseTo(d.outerD, 3);
    expect(b.min.z).toBeCloseTo(0, 3);
    expect(b.max.z).toBeCloseTo(d.baseH, 3);
  });

  it('spans bed to lidH for the lid shell and has no lip', () => {
    const pieces = buildShellPieces(d, 'lid', p.outerChamferMm);
    expect(pieces.every((x) => x.partId === 'shell')).toBe(true);
    const b = unionBox(pieces);
    expect(b.min.z).toBeCloseTo(0, 3);
    expect(b.max.z).toBeCloseTo(d.lidH, 3);
    expect(b.max.x).toBeCloseTo(d.outerW, 3);
    expect(b.max.y).toBeCloseTo(d.outerD, 3);
  });

  it('keeps the plate on the bed with no chamfer too', () => {
    const b = unionBox(buildShellPieces(d, 'base', 0).filter((x) => x.partId === 'shell'));
    expect(b.min.z).toBeCloseTo(0, 3);
    expect(b.max.z).toBeCloseTo(d.baseH, 3);
    expect(b.max.x).toBeCloseTo(d.outerW, 3);
  });

  it('chamfers the plate bottom edge without growing the footprint', () => {
    const plate = buildShellPieces(d, 'base', 1.2)[0].geometry;
    const pos = plate.getAttribute('position');
    let minX = Infinity;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < 1e-6) minX = Math.min(minX, pos.getX(i));
    // The bed face is pulled in by the bevel size; the plate widens above it.
    expect(minX).toBeGreaterThan(0.1);
    expect(bbox(plate).min.x).toBeCloseTo(0, 3);
  });

  it('adds the lip for the base only, anchored into the wall', () => {
    const base = buildShellPieces(d, 'base', p.outerChamferMm);
    const lips = base.filter((x) => x.partId === 'lip');
    // The 45 degree staircase (ceil(1.4 / 0.25) = 6 rings), then the anchor ring and the visible ring.
    expect(lips).toHaveLength(6 + 2);
    expect(buildShellPieces(d, 'lid', p.outerChamferMm).some((x) => x.partId === 'lip')).toBe(false);
    const [anchor, visible] = lips.slice(-2).map((x) => bbox(x.geometry));
    // Anchor ring reaches the wall's mid-thickness line, so the lip is joined to the base.
    expect(anchor.min.x).toBeCloseTo(d.wall / 2, 5);
    expect(anchor.max.x).toBeCloseTo(d.outerW - d.wall / 2, 5);
    expect(anchor.min.z).toBeCloseTo(d.baseH - 2, 5);
    expect(anchor.max.z).toBeCloseTo(d.baseH, 5);
    // Visible ring: inset 0.2 from the inner wall, centred, 3 above the rim.
    expect(visible.min.x).toBeCloseTo(d.wall + 0.2, 5);
    expect(visible.max.z).toBeCloseTo(d.baseH + 3, 5);
    expect(visible.min.z).toBeLessThanOrEqual(d.baseH);
    expect(visible.max.x - visible.min.x).toBeCloseTo(d.innerW - 0.4, 3);
    expect(visible.max.y - visible.min.y).toBeCloseTo(d.innerD - 0.4, 3);
    expect((visible.min.x + visible.max.x) / 2).toBeCloseTo(d.outerW / 2, 3);
    expect((visible.min.y + visible.max.y) / 2).toBeCloseTo(d.outerD / 2, 3);
    const all = unionBox(lips);
    expect(all.min.z).toBeCloseTo(d.baseH - 2 - (d.lip.clearance + d.lip.thickness), 5);
    expect(all.max.z).toBeCloseTo(d.baseH + 3, 5);
  });

  /** X of a ring's inner boundary on the left side: its +/-x-facing side faces nearest the middle. */
  function innerLeftX(g: THREE.BufferGeometry, outerW: number): number {
    const pos = g.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let best = -Infinity;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const cx = (a.x + b.x + c.x) / 3;
      if (Math.abs(n.x) > 0.9999 && cx < outerW / 2) best = Math.max(best, cx);
    }
    return best;
  }

  it('carries the lip anchor on a 45 degree staircase from the inner wall face', () => {
    for (const box of [
      d,
      computePrintBoxDims({ ...p, wallThickness3dMm: 6 }, 80, 80, 40),
      computePrintBoxDims({ ...p, wallThickness3dMm: 1.2 }, 60, 60, 120),
      computePrintBoxDims({ ...p, innerFilletMm: 0.5 }, 110, 80, 55),
    ]) {
      const ledge = box.lip.clearance + box.lip.thickness;
      const anchorZ = box.baseH - 2;
      // The supporting rings: every lip piece except the visible ring (the last), bottom to top.
      const rings = buildShellPieces(box, 'base', p.outerChamferMm)
        .filter((x) => x.partId === 'lip')
        .slice(0, -1)
        .map((x) => ({ b: bbox(x.geometry), innerX: innerLeftX(x.geometry, box.outerW) }))
        .sort((u, v) => u.b.min.z - v.b.min.z);
      expect(rings.length).toBe(Math.ceil(ledge / 0.25 - 1e-6) + 1);
      for (const r of rings) expect(r.b.min.z).toBeGreaterThanOrEqual(anchorZ - ledge - 0.01);
      expect(rings[0].b.min.z).toBeCloseTo(anchorZ - ledge, 5);
      // The first step is one step in from the inner wall face; the last stair and the anchor ring
      // reach the lip's inner boundary.
      expect(rings[0].innerX - box.wall).toBeCloseTo(0.25, 4);
      expect(rings[rings.length - 1].innerX - box.wall).toBeCloseTo(ledge, 4);
      expect(rings[rings.length - 2].innerX - box.wall).toBeCloseTo(ledge, 4);
      for (let i = 1; i < rings.length; i++) {
        const step = rings[i].innerX - rings[i - 1].innerX;
        // Monotonic inward, and no step overhangs more than the ring below it is tall (45 degrees).
        expect(step).toBeGreaterThanOrEqual(-1e-6);
        const below = rings[i - 1].b.max.z - rings[i - 1].b.min.z;
        expect(step).toBeLessThanOrEqual(below + 1e-4);
        // Each ring overlaps the next: no gap between them.
        expect(rings[i].b.min.z).toBeLessThan(rings[i - 1].b.max.z);
      }
      // The first step's own overhang off the wall face is no wider than it is tall.
      expect(rings[0].innerX - box.wall).toBeLessThanOrEqual(rings[0].b.max.z - rings[0].b.min.z + 1e-4);
    }
  });

  it('overlaps plate and ring and keeps the plate depth positive', () => {
    for (const chamfer of [0, 1.2, 50]) {
      const [plate, ring] = buildShellPieces(d, 'lid', chamfer);
      expect(bbox(ring.geometry).min.z).toBeLessThan(d.floor);
      expect(bbox(plate.geometry).max.z).toBeGreaterThanOrEqual(d.floor - 1e-6);
      expect(bbox(plate.geometry).min.z).toBeCloseTo(0, 6);
    }
  });

  it('emits non-indexed triangle geometry with a position attribute', () => {
    for (const part of ['base', 'lid'] as const) {
      for (const piece of buildShellPieces(d, part, p.outerChamferMm)) {
        const pos = piece.geometry.getAttribute('position');
        expect(pos).toBeDefined();
        expect(piece.geometry.index).toBeNull();
        expect(pos.count % 3).toBe(0);
        expect(pos.count).toBeGreaterThan(0);
      }
    }
  });
});

describe('knuckle hinge pieces', () => {
  const d = computePrintBoxDims(p, 110, 80, 55);
  const h = d.hinge!;
  const rimOf = (part: 'base' | 'lid') => (part === 'base' ? d.baseH : d.lidH);
  /** Annuli rise above the rim; prisms stop at it. */
  const isAnnulus = (piece: PrintPiece, rim: number) => bbox(piece.geometry).max.z > rim + 0.1;
  /** X ranges of a part's knuckles in world x (the lid's are un-mirrored). */
  function worldRanges(dims: typeof d, part: 'base' | 'lid'): [number, number][] {
    const rim = part === 'base' ? dims.baseH : dims.lidH;
    return buildHingePieces(dims, part)
      .filter((x) => isAnnulus(x, rim))
      .map((x) => {
        const b = bbox(x.geometry);
        return part === 'base' ? [b.min.x, b.max.x] : [dims.outerW - b.max.x, dims.outerW - b.min.x];
      });
  }

  it('builds base knuckles behind the back face, filled into the wall at 45 degrees', () => {
    const pieces = buildHingePieces(d, 'base');
    expect(pieces.length).toBeGreaterThan(0);
    expect(pieces.every((x) => x.partId === 'hinge')).toBe(true);
    const rim = d.baseH;
    const b = unionBox(pieces);
    expect(b.min.y).toBeCloseTo(d.outerD - d.wall / 2, 5);
    expect(b.max.y).toBeCloseTo(d.outerD + 0.3 + 2 * h.R, 5);
    expect(b.max.z).toBeCloseTo(rim + h.R, 5);
    expect(b.min.z).toBeCloseTo(rim - 2 * h.R - 0.3, 5);
  });

  it('pairs each annulus with a prism over the same X range', () => {
    for (const part of ['base', 'lid'] as const) {
      const pieces = buildHingePieces(d, part);
      const owned = h.segments.filter((s) => s.owner === part).length;
      expect(pieces).toHaveLength(2 * owned);
      const annuli = pieces.filter((x) => isAnnulus(x, rimOf(part)));
      const prisms = pieces.filter((x) => !isAnnulus(x, rimOf(part)));
      expect(annuli).toHaveLength(owned);
      const key = (x: PrintPiece) => bbox(x.geometry).min.x.toFixed(4) + ':' + bbox(x.geometry).max.x.toFixed(4);
      expect(prisms.map(key).sort()).toEqual(annuli.map(key).sort());
    }
  });

  it('interleaves base and lid knuckles in world x with 0.3 gaps, covering the segment list', () => {
    const all = [...worldRanges(d, 'base'), ...worldRanges(d, 'lid')].sort((a, b) => a[0] - b[0]);
    expect(all).toHaveLength(h.segments.length);
    all.forEach(([a, b], i) => {
      expect(a).toBeCloseTo(h.segments[i].x0, 5);
      expect(b).toBeCloseTo(h.segments[i].x1, 5);
      if (i > 0) expect(a - all[i - 1][1]).toBeCloseTo(0.3, 5);
    });
    const base = worldRanges(d, 'base');
    const lid = worldRanges(d, 'lid');
    for (const [a0, a1] of base) for (const [b0, b1] of lid) expect(a1 <= b0 || b1 <= a0).toBe(true);
  });

  it('leaves a pin hole through every annulus', () => {
    for (const part of ['base', 'lid'] as const) {
      const rim = rimOf(part);
      for (const piece of buildHingePieces(d, part).filter((x) => isAnnulus(x, rim))) {
        const pos = piece.geometry.getAttribute('position');
        let minR = Infinity;
        for (let i = 0; i < pos.count; i++) {
          minR = Math.min(minR, Math.hypot(pos.getY(i) - h.axisY, pos.getZ(i) - rim));
        }
        expect(minR).toBeGreaterThan(h.hole / 2 - 0.01);
        // A solid 24-gon has vertices only at R; the inscribed bore puts them exactly at hole/2.
        expect(minR).toBeCloseTo(h.hole / 2, 2);
      }
    }
  });

  it('keeps the whole pin bore open: no hinge piece fills it', () => {
    const boxes = [
      d,
      computePrintBoxDims({ ...p, hingePinDiameterMm: 3, wallThickness3dMm: 6 }, 80, 80, 40),
      computePrintBoxDims(p, 30, 30, 20),
    ];
    for (const box of boxes) {
      const hg = box.hinge!;
      expect(hg).not.toBeNull();
      for (const part of ['base', 'lid'] as const) {
        const rim = part === 'base' ? box.baseH : box.lidH;
        const pieces = buildHingePieces(box, part);
        const seg = hg.segments.find((s) => s.owner === part)!;
        const [x0, x1] = part === 'base' ? [seg.x0, seg.x1] : [box.outerW - seg.x1, box.outerW - seg.x0];
        for (const t of [0.2, 0.5, 0.8]) {
          const x = x0 + t * (x1 - x0);
          // Control: a point in the knuckle's wall is inside a hinge piece.
          const wallR = (hg.hole / 2 + hg.R) / 2;
          const solid = new THREE.Vector3(x, hg.axisY, rim - wallR);
          expect(pieces.some((q) => insideMesh(q.geometry, solid))).toBe(true);
          for (let k = 0; k < 24; k++) {
            const a = ((k + 0.5) / 24) * 2 * Math.PI;
            const r = 0.6 * (hg.hole / 2);
            const q = new THREE.Vector3(x, hg.axisY + r * Math.cos(a), rim + r * Math.sin(a));
            expect(pieces.some((piece) => insideMesh(piece.geometry, q))).toBe(false);
          }
        }
      }
    }
  });

  it('emits non-indexed triangle geometry', () => {
    for (const part of ['base', 'lid'] as const) {
      for (const piece of buildHingePieces(d, part)) {
        expect(piece.geometry.index).toBeNull();
        expect(piece.geometry.getAttribute('position').count % 3).toBe(0);
      }
    }
  });

  it('gives a tiny box one knuckle each, the lid mirrored in its print frame', () => {
    const t = computePrintBoxDims(p, 30, 30, 20);
    expect(buildHingePieces(t, 'base')).toHaveLength(2);
    expect(buildHingePieces(t, 'lid')).toHaveLength(2);
    const [s0, s1] = t.hinge!.segments;
    const [base] = worldRanges(t, 'base');
    const [lid] = worldRanges(t, 'lid');
    expect(base[0]).toBeCloseTo(s0.x0, 5);
    expect(base[1]).toBeCloseTo(s0.x1, 5);
    expect(lid[0]).toBeCloseTo(s1.x0, 5);
    expect(lid[1]).toBeCloseTo(s1.x1, 5);
  });

  it('keeps faces pointing outward after the axis swap (positive signed volume)', () => {
    for (const part of ['base', 'lid'] as const) {
      for (const piece of buildHingePieces(d, part)) {
        expect(signedVolume(piece.geometry)).toBeGreaterThan(0);
      }
    }
  });

  it('drops the hinge when the lid cannot be raised to 2R + 1.3', () => {
    // wall 8 -> R 9, lid needs 19.3; a 20 mm interior cannot keep the base's 5 mm.
    const t = computePrintBoxDims({ ...p, wallThickness3dMm: 8 }, 30, 30, 20);
    expect(t.hinge).toBeNull();
    expect(buildHingePieces(t, 'lid')).toEqual([]);
  });

  it('raises the lid so its knuckle fill stays above the bed', () => {
    // wall 6 -> R 7, lid needs 2R + 0.3 + 1 = 15.3; lidHeightMm 10 gives only 12.
    const t = computePrintBoxDims({ ...p, wallThickness3dMm: 6, lidHeightMm: 10 }, 60, 60, 40);
    expect(t.hinge).not.toBeNull();
    expect(t.lidH).toBeCloseTo(2 * t.hinge!.R + 1.3, 6);
    expect(t.baseH + t.lidH).toBeCloseTo(40 + 2 * t.floor, 6);
    expect(t.baseH - t.floor).toBeGreaterThanOrEqual(5);
    expect(unionBox(buildHingePieces(t, 'lid')).min.z).toBeGreaterThanOrEqual(-1e-9);
  });

  it('caps a tall lid so the base knuckle fill stays above the bed', () => {
    // wall 4 -> R 5, both parts need 11.3; lidHeightMm 100 would leave the base only 10.
    const t = computePrintBoxDims({ ...p, wallThickness3dMm: 4, lidHeightMm: 100 }, 30, 30, 30);
    if (t.hinge) {
      expect(t.baseH).toBeGreaterThanOrEqual(2 * t.hinge.R + 1.3 - 1e-9);
      expect(t.lidH).toBeGreaterThanOrEqual(2 * t.hinge.R + 1.3 - 1e-9);
      expect(t.baseH + t.lidH).toBeCloseTo(30 + 2 * t.floor, 6);
    }
    for (const part of ['base', 'lid'] as const) {
      for (const piece of buildHingePieces(t, part)) {
        expect(bbox(piece.geometry).min.z).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('returns no pieces when the hinge is off', () => {
    const off = computePrintBoxDims({ ...p, include3dHinge: false }, 60, 60, 40);
    expect(buildHingePieces(off, 'base')).toEqual([]);
    expect(buildHingePieces(off, 'lid')).toEqual([]);
  });
});

describe('snap clasp pieces', () => {
  const d = computePrintBoxDims(p, 110, 80, 55);
  const c = d.clasp!;
  // Positions are float32, so coordinates near 100 mm carry ~1e-5 of rounding.

  it('builds the lid tongue rising above the rim with a thumb lip, standing off the front face', () => {
    const lid = buildClaspPieces(d, 'lid');
    expect(lid.length).toBeGreaterThan(0);
    for (const piece of lid) expect(piece.partId).toBe('clasp');
    const u = unionBox(lid);
    expect(u.max.z).toBeCloseTo(d.lidH + c.hang + 2, 4);
    expect(u.min.y).toBeCloseTo(-(c.standoff + c.tongueT + 1), 4); // thumb lip at -3.6
    expect(u.max.y).toBeCloseTo(d.wall / 2, 4); // boss embedded into the wall
    expect(u.min.z).toBeCloseTo(d.lidH - 4, 4);
    // Centred on the front face, boss the widest piece.
    expect(u.min.x + u.max.x).toBeCloseTo(d.outerW, 4);
    expect(u.max.x - u.min.x).toBeCloseTo(c.width + 2, 4);
    // The tongue: its inner face stands `standoff` off the front face.
    const tongue = lid.find((piece) => {
      const b = bbox(piece.geometry);
      return Math.abs(b.max.y + c.standoff) < 1e-6 && Math.abs(b.min.y + c.standoff + c.tongueT) < 1e-6;
    });
    expect(tongue).toBeDefined();
    const tb = bbox(tongue!.geometry);
    expect(tb.max.z).toBeCloseTo(d.lidH + c.hang + 2, 4);
    expect(tb.max.x - tb.min.x).toBeCloseTo(c.width, 4);
  });

  it('builds the base catch ridge on the outer front face, embedded into the wall', () => {
    const base = buildClaspPieces(d, 'base');
    expect(base.length).toBe(1);
    expect(base[0].partId).toBe('clasp');
    const b = bbox(base[0].geometry);
    expect(b.min.y).toBeCloseTo(-c.hookProud, 4);
    expect(b.max.y).toBeCloseTo(d.wall / 2, 4);
    expect(b.min.z).toBeCloseTo(d.baseH - 6.9, 4);
    expect(b.max.z).toBeCloseTo(d.baseH - 5.4, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(c.width + 1, 4);
    expect(b.min.x + b.max.x).toBeCloseTo(d.outerW, 4);
  });

  it('seats the hook just under the ridge in the closed box', () => {
    // The hook: the lid piece that lies between the tongue and the front face.
    const hook = buildClaspPieces(d, 'lid').find((piece) => {
      const b = bbox(piece.geometry);
      return b.max.y < 0 && b.min.y > -c.standoff - 0.1;
    });
    expect(hook).toBeDefined();
    const hb = bbox(hook!.geometry);
    const ridge = bbox(buildClaspPieces(d, 'base')[0].geometry);
    // World distances below the seam: the lid prints rim-down, so print z = lidH + k is k below.
    const hookTopBelowSeam = hb.min.z - d.lidH;
    const ridgeBottomBelowSeam = d.baseH - ridge.min.z;
    expect(hookTopBelowSeam).toBeCloseTo(7.2, 4);
    expect(ridgeBottomBelowSeam).toBeCloseTo(6.9, 4);
    expect(hb.max.z - d.lidH).toBeCloseTo(c.hang, 4);
    // Engagement is 0.6 mm in Y (hook -1.0..-0.2 vs ridge -0.8..0), with 0.3 mm Z clearance
    // between the ridge's underside and the hook's catch face after the snap.
    const yOverlap = Math.min(hb.max.y, ridge.max.y) - Math.max(hb.min.y, ridge.min.y);
    expect(yOverlap).toBeCloseTo(0.6, 6);
    // Precision 5: both terms are float32 differences near 30 mm (~8e-7 rounding).
    expect(hookTopBelowSeam - ridgeBottomBelowSeam).toBeCloseTo(0.3, 5);
  });

  it('keeps the clasp between the corner fillets on a small, round box', () => {
    // 30 mm tall: at 20 mm the base is only 10 mm, under the clasp's 10.5 mm height rule.
    const t = computePrintBoxDims({ ...p, outerFilletMm: 8 }, 20, 20, 30);
    expect(t.clasp).not.toBeNull();
    expect(t.clasp!.width).toBeLessThanOrEqual(t.outerW - 2 * (8 + 2) + 1e-9);
    for (const part of ['base', 'lid'] as const) {
      const u = unionBox(buildClaspPieces(t, part));
      expect(u.min.x).toBeGreaterThanOrEqual(8 - 1e-4);
      expect(u.max.x).toBeLessThanOrEqual(t.outerW - 8 + 1e-4);
    }
    // At 20 mm the lid yields 0.5 mm so the base reaches the clasp's 10.5 mm.
    const short = computePrintBoxDims({ ...p, outerFilletMm: 8 }, 20, 20, 20);
    expect(short.clasp).not.toBeNull();
    expect(short.baseH).toBeCloseTo(10.5, 6);
  });

  it('drops the clasp when the base is too short for the tongue', () => {
    const t = computePrintBoxDims({ ...p, floorThickness3dMm: 1.2, lidHeightMm: 100 }, 30, 30, 20);
    if (t.clasp) expect(t.baseH).toBeGreaterThanOrEqual(10.5 - 1e-9);
    else expect(buildClaspPieces(t, 'lid')).toEqual([]);
    // Whenever a clasp exists, the lid's pieces in the world stay above the base's bed: print
    // z = lidH + k is k below the seam, and the seam is baseH above the bed.
    for (const box of [t, d, computePrintBoxDims(p, 30, 30, 30)]) {
      for (const piece of buildClaspPieces(box, 'lid')) {
        expect(bbox(piece.geometry).max.z - box.lidH).toBeLessThanOrEqual(box.baseH + 1e-4);
      }
    }
  });

  it('returns no pieces when the clasp is off', () => {
    const off = computePrintBoxDims({ ...p, includeSnapClasp: false }, 60, 60, 40);
    expect(buildClaspPieces(off, 'base')).toEqual([]);
    expect(buildClaspPieces(off, 'lid')).toEqual([]);
  });

  it('keeps faces pointing outward (positive signed volume) and non-indexed', () => {
    for (const part of ['base', 'lid'] as const) {
      for (const piece of buildClaspPieces(d, part)) {
        expect(piece.geometry.index).toBeNull();
        expect(piece.geometry.getAttribute('position').count % 3).toBe(0);
        expect(signedVolume(piece.geometry)).toBeGreaterThan(0);
      }
    }
  });
});

const count = (s: string, needle: string) => s.split(needle).length - 1;
const xExtent = (s: string) => {
  const xs = [...s.matchAll(/vertex (\S+) \S+ \S+/g)].map((m) => parseFloat(m[1]));
  return { min: Math.min(...xs), max: Math.max(...xs) };
};

describe('STL export from the shared print pieces', () => {
  const outerW = (() => {
    const m = generateBoxModel(p);
    return computePrintBoxDims(p, m.innerDims.widthMm, m.innerDims.depthMm, m.innerDims.heightMm).outerW;
  })();

  it('writes one solid with whole triangles and no NaN', () => {
    const stl = export3DPrintBoxStl(p);
    const facets = count(stl, 'facet normal');
    expect(facets).toBeGreaterThan(200);
    expect(stl).not.toContain('NaN');
    expect(count(stl, 'vertex ')).toBe(3 * facets);
    expect(stl.startsWith('solid Kerfuffle_3DPrint_Box')).toBe(true);
    expect(stl.trimEnd().endsWith('endsolid Kerfuffle_3DPrint_Box')).toBe(true);
  });
  it('lays the lid 12 mm to the right of the base', () => {
    const { min, max } = xExtent(export3DPrintBoxStl(p));
    expect(min).toBeCloseTo(0, 2);
    expect(max).toBeCloseTo(2 * outerW + 12, 2);
  });
  it('splits into base and lid files, each at the origin', () => {
    const parts = export3DPrintBoxStlParts(p);
    const all = export3DPrintBoxStl(p);
    expect(parts.base).toContain('solid Kerfuffle_3DPrint_Base');
    expect(parts.lid).toContain('solid Kerfuffle_3DPrint_Lid');
    expect(count(parts.lid, 'facet normal')).toBeLessThan(count(all, 'facet normal'));
    expect(count(parts.base, 'facet normal') + count(parts.lid, 'facet normal')).toBe(count(all, 'facet normal'));
    const lid = xExtent(parts.lid);
    expect(lid.min).toBeCloseTo(0, 2);
    expect(lid.max).toBeCloseTo(outerW, 2);
    const base = xExtent(parts.base);
    expect(base.min).toBeCloseTo(0, 2);
    expect(base.max).toBeCloseTo(outerW, 2);
  });
  it('has fewer facets with the hinge and clasp off', () => {
    const full = count(export3DPrintBoxStl(p), 'facet normal');
    const bare = count(export3DPrintBoxStl({ ...p, include3dHinge: false, includeSnapClasp: false }), 'facet normal');
    expect(bare).toBeLessThan(full);
  });
});

describe('printed hinge', () => {
  const T = DEFAULT_BOX_PARAMETERS.materialThicknessMm;
  const clam = {
    ...DEFAULT_BOX_PARAMETERS,
    category: 'wood-finger' as const,
    templateId: 'finger-clamshell' as const,
    clamshellHingeType: 'printed-hinge' as const,
  };

  it('lays out the hinge holes at 22% and 78% across the back wall', () => {
    const l = hingeHoleLayout(DEFAULT_BOX_PARAMETERS, 110);
    expect(l.centersX[0]).toBeCloseTo(T + 24.2);
    expect(l.centersX[1]).toBeCloseTo(T + 85.8);
    expect(l.spacing).toBeCloseTo(8.8);
    // Butt hardware keeps its pilot holes 5 mm from the seam; the printed hinge's are 6 mm.
    expect(l.fromSeam).toBe(5);
    expect(hingeHoleLayout(clam, 110).fromSeam).toBe(6);
  });

  it('cuts four 3.0 mm pin holes in each back wall, 6 mm from the seam, and shows the hinges in 3D', () => {
    const model = generateBoxModel({ ...clam, includeHingeScrewHoles: false });
    // The clamshell's lid height clamp (fingerJointEngine): 18 mm on the default 55 mm box.
    const lidH = Math.min(Math.max(12, clam.lidHeightMm), model.innerDims.heightMm - 12);
    // Holes are built at y = T + 6 (base back, seam on its flat top edge at y = T) and
    // y = T + lidH - 6 (lid back, seam on its flat bottom edge at y = T + lidH); the panel then
    // shifts its paths so its outline starts at 0, so measure from the outline's seam edge.
    const outlineY = (panel: (typeof model.panels2D)[number]) => {
      const nums = panel.paths.find((x) => x.id === `${panel.id}-outline`)!.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const ys = nums.filter((_, i) => i % 2 === 1);
      return { min: Math.min(...ys), max: Math.max(...ys) };
    };
    for (const id of ['base-back', 'lid-back']) {
      const panel = model.panels2D.find((x) => x.id === id)!;
      const holes = panel.paths.filter((x) => x.layer === 'cut' && x.id.includes('hinge-hole'));
      expect(holes.length).toBe(4);
      const { min, max } = outlineY(panel);
      if (id === 'lid-back') expect(max - min).toBeCloseTo(T + lidH, 3);
      for (const h of holes) {
        const nums = h.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        // "M x0 y A r r 0 1 0 x1 y ...": radius 1.5, extent x1 - x0 = 3.0
        expect(nums[2]).toBeCloseTo(1.5);
        expect(nums[7] - nums[0]).toBeCloseTo(3.0);
        // 6 mm from the seam edge.
        expect(id === 'base-back' ? nums[1] - min : max - nums[1]).toBeCloseTo(6, 3);
      }
    }
    const ids = model.panels3D.map((x) => x.id);
    for (const i of [1, 2]) {
      for (const part of ['base', 'lid', 'knuckle']) expect(ids).toContain(`printed-hinge-${i}-${part}`);
    }
    const lidLeaf = model.panels3D.find((x) => x.id === 'printed-hinge-1-lid')!;
    const baseLeaf = model.panels3D.find((x) => x.id === 'printed-hinge-1-base')!;
    const knuckle3D = model.panels3D.find((x) => x.id === 'printed-hinge-1-knuckle')!;
    expect(lidLeaf.foldRig).toBeDefined();
    expect(lidLeaf.heightMm).toBeCloseTo(9.7);
    expect(baseLeaf.heightMm).toBeCloseTo(9.7);
    expect(lidLeaf.closedPos[1] - knuckle3D.closedPos[1]).toBeCloseTo(7.65);
    expect(knuckle3D.closedPos[1] - baseLeaf.closedPos[1]).toBeCloseTo(7.65);
    expect(model.panels3D.find((x) => x.id === 'printed-hinge-1-knuckle')!.foldRig).toBeUndefined();
  });

  const spec = { spacing: 8.8, pinMm: 1.75, boardT: 3 };
  const L = spec.spacing + 8;

  function knuckleRanges(g: THREE.BufferGeometry): [number, number][] {
    const pos = g.getAttribute('position');
    const xs: number[] = [];
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -2.6) xs.push(pos.getX(i));
    // Knuckles are prisms along X: their only vertices sit on the two end caps, so the sorted
    // distinct x values pair up into [x0, x1] ranges.
    const ends = [...new Set(xs.map((x) => x.toFixed(4)))].map(Number).sort((a, b) => a - b);
    expect(ends.length % 2).toBe(0);
    const ranges: [number, number][] = [];
    for (let i = 0; i < ends.length; i += 2) ranges.push([ends[i], ends[i + 1]]);
    return ranges;
  }

  it('builds two flat leaves with the knuckle off the plate edge and interleaving segments', () => {
    const leaves = buildPrintedHingeLeaves(spec);
    expect(leaves.length).toBe(2);
    for (const leaf of leaves) {
      expect(leaf.index).toBeNull();
      const b = bbox(leaf);
      expect(b.min.x).toBeCloseTo(0, 4);
      expect(b.max.x).toBeCloseTo(L, 4);
      expect(b.min.y).toBeCloseTo(-5, 2);
      expect(b.max.y).toBeCloseTo(10, 4);
      expect(b.min.z).toBeCloseTo(0, 4);
      expect(b.max.z).toBeCloseTo(5, 2);
      expect(signedVolume(leaf)).toBeGreaterThan(0);
    }
    const seg = (L - 0.6) / 3;
    const a = knuckleRanges(leaves[0]);
    const bR = knuckleRanges(leaves[1]);
    expect(a.length).toBe(2);
    expect(bR.length).toBe(1);
    expect(a[0][0]).toBeCloseTo(0, 4);
    expect(a[0][1]).toBeCloseTo(seg, 4);
    expect(bR[0][0] - a[0][1]).toBeCloseTo(0.3, 4);
    expect(bR[0][1] - bR[0][0]).toBeCloseTo(seg, 4);
    expect(a[1][0] - bR[0][1]).toBeCloseTo(0.3, 4);
    expect(a[1][1]).toBeCloseTo(L, 4);
  });

  it('cuts two 3.2 mm pin holes through each plate, 6 mm from the axis', () => {
    for (const leaf of buildPrintedHingeLeaves(spec)) {
      const pos = leaf.getAttribute('position');
      for (const dx of [-spec.spacing / 2, spec.spacing / 2]) {
        const cx = L / 2 + dx;
        let onRim = 0;
        for (let i = 0; i < pos.count; i++) {
          const z = pos.getZ(i);
          if (z < -1e-6 || z > 1.6 + 1e-6) continue;
          const r = Math.hypot(pos.getX(i) - cx, pos.getY(i) - 3.5);
          expect(r).toBeGreaterThan(1.59);
          if (Math.abs(r - 1.6) < 1e-4) onRim++;
        }
        expect(onRim).toBeGreaterThan(0);
        // No plate triangle covers the hole.
        for (let i = 0; i < pos.count; i += 3) {
          const tx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
          const ty = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
          const tz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
          if (tz > 1.6 + 1e-6) continue;
          expect(Math.hypot(tx - cx, ty - 3.5)).toBeGreaterThan(1.6 * Math.cos(Math.PI / 24) - 1e-3);
        }
      }
      // 6 mm from the axis at y = -2.5, and a 1.6 mm ligament to the plate's knuckle edge (y = 0.3).
      expect(3.5 - -2.5).toBeCloseTo(6);
      let plateMinY = Infinity;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getZ(i) <= 1.6 + 1e-6 && pos.getY(i) > 0) plateMinY = Math.min(plateMinY, pos.getY(i));
      }
      expect(plateMinY).toBeCloseTo(0.3, 4);
      expect(3.5 - 1.6 - plateMinY).toBeCloseTo(1.6, 4);
    }
  });

  it('keeps the pin bore clear of the web', () => {
    const boreR = (spec.pinMm + 0.25) / 2;
    for (const leaf of buildPrintedHingeLeaves(spec)) {
      const pos = leaf.getAttribute('position');
      let onBore = 0;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getY(i) + 2.5, pos.getZ(i) - 2.5);
        expect(r).toBeGreaterThan(boreR - 0.01);
        if (Math.abs(r - boreR) < 1e-4) onBore++;
      }
      expect(onBore).toBeGreaterThan(0);
      for (let i = 0; i < pos.count; i += 3) {
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        expect(Math.hypot(cy + 2.5, cz - 2.5)).toBeGreaterThan(boreR * Math.cos(Math.PI / 24) - 1e-3);
      }
    }
  });

  it('clamps a fat pin to 3 mm so the bore leaves a knuckle wall', () => {
    const leaves = buildPrintedHingeLeaves({ spacing: 8.8, pinMm: 6, boardT: 3 });
    const boreR = (3.0 + 0.25) / 2;
    expect(boreR).toBeCloseTo(1.625);
    for (const leaf of leaves) {
      const pos = leaf.getAttribute('position');
      let onBore = 0;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getY(i) + 2.5, pos.getZ(i) - 2.5);
        expect(r).toBeGreaterThan(boreR - 1e-4);
        if (Math.abs(r - boreR) < 1e-4) onBore++;
      }
      expect(onBore).toBeGreaterThan(0);
      expect(signedVolume(leaf)).toBeGreaterThan(0);
    }
    for (const pin of buildPrintedHingePins({ spacing: 8.8, pinMm: 6, boardT: 3 })) {
      expect(signedVolume(pin)).toBeGreaterThan(0);
    }
  });

  it('builds four 3.1 mm pins, plate plus board long, standing on the bed', () => {
    const pins = buildPrintedHingePins(spec);
    expect(pins.length).toBe(4);
    for (const pin of pins) {
      const b = bbox(pin);
      expect(b.min.z).toBeCloseTo(0, 4);
      expect(b.max.z).toBeCloseTo(spec.boardT + 1.6, 4);
      expect(b.max.x - b.min.x).toBeCloseTo(3.1, 4);
      expect(signedVolume(pin)).toBeGreaterThan(0);
    }
  });

  it('serializes both leaves and the pins into one STL', () => {
    const stl = printedHingeStl(spec);
    expect(stl).toContain('solid Kerfuffle_Printed_Hinge');
    expect(stl).not.toContain('NaN');
    expect(count(stl, 'facet normal')).toBeGreaterThan(100);
    const x = xExtent(stl);
    expect(x.min).toBeCloseTo(0, 2);
    // Leaf B ends at 2L + 8; the pins start 8 mm later, 6 mm apart.
    expect(x.max).toBeCloseTo(2 * L + 16 + 3 * 6 + 3.1, 2);
  });

  it('exports the hinge STL from the clamshell parameters', () => {
    const stl = exportPrintedHingeStl(clam, 110);
    expect(stl).toContain('Kerfuffle_Printed_Hinge');
    expect(stl).not.toContain('NaN');
  });
});
