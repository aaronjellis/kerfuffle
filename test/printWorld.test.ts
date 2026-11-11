import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { computePrintBoxDims, KNUCKLE_CLEARANCE as KC, KNUCKLE_GAP } from '../src/engine/printParts';
import { buildPrintPartWorldGeometry } from '../src/engine/printWorld';
import type { BoxParameters, GeneratedBoxModel } from '../src/engine/types';

const p: BoxParameters = {
  ...DEFAULT_BOX_PARAMETERS,
  category: '3d-print',
  templateId: '3d-snap-box',
};

function setup(params: BoxParameters = p) {
  const model = generateBoxModel(params);
  const { widthMm, depthMm, heightMm } = model.innerDims;
  const dims = computePrintBoxDims(params, widthMm, depthMm, heightMm);
  const totalH = dims.baseH + dims.lidH;
  const seamY = -totalH / 2 + dims.baseH;
  return { model, dims, totalH, seamY };
}

function bbox(geoms: THREE.BufferGeometry[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const g of geoms) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

function partBox(model: GeneratedBoxModel, part: 'base' | 'lid', id?: string) {
  const pieces = buildPrintPartWorldGeometry(model, part).filter((q) => !id || q.partId === id);
  return bbox(pieces.map((q) => q.geometry));
}

/** The world hinge axis (y, z) of one part: the centre of its annuli, the hinge pieces that cross the seam. */
function worldAxis(model: GeneratedBoxModel, part: 'base' | 'lid', seamY: number): { y: number; z: number } {
  const annuli = buildPrintPartWorldGeometry(model, part).filter((q) => {
    if (q.partId !== 'hinge') return false;
    const b = bbox([q.geometry]);
    return b.min.y < seamY - 0.1 && b.max.y > seamY + 0.1;
  });
  expect(annuli.length).toBeGreaterThan(0);
  const b = bbox(annuli.map((q) => q.geometry));
  return { y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
}

describe('print parts in the world frame', () => {
  it('stands the base on the box bottom with its rim at the seam, front at +Z', () => {
    const { model, dims, totalH, seamY } = setup();
    const R = dims.hinge!.R;
    const b = partBox(model, 'base');
    expect(b.min.y).toBeCloseTo(-totalH / 2, 3);
    expect(b.max.y).toBeCloseTo(seamY + Math.max(R, dims.lip.height), 3);
    expect(R).toBeGreaterThan(dims.lip.height); // so the knuckle tops are the highest point
    expect(b.max.z).toBeCloseTo(dims.outerD / 2 + dims.clasp!.ridgeProud, 3);
    expect(b.min.z).toBeCloseTo(-dims.outerD / 2 - KC - 2 * R, 3);
    expect(b.min.x).toBeCloseTo(-dims.outerW / 2, 3);
    expect(b.max.x).toBeCloseTo(dims.outerW / 2, 3);
  });

  it('hangs the lid rim-down from the box top to the seam, tongue below the seam', () => {
    const { model, dims, totalH, seamY } = setup();
    const R = dims.hinge!.R;
    const l = partBox(model, 'lid');
    expect(l.max.y).toBeCloseTo(totalH / 2, 3);
    expect(l.min.y).toBeCloseTo(seamY - dims.clasp!.hang - 2, 3);
    expect(l.min.z).toBeCloseTo(-dims.outerD / 2 - KC - 2 * R, 3);
    // The clasp is at the front.
    expect(partBox(model, 'lid', 'clasp').min.z).toBeGreaterThan(dims.outerD / 2 - dims.wall);
  });

  it('meets the shells at the seam; only the lip crosses it', () => {
    const { model, dims, seamY } = setup();
    expect(partBox(model, 'base', 'shell').max.y).toBeCloseTo(seamY, 3);
    expect(partBox(model, 'lid', 'shell').min.y).toBeCloseTo(seamY, 3);
    const lip = partBox(model, 'base', 'lip');
    expect(lip.max.y).toBeCloseTo(seamY + dims.lip.height, 3);
    expect(lip.min.y).toBeLessThan(seamY);
  });

  it('puts both knuckle sets on the same axis behind the back face', () => {
    const { model, dims, seamY } = setup();
    const R = dims.hinge!.R;
    for (const part of ['base', 'lid'] as const) {
      const h = partBox(model, part, 'hinge');
      expect(h.min.z).toBeCloseTo(-dims.outerD / 2 - KC - 2 * R, 3);
      if (part === 'base') expect(h.max.y).toBeCloseTo(seamY + R, 3);
      else expect(h.min.y).toBeCloseTo(seamY - R, 3);
    }
  });

  it('interleaves base and lid knuckles in world x with their gaps', () => {
    const { model, dims } = setup();
    const ranges: { x0: number; x1: number; part: string }[] = [];
    for (const part of ['base', 'lid'] as const) {
      for (const q of buildPrintPartWorldGeometry(model, part)) {
        if (q.partId !== 'hinge') continue;
        q.geometry.computeBoundingBox();
        const { min, max } = q.geometry.boundingBox!;
        if (!ranges.some((r) => Math.abs(r.x0 - min.x) < 1e-6)) {
          ranges.push({ x0: min.x, x1: max.x, part });
        }
      }
    }
    ranges.sort((a, b) => a.x0 - b.x0);
    const segs = dims.hinge!.segments;
    expect(ranges.length).toBe(segs.length);
    expect(ranges.map((r) => r.part)).toEqual(segs.map((s) => s.owner));
    for (let i = 0; i < ranges.length; i++) {
      expect(ranges[i].x0).toBeCloseTo(segs[i].x0 - dims.outerW / 2, 3);
      if (i > 0) expect(ranges[i].x0 - ranges[i - 1].x1).toBeCloseTo(KNUCKLE_GAP, 3);
    }
  });

  it('drops the hinge pieces when the hinge is off', () => {
    const { model } = setup({ ...p, include3dHinge: false });
    for (const part of ['base', 'lid'] as const) {
      expect(buildPrintPartWorldGeometry(model, part).some((q) => q.partId === 'hinge')).toBe(false);
    }
  });
});

describe('3D print panels and blueprint', () => {
  it('places both panels at the origin and pivots the lid on the real hinge axis', () => {
    const { model, dims, seamY } = setup();
    const base = model.panels3D.find((s) => s.id === '3d-base')!;
    const lid = model.panels3D.find((s) => s.id === '3d-lid')!;
    expect(base.closedPos).toEqual([0, 0, 0]);
    expect(lid.closedPos).toEqual([0, 0, 0]);
    expect(base.explodedPos[1]).toBeLessThan(0);
    expect(lid.explodedPos[1]).toBeGreaterThan(0);
    const [px, py, pz] = lid.foldRig!.pivotOffset;
    expect(px).toBe(0);
    expect(py).toBeCloseTo(seamY, 6);
    expect(pz).toBeCloseTo(-dims.outerD / 2 - dims.hinge!.R - KC, 6);
    // The pivot is the world hinge axis: the centre of the annuli (the hinge pieces that cross the
    // seam) in both parts.
    for (const part of ['base', 'lid'] as const) {
      const axis = worldAxis(model, part, seamY);
      expect(axis.y).toBeCloseTo(py, 3);
      expect(axis.z).toBeCloseTo(pz, 3);
    }
  });

  it('clears each knuckle from the other part\'s back-wall edge by the radial clearance in the closed box', () => {
    for (const params of [p, { ...p, wallThickness3dMm: 6, widthMm: 80, depthMm: 80, heightMm: 40 }]) {
      const { model, dims, seamY } = setup(params);
      const R = dims.hinge!.R;
      const axis = worldAxis(model, 'base', seamY);
      // The lid's back-face bottom edge and the base's back-face top edge both lie on the seam at
      // z = -outerD/2; check that against the shells' own geometry.
      const lidShell = partBox(model, 'lid', 'shell');
      const baseShell = partBox(model, 'base', 'shell');
      expect(lidShell.min.z).toBeCloseTo(-dims.outerD / 2, 3);
      expect(lidShell.min.y).toBeCloseTo(seamY, 3);
      expect(baseShell.min.z).toBeCloseTo(-dims.outerD / 2, 3);
      expect(baseShell.max.y).toBeCloseTo(seamY, 3);
      const edgeToAxis = Math.hypot(seamY - axis.y, -dims.outerD / 2 - axis.z);
      expect(edgeToAxis).toBeCloseTo(R + KC, 3);
      // No shell vertex of either part comes nearer the axis than R + KC, so the other part's
      // knuckles (radius R) clear every wall edge by KC as the lid swings.
      for (const part of ['base', 'lid'] as const) {
        for (const q of buildPrintPartWorldGeometry(model, part)) {
          if (q.partId !== 'shell') continue;
          const pos = q.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            const r = Math.hypot(pos.getY(i) - axis.y, pos.getZ(i) - axis.z);
            expect(r).toBeGreaterThan(R + KC - 1e-3);
          }
        }
      }
    }
  });

  it('keeps the back-face pivot when the hinge is off', () => {
    const { model, dims } = setup({ ...p, include3dHinge: false });
    const lid = model.panels3D.find((s) => s.id === '3d-lid')!;
    expect(lid.foldRig!.pivotOffset[2]).toBeCloseTo(-dims.outerD / 2, 6);
  });

  it('draws the knuckles, pin and clasp footprints on the plans', () => {
    const { model, dims } = setup();
    const base = model.panels2D.find((q) => q.id === 'base-3d-plan')!;
    const lid = model.panels2D.find((q) => q.id === 'lid-3d-plan')!;
    const ids = (panel: typeof base) => panel.paths.map((q) => q.id);
    const segs = dims.hinge!.segments;
    for (let i = 0; i < segs.length; i++) {
      const owner = segs[i].owner === 'base' ? base : lid;
      const other = segs[i].owner === 'base' ? lid : base;
      expect(ids(owner)).toContain(`3d-hinge-knuckle-${i}`);
      expect(ids(other)).not.toContain(`3d-hinge-knuckle-${i}`);
    }
    expect(ids(base)).toContain('3d-hinge-pin');
    expect(base.paths.find((q) => q.id === '3d-hinge-pin')!.layer).toBe('score');
    expect(ids(base)).toContain('3d-clasp-catch');
    expect(ids(lid)).toContain('3d-clasp-boss');
    expect(ids(base)).not.toContain('3d-hinge-knuckle');
    const R = dims.hinge!.R;
    // Knuckles stand KC off the back edge (y outerD + KC .. outerD + KC + 2R in the print frame,
    // shifted by the plan's front depth); the pin line sits on the axis.
    const nums = (d: string) => d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const c = dims.clasp!;
    const baseFront = c.ridgeProud;
    const lidFront = c.standoff + c.tongueT + 1;
    for (const [panel, oy] of [[base, baseFront], [lid, lidFront]] as const) {
      for (const q of panel.paths.filter((x) => x.id.startsWith('3d-hinge-knuckle-'))) {
        const ys = nums(q.d).filter((_, i) => i % 2 === 1);
        expect(Math.min(...ys) - oy).toBeCloseTo(dims.outerD + KC, 2);
        expect(Math.max(...ys) - oy).toBeCloseTo(dims.outerD + KC + 2 * R, 2);
      }
    }
    const pinY = nums(base.paths.find((q) => q.id === '3d-hinge-pin')!.d)[1];
    expect(pinY - baseFront).toBeCloseTo(dims.hinge!.axisY, 2);
    expect(base.heightMm).toBeGreaterThanOrEqual(dims.outerD + 2 * R + baseFront - 1e-6);
    // The lid's front footprint reaches the thumb lip: standoff + tongue + the 1 mm flare.
    expect(lid.heightMm).toBeCloseTo(lidFront + dims.outerD + KC + 2 * R, 6);
    expect(base.heightMm).toBeCloseTo(baseFront + dims.outerD + KC + 2 * R, 6);
    const boss = lid.paths.find((q) => q.id === '3d-clasp-boss')!;
    const bossYs = nums(boss.d).filter((_, i) => i % 2 === 1);
    expect(Math.min(...bossYs)).toBeCloseTo(0, 3);
    expect(Math.max(...bossYs)).toBeCloseTo(lidFront, 3);
    // Lid knuckles are drawn at the lid's mirrored print range.
    segs.forEach((seg, i) => {
      if (seg.owner !== 'lid') return;
      const xs = nums(lid.paths.find((q) => q.id === `3d-hinge-knuckle-${i}`)!.d).filter((_, j) => j % 2 === 0);
      expect(Math.min(...xs)).toBeCloseTo(dims.outerW - seg.x1, 2);
      expect(Math.max(...xs)).toBeCloseTo(dims.outerW - seg.x0, 2);
    });
  });
});

describe('printed dividers in the world', () => {
  it('adds one tagged piece per divider to the base and none to the lid', () => {
    const { model } = setup({
      ...p,
      printDividersBasis: { w: 110, d: 80 },
      printDividers: [
        { id: 'v', axis: 'y', pos: 40, from: 0, to: 80 },
        { id: 'h', axis: 'x', pos: 30, from: 40, to: 110 },
      ],
    });
    const base = buildPrintPartWorldGeometry(model, 'base').filter((x) => x.partId === 'divider');
    expect(base.map((x) => x.dividerId)).toEqual(['v', 'h']);
    expect(buildPrintPartWorldGeometry(model, 'lid').some((x) => x.partId === 'divider')).toBe(false);
  });
});
