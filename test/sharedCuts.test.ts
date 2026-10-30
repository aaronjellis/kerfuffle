import { describe, expect, it } from 'vitest';
import { generateBoxModel } from '../src/engine/boxGenerator';
import { shareCutEdges } from '../src/engine/sharedCuts';
import { BOX_TEMPLATES, DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import type { BoxPanel2D, Point2D } from '../src/engine/types';

/** Every straight cut segment on the sheet, in sheet coordinates. */
const segments = (panels: BoxPanel2D[]) =>
  panels.flatMap((p) =>
    p.paths
      .filter((x) => x.layer === 'cut')
      .flatMap((path) => {
        const out: [Point2D, Point2D][] = [];
        let start: Point2D | null = null;
        let prev: Point2D | null = null;
        for (const m of path.d.matchAll(/([MLZ])\s*(?:(-?[\d.]+)\s+(-?[\d.]+))?/g)) {
          if (m[1] === 'Z') {
            if (prev && start) out.push([prev, start]);
            continue;
          }
          const pt = { x: Number(m[2]) + p.sheetX, y: Number(m[3]) + p.sheetY };
          if (m[1] === 'M') start = pt;
          else if (prev) out.push([prev, pt]);
          prev = pt;
        }
        if (path.closed && prev && start && !/Z\s*$/.test(path.d)) out.push([prev, start]);
        return out;
      }),
  );

const onSegment = (p: Point2D, [a, b]: [Point2D, Point2D]) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y) < 1e-3;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  return Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y) < 1e-3;
};

describe('cutting shared edges once', () => {
  it('leaves the second of two touching rectangles open along their shared side', () => {
    const rect = (id: string, x: number): BoxPanel2D => ({
      id,
      name: id,
      faceLabel: id,
      widthMm: 10,
      heightMm: 20,
      safeRect: { x: 0, y: 0, width: 10, height: 20 },
      sheetX: x,
      sheetY: 0,
      paths: [{ id: `${id}-outline`, layer: 'cut', d: 'M 0 0 L 10 0 L 10 20 L 0 20 Z', closed: true }],
    });
    const { panels, savedMm } = shareCutEdges([rect('a', 0), rect('b', 10)]);
    expect(savedMm).toBeCloseTo(20, 9);
    expect(panels[0].paths[0]).toMatchObject({ closed: true, d: 'M 0 0 L 10 0 L 10 20 L 0 20 Z' });
    // B runs from its top-left round the far side to its bottom-left: one open run, left side gone.
    expect(panels[1].paths[0].closed).toBe(false);
    expect(panels[1].paths[0].d).toBe('M 0 0 L 10 0 L 10 20 L 0 20');
  });

  for (const template of BOX_TEMPLATES.filter((t) => t.category === 'wood-finger')) {
    it(`cuts every edge of the ${template.id} exactly once`, () => {
      const base = { ...DEFAULT_BOX_PARAMETERS, category: template.category, templateId: template.id };
      const shared = generateBoxModel({ ...base, shareCutLines: true });
      expect(shared.stats.sharedCutMm).toBeGreaterThan(50);
      // The same pieces in the shared layout's places, outlines whole.
      const whole = generateBoxModel(base).panels2D.map((p) => {
        const at = shared.panels2D.find((q) => q.id === p.id)!;
        return { ...p, sheetX: at.sheetX, sheetY: at.sheetY };
      });
      const kept = segments(shared.panels2D);
      // Every point along every original edge still lies on some cut...
      for (const [a, b] of segments(whole)) {
        for (const t of [0.1, 0.5, 0.9]) {
          const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          expect(kept.some((s) => onSegment(p, s))).toBe(true);
        }
      }
      // ...and no stretch is cut twice: no two kept segments overlap along a line.
      for (let i = 0; i < kept.length; i++) {
        const [a, b] = kept[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 0.01) continue;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const others = kept.filter((s, j) => j !== i && onSegment(mid, s) && onSegment(s[0], [a, b]) === onSegment(s[0], [a, b]));
        const collinear = others.filter(([c, d]) => Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)) < 1e-6);
        expect(collinear).toHaveLength(0);
      }
      // Saved length matches the drop in total cut.
      const off = generateBoxModel(base).stats.totalCutLengthMm;
      expect(off - shared.stats.totalCutLengthMm).toBeCloseTo(shared.stats.sharedCutMm, -1);
    });
  }

  it('leaves cardboard layouts and the default alone', () => {
    const card = { ...DEFAULT_BOX_PARAMETERS, category: 'cardboard-fold' as const, templateId: 'cardboard-mailer' as const };
    expect(generateBoxModel({ ...card, shareCutLines: true }).stats.sharedCutMm).toBe(0);
    expect(generateBoxModel(DEFAULT_BOX_PARAMETERS).stats.sharedCutMm).toBe(0);
  });
});
