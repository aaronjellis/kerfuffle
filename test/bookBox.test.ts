import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bookCoverPose, bookFaceTurnDeg, bookLayout, generateBookBox } from '../src/engine/bookBox';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { resolveSheetArtworks } from '../src/engine/exporters';
import { bentPoint } from '../src/engine/bentPanel';
import { toSheet } from '../src/engine/placement';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxPanel2D, BoxParameters, FaceArtwork, Point2D } from '../src/engine/types';

const book = (p: Partial<BoxParameters> = {}): BoxParameters => ({
  ...DEFAULT_BOX_PARAMETERS,
  // Page lines start off; most of these tests want them on.
  bookPageLines: true,
  category: 'wood-finger',
  templateId: 'finger-book',
  materialThicknessMm: 3,
  ...p,
});
const L = (p: Partial<BoxParameters> = {}, w = 120, d = 170, h = 35) => bookLayout(book(p), w, d, h);
const gen = (p: Partial<BoxParameters> = {}, w = 120, d = 170, h = 35) => generateBookBox(book(p), w, d, h);
const model = (p: Partial<BoxParameters> = {}) =>
  generateBoxModel(book({ widthMm: 120, depthMm: 170, heightMm: 35, dimensionReference: 'inner', ...p }));
const panel = (r: { panels2D: BoxPanel2D[] }, id: string) => r.panels2D.find((x) => x.id === id)!;
/** Every point of a path made of M and L commands. */
const pts = (d: string): Point2D[] => {
  const n = (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  const out: Point2D[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
};
const pathPts = (p: BoxPanel2D, match: (id: string) => boolean) => p.paths.filter((x) => match(x.id)).map((x) => pts(x.d));
const SPINE = Math.PI * 19;

describe('bookLayout', () => {
  it('is full round by default', () => {
    const l = L();
    expect(l.fullRound).toBe(true);
    expect(l.radiusMm).toBeCloseTo(19);
    expect(l.flatBandMm).toBeCloseTo(0);
    expect(l.spineLengthMm).toBeCloseTo(SPINE);
  });
  it('keeps a flat band at a smaller radius', () => {
    const l = L({ bookSpineRadiusMm: 10 });
    expect(l.flatBandMm).toBeCloseTo(18);
    expect(l.spineSegments.map((s) => s.kind)).toEqual(['arc', 'straight', 'arc']);
  });
  it('clamps the radius to full round', () => expect(L({ bookSpineRadiusMm: 99 }).radiusMm).toBeCloseTo(19));
  it('sizes the wrap and the outside', () => {
    const l = L();
    expect(l.coverLengthMm).toBeCloseTo(135);
    expect(l.wrapWidthMm).toBeCloseTo(184);
    expect(l.wrapHeightMm).toBeCloseTo(270 + SPINE);
    expect(l.outer.widthMm).toBeCloseTo(155.5);
    expect(l.outer.depthMm).toBeCloseTo(184);
    expect(l.outer.heightMm).toBeCloseTo(41);
    expect(l.innerX1 - l.innerX0).toBeCloseTo(120);
  });
  it('raises the overhang to the thickness', () => expect(L({ materialThicknessMm: 6, bookCoverOverhangMm: 1 }).ovMm).toBe(6));
  it('widens the band for thick wood', () => expect(L({ materialThicknessMm: 6 }).bandMm).toBe(9));
  it('still lays out a 15 mm book', () => expect(L({}, 120, 170, 15).radiusMm).toBeCloseTo(9));
});

describe('the book on the sheet', () => {
  it('makes a wrap and four walls', () =>
    expect(gen().panels2D.map((p) => p.id).sort()).toEqual(['back', 'front', 'right', 'spine-wall', 'wrap']));
  it('sizes the wrap from the layout', () => {
    const w = panel(gen(), 'wrap');
    expect(w.widthMm).toBeCloseTo(184);
    expect(w.heightMm).toBeCloseTo(270 + SPINE);
  });
  it('gives the wrap a sub-face for each cover, and none for the spine', () => {
    const w = panel(gen(), 'wrap');
    expect(w.subFaces!.map((s) => s.id).sort()).toEqual(['bottom', 'top']);
    const top = w.subFaces!.find((s) => s.id === 'top')!;
    expect(top.x).toBe(0);
    expect(top.y).toBe(0);
    expect(top.width).toBeCloseTo(184);
    expect(top.height).toBeCloseTo(135);
  });
  it('keeps every hinge cut inside the spine strip', () => {
    const cuts = pathPts(panel(gen(), 'wrap'), (id) => id.startsWith('wrap-hinge-'));
    expect(cuts.length).toBeGreaterThan(10);
    for (const p of cuts.flat()) {
      expect(p.y).toBeGreaterThanOrEqual(135);
      expect(p.y).toBeLessThanOrEqual(135 + SPINE);
    }
  });
  it('leaves the flat band solid', () => {
    const arc = (Math.PI * 10) / 2;
    const cuts = pathPts(panel(gen({ bookSpineRadiusMm: 10 }), 'wrap'), (id) => id.startsWith('wrap-hinge-')).flat();
    expect(cuts.length).toBeGreaterThan(10);
    expect(cuts.some((p) => p.y > 135 + arc + 0.01 && p.y < 135 + arc + 18 - 0.01)).toBe(false);
  });
  it('cuts a slot in the back cover for every wall tab', () => {
    const r = gen();
    const slots = pathPts(panel(r, 'wrap'), (id) => id.startsWith('wrap-slot-'));
    // A tab's foot is the two outline points at the wall's lowest y.
    const tabs = ['front', 'back', 'right', 'spine-wall'].map((id) => {
      const w = panel(r, id);
      const o = pts(w.paths[0].d);
      return o.filter((p) => Math.abs(p.y - w.heightMm) < 1e-6).length / 2;
    });
    expect(slots.length).toBe(tabs.reduce((a, b) => a + b, 0));
    for (const p of slots.flat()) expect(p.y).toBeGreaterThan(135 + SPINE);
  });
  it('keeps slots 2 mm from the cover edges at T = 6', () => {
    const w = panel(gen({ materialThicknessMm: 6 }), 'wrap');
    const holes = pathPts(w, (id) => id.includes('-slot-')).flat();
    expect(holes.length).toBeGreaterThan(0);
    for (const p of holes) {
      expect(Math.min(p.x, w.widthMm - p.x)).toBeGreaterThanOrEqual(2);
      expect(Math.min(p.y, w.heightMm - p.y)).toBeGreaterThanOrEqual(2);
    }
  });
  it('keeps the spine wall slots clear of the hinge', () => {
    const w = panel(gen(), 'wrap');
    const hingeEnd = Math.max(...pathPts(w, (id) => id.startsWith('wrap-hinge-')).flat().map((p) => p.y));
    const firstSlot = Math.min(...pathPts(w, (id) => id.startsWith('wrap-slot-')).flat().map((p) => p.y));
    expect(firstSlot - hingeEnd).toBeGreaterThanOrEqual(5 - 0.5);
  });
  it('adds two pins and two cover slots', () => {
    const r = gen();
    expect(panel(r, 'right').heightMm).toBeCloseTo(35 + 3 + 3);
    const pinSlots = pathPts(panel(r, 'wrap'), (id) => id.startsWith('wrap-pin-slot-'));
    expect(pinSlots.length).toBe(2);
    for (const p of pinSlots.flat()) expect(p.y).toBeLessThan(135);
  });
  it('drops the pins when switched off', () => {
    const r = gen({ bookGuidePins: false });
    expect(panel(r, 'right').heightMm).toBeCloseTo(38);
    expect(pathPts(panel(r, 'wrap'), (id) => id.startsWith('wrap-pin-slot-')).length).toBe(0);
  });
  it('fits one pin on a short wall and none on a tiny one', () => {
    expect(pathPts(panel(gen({}, 120, 20, 35), 'wrap'), (id) => id.startsWith('wrap-pin-slot-')).length).toBe(1);
    expect(pathPts(panel(gen({ materialThicknessMm: 6 }, 120, 15, 35), 'wrap'), (id) => id.startsWith('wrap-pin-slot-')).length).toBe(0);
  });
  it('scores page lines on the three page walls only', () => {
    const r = gen();
    for (const id of ['front', 'back', 'right'])
      expect(panel(r, id).paths.filter((p) => p.id.includes('-page-') && p.layer === 'score').length).toBeGreaterThan(10);
    expect(panel(r, 'spine-wall').paths.some((p) => p.id.includes('-page-'))).toBe(false);
  });
  it('skips page lines when off, and on a patterned wall', () => {
    const off = gen({ bookPageLines: false });
    for (const id of ['front', 'back', 'right']) expect(panel(off, id).paths.some((p) => p.id.includes('-page-'))).toBe(false);
    const patterned = gen({ facePatterns: { front: { style: 'grid', cellMm: 10, barMm: 2, paddingMm: 4 } } });
    expect(panel(patterned, 'front').paths.some((p) => p.id.includes('-page-'))).toBe(false);
    expect(panel(patterned, 'back').paths.some((p) => p.id.includes('-page-'))).toBe(true);
  });
  it('keeps page lines inside the wall', () => {
    const w = panel(gen(), 'right');
    for (const p of pathPts(w, (id) => id.includes('-page-')).flat()) {
      expect(p.y).toBeGreaterThan(3);
      expect(p.y).toBeLessThan(3 + 35);
    }
  });
  it('makes finger joints that mate at the corners', () => {
    const r = gen();
    // The tail wall owns the top corner (its outline reaches x = 0 at the top); the fore-edge wall starts one thickness in.
    const tail = pts(panel(r, 'front').paths[0].d);
    const fore = pts(panel(r, 'right').paths[0].d);
    expect(tail.some((p) => p.x < 1e-6 && p.y < 1e-6)).toBe(true);
    expect(Math.min(...fore.filter((p) => Math.abs(p.y - 3) < 1e-6).map((p) => p.x))).toBeCloseTo(3);
    expect(Math.min(...fore.map((p) => p.x))).toBeCloseTo(0);
  });
});

describe('the book as a model', () => {
  it('starts with page lines off', () => {
    expect(DEFAULT_BOX_PARAMETERS.bookPageLines).toBe(false);
    const m = generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, category: 'wood-finger', templateId: 'finger-book' });
    expect(m.panels2D.some((p) => p.paths.some((x) => x.id.includes('-page-')))).toBe(false);
  });
  it('generates through generateBoxModel', () => {
    const m = model();
    expect(m.innerDims).toEqual({ widthMm: 120, depthMm: 170, heightMm: 35 });
    expect(m.outerDims.widthMm).toBeCloseTo(155.5);
    expect(m.panels2D.length).toBe(5);
  });
  it('hits a typed outside size', () => {
    const m = generateBoxModel(book({ widthMm: 160, depthMm: 190, heightMm: 45, dimensionReference: 'outer' }));
    expect(m.outerDims.widthMm).toBeCloseTo(160, 2);
    expect(m.outerDims.depthMm).toBeCloseTo(190, 2);
    expect(m.outerDims.heightMm).toBeCloseTo(45, 2);
  });
  it('names the faces like a book', () => {
    const m = model();
    const wrap = panel(m, 'wrap');
    expect(wrap.subFaces!.find((s) => s.id === 'top')!.name.toLowerCase()).toBe('front cover');
    expect(panel(m, 'right').name).toBe('Fore edge');
  });
  it('keeps a custom face label', () => {
    const m = model({ customFaceLabels: { ...DEFAULT_BOX_PARAMETERS.customFaceLabels, top: 'RECIPES' } });
    expect(panel(m, 'wrap').subFaces!.find((s) => s.id === 'top')!.name).toBe('RECIPES');
  });
  it('scores no inner label on the spine', () => {
    const m = model({ scoreInnerFaceLabels: true });
    const ids = panel(m, 'wrap').paths.map((p) => p.id).filter((id) => id.includes('-label-score-'));
    expect(ids.sort()).toEqual(['wrap-label-score-bottom', 'wrap-label-score-top']);
  });
  it('places seven 3D panels', () =>
    expect(model().panels3D.map((p) => p.id).sort()).toEqual(['back', 'bottom', 'front', 'right', 'spine', 'spine-wall', 'top']));
  it('closes the cover on top of the page block', () => {
    const m = model();
    const pose = bookCoverPose(m, 1);
    expect(pose.position[1]).toBeCloseTo(35 / 2 + 1.5);
    expect(pose.position[0]).toBeCloseTo(m.outerDims.widthMm / 2 - 135 / 2);
    const q = new THREE.Quaternion(...pose.quaternion);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).y).toBeCloseTo(1); // outer face up
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).x).toBeCloseTo(1); // sheet-up toward the fore edge
    expect(m.panels3D.find((p) => p.id === 'top')!.closedPos[1]).toBeCloseTo(19);
  });
  it('lays the cover flat beside the back cover when unbent', () => {
    const m = model();
    const pose = bookCoverPose(m, 0);
    expect(pose.position[1]).toBeCloseTo(-(35 / 2 + 1.5));
    expect(pose.position[0]).toBeLessThan(-m.outerDims.widthMm / 2);
  });
  it('stands the cover upright half way', () => {
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...bookCoverPose(model(), 0.5).quaternion));
    expect(up.x).toBeCloseTo(0, 3);
    expect(up.y).toBeCloseTo(1, 3);
  });
  it('bends the spine from the back cover up to the front cover', () => {
    const m = model();
    const spine = m.panels3D.find((p) => p.id === 'spine')!;
    const end = bentPoint(spine.bend!.segments, spine.heightMm, 0);
    // In the spine's own frame: back where it started along its length, a full cover gap toward its inside.
    expect(end.y).toBeCloseTo(0);
    expect(end.z).toBeCloseTo(-38);
  });
  it('fits the closed walls and covers inside the reported outer size', () => {
    const m = model();
    for (const p of m.panels3D.filter((x) => !x.bend)) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation));
      for (const o of p.outlinePoints!) {
        for (const z of [-p.thicknessMm / 2, p.thicknessMm / 2]) {
          const v = new THREE.Vector3(o.x - p.widthMm / 2, -(o.y - p.heightMm / 2), z).applyQuaternion(q).add(new THREE.Vector3(...p.closedPos));
          expect(Math.abs(v.x), `${p.id} x`).toBeLessThanOrEqual(m.outerDims.widthMm / 2 + 0.01);
          expect(Math.abs(v.y), `${p.id} y`).toBeLessThanOrEqual(m.outerDims.heightMm / 2 + 0.01);
          expect(Math.abs(v.z), `${p.id} z`).toBeLessThanOrEqual(m.outerDims.depthMm / 2 + 0.01);
        }
      }
    }
  });
  it('stands the walls between the covers, on the page block', () => {
    const m = model();
    const l = L();
    const at = (id: string) => m.panels3D.find((p) => p.id === id)!.closedPos;
    expect(at('front')[2]).toBeCloseTo(170 / 2 + 1.5);
    expect(at('back')[2]).toBeCloseTo(-(170 / 2 + 1.5));
    expect(at('right')[0]).toBeCloseTo(l.innerX1 + 1.5);
    expect(at('spine-wall')[0]).toBeCloseTo(l.innerX0 - 1.5);
  });
  it('offers the covers and page walls as pattern faces', () =>
    expect([...model().patternFaceIds].sort()).toEqual(['back', 'bottom', 'front', 'right', 'top']));
  it('keeps a cover pattern inside the page block', () => {
    for (const face of ['top', 'bottom'] as const) {
      const m = model({ facePatterns: { [face]: { style: 'grid', cellMm: 10, barMm: 2, paddingMm: 4 } } });
      const wrap = panel(m, 'wrap');
      const holes = pathPts(wrap, (id) => id.includes(`-pattern-${face}-`));
      expect(holes.length).toBeGreaterThan(0);
      const y0 = face === 'top' ? 7 : wrap.heightMm - 7 - 120;
      for (const p of holes.flat()) {
        expect(p.x).toBeGreaterThanOrEqual(7);
        expect(p.x).toBeLessThanOrEqual(184 - 7);
        expect(p.y).toBeGreaterThanOrEqual(y0);
        expect(p.y).toBeLessThanOrEqual(y0 + 120);
      }
      const p3 = m.panels3D.find((p) => p.id === face)!;
      for (const h of p3.holeContours!.flat()) {
        expect(h.y).toBeGreaterThanOrEqual(0);
        expect(h.y).toBeLessThanOrEqual(135);
      }
    }
  });
  it('nests every piece on the sheet', () => {
    const m = model();
    expect(m.stats.panelCount).toBe(5);
    expect(m.stats.totalScoreLengthMm).toBeGreaterThan(0);
  });
});

describe('book artwork', () => {
  it('turns cover artwork to read with the spine on the left', () => {
    expect(bookFaceTurnDeg(book(), 'top')).toBe(-90);
    expect(bookFaceTurnDeg(book(), 'bottom')).toBe(-90);
    expect(bookFaceTurnDeg(book(), 'front')).toBe(0);
    expect(bookFaceTurnDeg({ templateId: 'finger-basic' }, 'top')).toBe(0);
  });
  it('gives artwork no spine face to land on', () => {
    const m = model();
    const art: FaceArtwork = { id: 'a', faceId: 'left', name: 'a', dataUrl: '', xMm: 0, yMm: 0, widthMm: 20, heightMm: 20, rotationDeg: 0, mode: 'engrave' };
    expect(resolveSheetArtworks(m.panels2D, [art])).toEqual([]);
    expect(m.panels3D.some((p) => p.id === 'left' || p.faceId === 'left')).toBe(false);
  });
  it('places cover artwork at the cover centre on the sheet', () => {
    const m = model();
    const art: FaceArtwork = { id: 'a', faceId: 'top', name: 'a', dataUrl: '', xMm: 0, yMm: 0, widthMm: 20, heightMm: 20, rotationDeg: 0, mode: 'engrave' };
    const [placed] = resolveSheetArtworks(m.panels2D, [art]);
    const c = toSheet(panel(m, 'wrap'), { x: 92, y: 67.5 });
    expect(placed.sheetCenterX).toBeCloseTo(c.x);
    expect(placed.sheetCenterY).toBeCloseTo(c.y);
  });
});
