import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { generatePatternHoles } from '../src/engine/facePatterns';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxParameters, FacePatternStyle, Panel3DTransform, Point2D } from '../src/engine/types';

const STYLES: Exclude<FacePatternStyle, 'none'>[] = ['grid', 'checker', 'diamond', 'honeycomb', 'scallops', 'sunflower', 'spiral'];

function segDist(a: Point2D, b: Point2D, p: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/** Smallest gap between two polygons' outlines (vertex to edge, both ways). */
function polyGap(p: Point2D[], q: Point2D[]): number {
  let m = Infinity;
  for (const [a, b] of [[p, q], [q, p]]) {
    for (const v of a) for (let i = 0; i < b.length; i++) m = Math.min(m, segDist(b[i], b[(i + 1) % b.length], v));
  }
  return m;
}

describe('generatePatternHoles', () => {
  for (const style of STYLES) {
    it(`${style}: holes stay inside the padding and keep a bar between them`, () => {
      const bar = 3;
      const holes = generatePatternHoles({ style, cellMm: 14, barMm: bar, paddingMm: 8 }, 120, 80);
      expect(holes.length).toBeGreaterThan(5);
      for (const h of holes) {
        for (const p of h) {
          expect(p.x).toBeGreaterThanOrEqual(8 - 1e-6);
          expect(p.x).toBeLessThanOrEqual(112 + 1e-6);
          expect(p.y).toBeGreaterThanOrEqual(8 - 1e-6);
          expect(p.y).toBeLessThanOrEqual(72 + 1e-6);
        }
      }
      const box = (h: Point2D[]) => [Math.min(...h.map((p) => p.x)), Math.min(...h.map((p) => p.y)), Math.max(...h.map((p) => p.x)), Math.max(...h.map((p) => p.y))];
      const boxes = holes.map(box);
      for (let i = 0; i < holes.length; i++) {
        for (let j = i + 1; j < holes.length; j++) {
          const [a, b] = [boxes[i], boxes[j]];
          if (a[0] > b[2] + bar || b[0] > a[2] + bar || a[1] > b[3] + bar || b[1] > a[3] + bar) continue;
          // Polylines approximate the curves, so allow a little under the nominal bar.
          expect(polyGap(holes[i], holes[j]), `${style} holes ${i} and ${j}`).toBeGreaterThan(bar * 0.8);
        }
      }
    });
  }
  it('cuts nothing when the padded face is smaller than a cell', () => {
    expect(generatePatternHoles({ style: 'grid', cellMm: 14, barMm: 3, paddingMm: 8 }, 24, 80)).toEqual([]);
  });
});

const model = (p: Partial<BoxParameters>) => generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, ...p });

describe('pattern faces', () => {
  it('offers the lid and plain walls, not slotted or missing ones', () => {
    expect(model({ category: 'wood-finger', templateId: 'finger-basic', woodLidStyle: 'closed' }).patternFaceIds).toEqual(['top', 'front', 'back', 'left', 'right']);
    expect(model({ category: 'wood-finger', templateId: 'finger-basic', woodLidStyle: 'sliding-lid' }).patternFaceIds).not.toContain('top');
    expect(model({ category: 'wood-finger', templateId: 'finger-organizer' }).patternFaceIds).toEqual([]);
    expect(model({ category: 'cardboard-fold', templateId: 'cardboard-mailer' }).patternFaceIds).toContain('top');
    expect(model({ category: 'cardboard-fold', templateId: 'cardboard-telescope' }).patternFaceIds).toEqual(['top']);
    expect(model({ category: '3d-print', templateId: '3d-snap-box' }).patternFaceIds).toEqual([]);
  });

  it('leaves the box alone with no pattern', () => {
    const a = model({ category: 'wood-finger', templateId: 'finger-basic', woodLidStyle: 'closed' });
    expect(a.panels2D.flatMap((p) => p.paths).some((p) => p.id.includes('-pattern-'))).toBe(false);
    expect(a.panels3D.find((p) => p.id === 'top')!.holeContours).toBeUndefined();
  });

  it('gives each side its own pattern and leaves sides without one solid', () => {
    const m = model({
      category: 'wood-finger',
      templateId: 'finger-basic',
      woodLidStyle: 'closed',
      facePatterns: {
        top: { style: 'grid', cellMm: 14, barMm: 3, paddingMm: 8 },
        front: { style: 'sunflower', cellMm: 10, barMm: 2, paddingMm: 6 },
        back: { style: 'none', cellMm: 14, barMm: 3, paddingMm: 8 },
      },
    });
    const cuts = (id: string) => m.panels2D.find((p) => p.id === id)!.paths.filter((p) => p.id.includes('-pattern-')).length;
    const grid = generatePatternHoles({ style: 'grid', cellMm: 14, barMm: 3, paddingMm: 8 }, 110, 80).length;
    expect(cuts('top')).toBe(grid);
    expect(cuts('front')).toBeGreaterThan(0);
    expect(cuts('back')).toBe(0);
    expect(cuts('left')).toBe(0);
    expect(m.panels3D.find((p) => p.id === 'back')!.holeContours ?? []).toHaveLength(0);
  });

  it('finger lid: the sheet and the 3D panel get the same holes in the shared outline frame', () => {
    const m = model({ category: 'wood-finger', templateId: 'finger-basic', woodLidStyle: 'closed', facePatterns: { top: { style: 'honeycomb', cellMm: 14, barMm: 3, paddingMm: 8 } } });
    const sheet = m.panels2D.find((p) => p.id === 'top')!;
    const cuts = sheet.paths.filter((p) => p.id.startsWith('top-pattern-top-'));
    const top3 = m.panels3D.find((p) => p.id === 'top')!;
    expect(cuts.length).toBeGreaterThan(5);
    expect(top3.holeContours).toHaveLength(cuts.length);
    // 3D outline frame = sheet frame + the outline's minimum corner; the first vertex of each hole agrees.
    const minX = Math.min(...top3.outlinePoints!.map((p) => p.x));
    const minY = Math.min(...top3.outlinePoints!.map((p) => p.y));
    cuts.forEach((c, i) => {
      const [, x, y] = c.d.match(/^M\s*([-\d.]+)[\s,]+([-\d.]+)/)!.map(Number);
      const h = top3.holeContours![i];
      const near = h.some((p) => Math.hypot(p.x - minX - x, p.y - minY - y) < 0.01);
      expect(near).toBe(true);
    });
  });

  it('mailer lid: laid flat, the 3D holes land where the sheet cuts them', () => {
    const m = model({ category: 'cardboard-fold', templateId: 'cardboard-mailer', facePatterns: { top: { style: 'spiral', cellMm: 14, barMm: 3, paddingMm: 8 }, front: { style: 'scallops', cellMm: 10, barMm: 2.5, paddingMm: 6 } } });
    const sheet = m.panels2D[0];
    const byId = new Map(m.panels3D.map((p) => [p.id, p]));
    // Flat world position of a point in a panel's outline frame, following the fold chain like the viewport.
    const flatWorld = (p: Panel3DTransform, pt: Point2D) => {
      const v = new THREE.Vector3(pt.x - p.widthMm / 2, -(pt.y - p.heightMm / 2), 0)
        .applyEuler(new THREE.Euler(...p.rotation))
        .add(new THREE.Vector3(...p.closedPos));
      let cur: Panel3DTransform | undefined = p;
      while (cur?.foldRig) {
        const r: NonNullable<Panel3DTransform['foldRig']> = cur.foldRig;
        if (r.flatSlide) v.add(new THREE.Vector3(...r.flatSlide));
        const axis = new THREE.Vector3(r.axis === 'x' ? 1 : 0, r.axis === 'y' ? 1 : 0, r.axis === 'z' ? 1 : 0);
        const pivot = new THREE.Vector3(...r.pivotOffset);
        v.sub(pivot).applyAxisAngle(axis, r.flatAngleRad).add(pivot);
        cur = r.parentId ? byId.get(r.parentId) : undefined;
      }
      return v;
    };
    // The floor's centre fixes the sheet-to-world translation.
    const floorSub = sheet.subFaces!.find((s) => s.id === 'bottom')!;
    const floorW = flatWorld(byId.get('bottom')!, { x: byId.get('bottom')!.widthMm / 2, y: byId.get('bottom')!.heightMm / 2 });
    const u0 = floorSub.x + floorSub.width / 2 - floorW.x;
    const v0 = floorSub.y + floorSub.height / 2 - floorW.z;
    for (const face of ['top', 'front']) {
      const cuts = sheet.paths.filter((p) => p.id.startsWith(`${sheet.id}-pattern-${face}-`));
      const p3 = byId.get(face)!;
      expect(cuts.length).toBeGreaterThan(3);
      expect(p3.holeContours).toHaveLength(cuts.length);
      cuts.forEach((c, i) => {
        const [, x, y] = c.d.match(/^M\s*([-\d.]+)[\s,]+([-\d.]+)/)!.map(Number);
        const hits = p3.holeContours![i].map((pt) => flatWorld(p3, pt));
        // Within half a ply: the flat rig's faces line up with the sheet's to the ply model's T/2 rounding.
        const best = Math.min(...hits.map((w) => Math.hypot(w.x + u0 - x, w.z + v0 - y)));
        expect(best, `${face} hole ${i}`).toBeLessThan(m.params.materialThicknessMm / 2 + 0.01);
      });
    }
  });
});
