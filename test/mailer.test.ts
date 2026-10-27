import { describe, expect, it } from 'vitest';
import { DEFAULT_BOX_PARAMETERS } from '../src/engine/presets';
import { applySideOverflow, computeMailerSpans } from '../src/engine/mailerEngine';

const base = { ...DEFAULT_BOX_PARAMETERS, category: 'cardboard-fold' as const, templateId: 'cardboard-mailer' as const };

describe('mailer ply model', () => {
  for (const T of [1.5, 3]) {
    it(`spans follow the ply table at T=${T}`, () => {
      const s = computeMailerSpans({ ...base, materialThicknessMm: T, includeLidFlaps: true }, 110, 80, 55);
      expect(s.roll).toBeCloseTo(2 * T);
      expect(s.floorW).toBeCloseTo(110 + T + 4 * T + 2 * T);
      expect(s.floorD).toBeCloseTo(80 + 2 * T);
      expect(s.backH).toBeCloseTo(55 + T);
      expect(s.frontH).toBeCloseTo(55 + T / 2);
      expect(s.outerSideH).toBeCloseTo(55);
      expect(s.innerSideH).toBeCloseTo(55 - T / 2);
      expect(s.lidD).toBeCloseTo(80 + 3 * T);
      expect(s.tuckW).toBeCloseTo(110 - 2 * T);
      expect(s.lidFlapDepth).toBeCloseTo(55 - T);
      expect(s.earBackH).toBeCloseTo(55 - 2 * T);
      expect(s.earFrontH).toBeCloseTo(55 + T / 2 - 3 * T);
      expect(s.tab.chamferEff).toBeCloseTo(4);
      expect(s.slot.centerFromCrease).toBeCloseTo(2 * T);
      expect(s.slot.inset).toBeCloseTo(2 * T - (T + 0.5) / 2);
      expect(s.slot.width).toBeCloseTo(T + 0.5);
      expect(s.tab.depth).toBeCloseTo(T + 5);
    });
  }
  it('roll stays 2T with lid flaps off and the floor narrows by 2T', () => {
    const s = computeMailerSpans({ ...base, includeLidFlaps: false }, 110, 80, 55);
    expect(s.roll).toBeCloseTo(2 * s.T);
    expect(s.floorW).toBeCloseTo(110 + s.T + 4 * s.T);
    expect(s.lidFlapDepth).toBe(0);
  });
  it('front lock has tabs and slits; tuck top has a notch instead', () => {
    const lock = computeMailerSpans({ ...base, cardboardLockStyle: 'front-lock' }, 110, 80, 55);
    expect(lock.lock).toEqual({ tabW: 9, tabLen: 30, slitLen: 31 }); // tabW = roll 6 + T 3
    expect(lock.notchR).toBe(0);
    const tuck = computeMailerSpans({ ...base, cardboardLockStyle: 'tuck', thumbNotch: true }, 110, 80, 55);
    expect(tuck.lock).toBeNull();
    expect(tuck.notchR).toBeCloseTo(Math.min(12, 110 / 8));
  });
  it('keeps a shallow box printable: tab shallower than the inner wall', () => {
    const s = computeMailerSpans({ ...base, materialThicknessMm: 3 }, 60, 60, 15);
    expect(s.innerSideH).toBeCloseTo(13.5);
    expect(s.tab.depth).toBeCloseTo(8); // T + 5, under innerSideH - 2 = 11.5
  });
  it('floors the inner wall at 8 and clamps the tab to fit it', () => {
    const s = computeMailerSpans({ ...base, materialThicknessMm: 3 }, 60, 60, 8);
    expect(s.innerSideH).toBeCloseTo(8); // H - T/2 would be 6.5
    expect(s.tab.depth).toBeCloseTo(6); // innerSideH - 2
  });
  it('lays out the default box', () => {
    const s = computeMailerSpans({ ...base, materialThicknessMm: 3, includeLidFlaps: true }, 110, 80, 55);
    expect(s.x.tabL).toBe(0);
    expect(s.x.innerL).toBeCloseTo(8);
    expect(s.x.rollL).toBeCloseTo(61.5);
    expect(s.x.outerL).toBeCloseTo(67.5);
    expect(s.x.floorL).toBeCloseTo(122.5);
    expect(s.x.floorR).toBeCloseTo(253.5);
    expect(s.x.outerR).toBeCloseTo(308.5);
    expect(s.x.rollR).toBeCloseTo(314.5);
    expect(s.x.innerR).toBeCloseTo(368);
    expect(s.x.tabR).toBeCloseTo(376);
    expect(s.blankW).toBeCloseTo(376);
    expect(s.tuckH).toBeCloseTo(30);
    expect(s.y.tuckTop).toBe(0);
    expect(s.y.lidTop).toBeCloseTo(30);
    expect(s.y.backTop).toBeCloseTo(30 + 89);
    expect(s.y.floorTop).toBeCloseTo(30 + 89 + 58);
    expect(s.y.frontTop).toBeCloseTo(30 + 89 + 58 + 86);
    expect(s.y.frontBottom).toBeCloseTo(30 + 89 + 58 + 86 + 56.5);
    expect(s.blankH).toBeCloseTo(30 + 89 + 58 + 86 + 56.5);
    expect(s.tuckR).toBeCloseTo(8);
    expect(s.earW).toBeCloseTo(37);
    expect(s.earBackH).toBeCloseTo(49);
    expect(s.lidFlapLen).toBeCloseTo(77); // D - T
    expect(s.tab.len).toBeCloseTo(12);
    expect(s.tab.centers).toEqual([0.25, 0.75]);
  });
  it('cuts one centred side tab when asked', () => {
    const s = computeMailerSpans({ ...base, sideTabCount: 1 }, 110, 80, 55);
    expect(s.tab.centers).toEqual([0.5]);
    expect(s.tab.len).toBeCloseTo(12);
  });
  it('treats the side tab length as a ceiling', () => {
    const s = computeMailerSpans({ ...base, sideTabLenMm: 40 }, 110, 80, 55);
    // Two tabs in a 77 mm inner wall: (77 - 2*2 - 4) / 2.
    expect(s.tab.len).toBeCloseTo(34.5);
    expect(s.tab.centers).toHaveLength(2);
  });
  it('turns the thumb notch off when asked', () => {
    const s = computeMailerSpans({ ...base, cardboardLockStyle: 'tuck', thumbNotch: false }, 110, 80, 55);
    expect(s.notchR).toBe(0);
  });
  it('caps the lock tab at the room that fits on a thin board', () => {
    // T = 1.5: roll 3, room = roll + T = 4.5, which is under the 8 mm floor.
    const s = computeMailerSpans({ ...base, materialThicknessMm: 1.5, cardboardLockStyle: 'front-lock' }, 110, 80, 55);
    expect(s.lock?.tabW).toBeCloseTo(4.5);
  });
});

describe('applySideOverflow', () => {
  const x = { tabL: 0, innerL: 5, rollL: 8, outerL: 10, floorL: 12, floorR: 50, outerR: 52, rollR: 54, innerR: 57, tabR: 62 };
  it('leaves the layout alone when nothing overhangs', () => {
    const r = applySideOverflow(x, 12);
    expect(r.x).toEqual(x);
    expect(r.blankW).toBe(62);
  });
  it('shifts every x right by the left overflow and widens blankW by both sides', () => {
    // reach 30: left overflow 18, right overflow = 50 + 30 - 62 = 18
    const r = applySideOverflow(x, 30);
    for (const k of Object.keys(x) as (keyof typeof x)[]) expect(r.x[k]).toBeCloseTo(x[k] + 18);
    expect(Math.min(...Object.values(r.x))).toBeGreaterThanOrEqual(0);
    expect(r.x.floorL - 30).toBeCloseTo(0);
    expect(r.blankW).toBeCloseTo(62 + 18 + 18);
    expect(r.x.floorR + 30).toBeCloseTo(r.blankW);
  });
});

import { generateBoxModel } from '../src/engine/boxGenerator';
import * as THREE from 'three';
import type { Panel3DTransform } from '../src/engine/types';

describe('mailer 2D sheet', () => {
  const model = (over = {}) => generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: 1.5, ...over });
  const paths = (m: ReturnType<typeof generateBoxModel>) => m.panels2D[0].paths;
  it('cuts two slots per side under the inner wall landing line', () => {
    const m = model();
    const s = computeMailerSpans(m.params, 110, 80, 55);
    const slots = paths(m).filter((p) => p.id.startsWith('mailer-slot-'));
    expect(slots).toHaveLength(4);
    const left1 = slots.find((p) => p.id === 'mailer-slot-l-1')!;
    const xs = left1.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 0).map(Number);
    expect(Math.min(...xs)).toBeCloseTo(s.x.floorL + s.slot.inset, 1);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(s.slot.width, 1);
  });
  it('front lock cuts a slit along each front ear crease and no notch', () => {
    const m = model({ cardboardLockStyle: 'front-lock' });
    const s = computeMailerSpans(m.params, 110, 80, 55);
    const slit = paths(m).find((p) => p.id === 'mailer-slit-l')!;
    expect(slit.layer).toBe('cut');
    const ys = slit.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 1).map(Number);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(s.lock!.slitLen - 1.5 * s.T, 1);
    expect(Math.max(...ys)).toBeCloseTo(s.y.frontBottom - 1.5 * s.T, 1);
    const earScore = paths(m).find((p) => p.id === 'score-ear-front-l')!;
    const eys = earScore.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 1).map(Number);
    expect(Math.max(...eys)).toBeLessThanOrEqual(s.y.frontBottom - s.lock!.slitLen + 0.01);
    expect(paths(m).find((p) => p.id === 'score-tuck')).toBeTruthy();
  });
  it('tuck top has no slits and the perimeter carries an arc for the notch', () => {
    const m = model({ cardboardLockStyle: 'tuck', thumbNotch: true });
    expect(paths(m).some((p) => p.id.startsWith('mailer-slit-'))).toBe(false);
    expect(paths(m).find((p) => p.id === 'mailer-perimeter-cut')!.d).toMatch(/A /);
  });
  it('lid flaps add two creases and widen the blank; off removes them', () => {
    const on = model({ includeLidFlaps: true });
    const off = model({ includeLidFlaps: false });
    expect(paths(on).some((p) => p.id === 'score-lid-flap-l')).toBe(true);
    expect(paths(off).some((p) => p.id === 'score-lid-flap-l')).toBe(false);
    expect(on.panels2D[0].widthMm).toBeGreaterThan(off.panels2D[0].widthMm);
  });
  it('narrow front-lock box keeps tabs inside the lid width', () => {
    const m = model({ widthMm: 30, cardboardLockStyle: 'front-lock' });
    const s = computeMailerSpans(m.params, 30, 80, 55);
    expect(s.tuckW + 2 * s.lock!.tabW).toBeLessThanOrEqual(s.floorW + 0.01);
  });
  it('short depth keeps the two floor tabs apart', () => {
    const s = computeMailerSpans({ ...base, depthMm: 40 }, 110, 40, 55);
    const gap = (s.tab.centers[1] - s.tab.centers[0]) * s.floorD - s.tab.len;
    expect(gap).toBeGreaterThanOrEqual(2);
  });
  it('low front-lock box clamps the slit so the front ear crease stays attached', () => {
    const m = model({ cardboardLockStyle: 'front-lock', heightMm: 15, materialThicknessMm: 3, scoreLineMode: 'solid-score' });
    const s = computeMailerSpans(m.params, 110, 80, 15);
    expect(s.lock!.slitLen).toBeLessThanOrEqual(s.frontH - 1.5 * s.T - 3 + 1e-9);
    const earScore = paths(m).find((p) => p.id === 'score-ear-front-l')!;
    const eys = earScore.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 1).map(Number);
    expect(Math.max(...eys) - Math.min(...eys)).toBeGreaterThanOrEqual(3 - 1e-6);
  });
  it('thin board degrades a front lock to a tuck top and says so', () => {
    const m = model({ cardboardLockStyle: 'front-lock', materialThicknessMm: 0.6, thumbNotch: true });
    const s = computeMailerSpans(m.params, 110, 80, 55);
    expect(s.lock).toBeNull();
    expect(s.lockNote).toMatch(/too thin/);
    expect(s.notchR).toBeCloseTo(Math.min(12, 110 / 8));
    expect(paths(m).some((p) => p.id.startsWith('mailer-slit-'))).toBe(false);
    const earScore = paths(m).find((p) => p.id === 'score-ear-front-l')!;
    const eys = earScore.d.match(/-?\d+(\.\d+)?/g)!.filter((_, i) => i % 2 === 1).map(Number);
    // Full length: frontH less an ear inset (1.5T) at each end.
    expect(Math.max(...eys) - Math.min(...eys)).toBeCloseTo(55 + 0.3 - 2 * 1.5 * 0.6, 2);
    expect(m.stats.fingerCountSummary).toMatch(/tuck top \(board too thin for lock ears\)/);
  });
  it('low box degrades a front lock to a tuck top and says so (T 8, H 15)', () => {
    const m = model({ cardboardLockStyle: 'front-lock', materialThicknessMm: 8, heightMm: 15 });
    const s = computeMailerSpans(m.params, 110, 80, 15);
    expect(s.lock).toBeNull();
    expect(s.lockNote).toBe('box too low for lock ears');
    expect(paths(m).some((p) => p.id.startsWith('mailer-slit-'))).toBe(false);
    expect(m.stats.fingerCountSummary).toContain('tuck top (box too low for lock ears)');
  });
  it('summary names the effective closure and ear width', () => {
    const m = model({ cardboardLockStyle: 'front-lock', materialThicknessMm: 1.5 });
    expect(m.stats.fingerCountSummary).toContain('front lock, 4.5 mm ears');
    expect(computeMailerSpans(m.params, 110, 80, 55).lockNote).toBeNull();
  });
  it('perforated mode survives a crease shorter than one perforation', () => {
    const m = model({ cardboardLockStyle: 'front-lock', scoreLineMode: 'dashed-perf', perfCutMm: 3, perfGapMm: 1.5, heightMm: 15 });
    expect(m.panels2D[0].paths.every((p) => typeof p.d === 'string')).toBe(true);
  });
});

/** Endpoints of M/L/Q/A commands, skipping control points and arc parameters. */
function parsePathVertices(d: string): { x: number; y: number }[] {
  const tokens = d.match(/[MLQAZ]|-?\d+(\.\d+)?/g) ?? [];
  const take: Record<string, number> = { M: 2, L: 2, Q: 4, A: 7 };
  const out: { x: number; y: number }[] = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'Z') continue;
    const n = take[cmd];
    const args = tokens.slice(i, i + n).map(Number);
    out.push({ x: args[n - 2], y: args[n - 1] });
    i += n;
  }
  return out;
}

describe('mailer sheet creases and insets', () => {
  /** Endpoints of a solid score path: [x1, y1, x2, y2]. */
  const score = (m: ReturnType<typeof generateBoxModel>, id: string) => {
    const p = m.panels2D[0].paths.find((q) => q.id === id);
    if (!p) throw new Error(`no ${id}`);
    const [x1, y1, x2, y2] = parsePathVertices(p.d).flatMap((v) => [v.x, v.y]);
    return { x1, y1, x2, y2, xLen: Math.abs(x2 - x1), yLen: Math.abs(y2 - y1) };
  };
  const W = 110;
  const D = 80;
  const H = 55;
  for (const T of [1.5, 3]) {
    // Expected values come straight from the ply table, never from computeMailerSpans.
    const sheet = (over = {}) =>
      generateBoxModel({
        ...base,
        widthMm: W,
        depthMm: D,
        heightMm: H,
        materialThicknessMm: T,
        cardboardLockStyle: 'front-lock',
        includeLidFlaps: true,
        scoreLineMode: 'solid-score',
        ...over,
      });
    const m = sheet();
    const sc = (id: string) => score(m, id);
    const rows: [string, () => number, number][] = [
      ['tuck flap height: free edge to score-tuck', () => sc('score-tuck').y1, Math.min(30, H - T)],
      ['tuck flap width along score-tuck', () => sc('score-tuck').xLen, W - 2 * T],
      ['lid: score-tuck to score-lid-back', () => sc('score-lid-back').y1 - sc('score-tuck').y1, D + 3 * T],
      ['back wall: score-lid-back to score-back-floor', () => sc('score-back-floor').y1 - sc('score-lid-back').y1, H + T],
      ['floor depth: score-back-floor to score-floor-front', () => sc('score-floor-front').y1 - sc('score-back-floor').y1, D + 2 * T],
      ['front wall: score-floor-front to the bottom edge', () => m.panels2D[0].heightMm - sc('score-floor-front').y1, H + T / 2],
      ['floor width: floor side creases', () => sc('score-floor-side-r').x1 - sc('score-floor-side-l').x1, W + T + 4 * T + 2 * T],
      ['floor width along score-back-floor', () => sc('score-back-floor').xLen, W + 7 * T],
      ['outer side wall: score-floor-side-l to score-roll-l-1', () => sc('score-floor-side-l').x1 - sc('score-roll-l-1').x1, H],
      ['roll left: score-roll-l-1 to score-roll-l-2', () => sc('score-roll-l-1').x1 - sc('score-roll-l-2').x1, 2 * T],
      ['roll right: score-roll-r-1 to score-roll-r-2', () => sc('score-roll-r-2').x1 - sc('score-roll-r-1').x1, 2 * T],
      ['roll strip y-extent (rollLen)', () => sc('score-roll-l-1').yLen, D],
      ['roll strip starts T below score-back-floor', () => sc('score-roll-l-1').y1 - sc('score-back-floor').y1, T],
      ['inner wall y-extent (innerSideLen)', () => sc('score-roll-l-2').yLen, D - T],
      ['inner wall starts 1.5T below score-back-floor', () => sc('score-roll-l-2').y1 - sc('score-back-floor').y1, 1.5 * T],
      ['back ear crease y-extent', () => sc('score-ear-back-l').yLen, H - 2 * T],
      ['back ear crease starts 1.5T below score-lid-back', () => sc('score-ear-back-l').y1 - sc('score-lid-back').y1, 1.5 * T],
      ['front ear crease starts 1.5T below score-floor-front', () => sc('score-ear-front-l').y1 - sc('score-floor-front').y1, 1.5 * T],
      ['lid flap crease length', () => sc('score-lid-flap-l').yLen, D - T],
      ['lid flap set back 2T from score-tuck', () => sc('score-lid-flap-l').y1 - sc('score-tuck').y1, 2 * T],
    ];
    for (const [name, got, want] of rows) {
      it(`T=${T}: ${name}`, () => expect(got()).toBeCloseTo(want, 3));
    }
    it(`T=${T}: inner wall reaches innerSideH past score-roll-l-2 on the perimeter`, () => {
      const vs = parsePathVertices(m.panels2D[0].paths.find((p) => p.id === 'mailer-perimeter-cut')!.d);
      const innerEdgeX = sc('score-roll-l-2').x1 - (H - T / 2);
      const y0 = sc('score-roll-l-2').y1;
      expect(vs.some((v) => Math.abs(v.x - innerEdgeX) < 1e-3 && Math.abs(v.y - y0) < 1e-3)).toBe(true);
    });
    it(`T=${T}: front ear crease runs frontH − 2·earInset on a tuck top`, () => {
      const tuck = sheet({ cardboardLockStyle: 'tuck' });
      expect(score(tuck, 'score-ear-front-l').yLen).toBeCloseTo(H + T / 2 - 3 * T, 3);
    });
    it(`T=${T}: front-lock ear crease stops where the slit starts`, () => {
      const slit = parsePathVertices(m.panels2D[0].paths.find((p) => p.id === 'mailer-slit-l')!.d);
      const ear = sc('score-ear-front-l');
      expect(Math.min(...slit.map((v) => v.y))).toBeCloseTo(ear.y2, 3);
      expect(Math.max(...slit.map((v) => v.y))).toBeCloseTo(m.panels2D[0].heightMm - 1.5 * T, 3);
    });
    it(`T=${T}: tuck height takes H − T when that is under tuckFlapMm (H 20)`, () => {
      const low = sheet({ heightMm: 20 });
      expect(score(low, 'score-tuck').y1).toBeCloseTo(20 - T, 3);
    });
  }
});

describe('mailer perimeter geometry', () => {
  const m = generateBoxModel({
    ...base,
    widthMm: 110,
    depthMm: 80,
    heightMm: 55,
    materialThicknessMm: 1.5,
    cardboardLockStyle: 'front-lock',
    includeLidFlaps: true,
  });
  const s = computeMailerSpans(m.params, 110, 80, 55);
  const sheetPaths = m.panels2D[0].paths;
  const vs = parsePathVertices(sheetPaths.find((p) => p.id === 'mailer-perimeter-cut')!.d);
  const has = (x: number, y: number, tol = 0.01) => vs.some((v) => Math.abs(v.x - x) <= tol && Math.abs(v.y - y) <= tol);

  it('closes on its starting vertex', () => {
    const first = vs[0];
    const last = vs[vs.length - 1];
    expect(Math.abs(first.x - last.x)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(first.y - last.y)).toBeLessThanOrEqual(1e-6);
  });
  it('mirrors left to right', () => {
    for (const v of vs) expect(has(s.blankW - v.x, v.y)).toBe(true);
  });
  it('puts the lid flap lead-in chamfer at the front end', () => {
    const fx = s.x.floorR + s.lidFlapDepth;
    const fy0 = s.y.lidTop + 2 * s.T;
    expect(has(fx - 4, fy0)).toBe(true);
    expect(has(fx, fy0 + 4)).toBe(true);
    expect(has(fx - 4, fy0 + s.lidFlapLen)).toBe(false);
  });
  it('drops the lock tab root by tabW · tan 15°', () => {
    const tx0 = s.x.floorL + (s.floorW - s.tuckW) / 2;
    const drop = s.lock!.tabW * Math.tan((15 * Math.PI) / 180);
    expect(has(tx0 - s.lock!.tabW, s.y.lidTop - drop)).toBe(true);
    expect(has(tx0, s.y.lidTop)).toBe(true);
  });
  it('centres each inner-wall tab on its floor slot', () => {
    const tabYs = vs.filter((v) => Math.abs(v.x - s.x.tabR) < 0.01).map((v) => v.y).sort((a, b) => a - b);
    expect(tabYs).toHaveLength(4);
    const tabCenters = [(tabYs[0] + tabYs[1]) / 2, (tabYs[2] + tabYs[3]) / 2];
    [1, 2].forEach((n, i) => {
      const ys = parsePathVertices(sheetPaths.find((p) => p.id === `mailer-slot-r-${n}`)!.d).map((v) => v.y);
      expect(tabCenters[i]).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 6);
    });
  });
});

type V = { x: number; y: number };
/** Pairs of perimeter segments (curves taken as chords) that cross, touch, or fold back on a neighbour. */
function selfIntersections(d: string): [number, number][] {
  const raw = parsePathVertices(d);
  const vs = raw.filter((v, i) => i === 0 || Math.hypot(v.x - raw[i - 1].x, v.y - raw[i - 1].y) > 1e-9);
  if (Math.hypot(vs[0].x - vs[vs.length - 1].x, vs[0].y - vs[vs.length - 1].y) <= 1e-9) vs.pop();
  const n = vs.length;
  const seg = (i: number): [V, V] => [vs[i], vs[(i + 1) % n]];
  const cross = (o: V, a: V, b: V) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const distToSeg = (p: V, a: V, b: V) => {
    const L = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  };
  const hits: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    // Neighbours that fold straight back on each other overlap along their length.
    const [a, b] = seg(i);
    const [, c] = seg((i + 1) % n);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (Math.abs(cross(a, b, c)) < 1e-6 && dot < 0) hits.push([i, (i + 1) % n]);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // closing neighbours
      const [a, b] = seg(i);
      const [c, e] = seg(j);
      const d1 = cross(c, e, a), d2 = cross(c, e, b), d3 = cross(a, b, c), d4 = cross(a, b, e);
      const proper = d1 * d2 < 0 && d3 * d4 < 0 && Math.abs(d1) > 1e-6 && Math.abs(d2) > 1e-6 && Math.abs(d3) > 1e-6 && Math.abs(d4) > 1e-6;
      const tol = 1e-4;
      const touch = distToSeg(a, c, e) < tol || distToSeg(b, c, e) < tol || distToSeg(c, a, b) < tol || distToSeg(e, a, b) < tol;
      if (proper || touch) hits.push([i, j]);
    }
  }
  return hits;
}

describe('mailer small boxes', () => {
  const perimeter = (m: ReturnType<typeof generateBoxModel>) => m.panels2D[0].paths.find((p) => p.id === 'mailer-perimeter-cut')!.d;
  const cases = [
    { W: 60, D: 25, H: 30, T: 1.5, tabs: 1 },
    { W: 60, D: 25, H: 30, T: 3, tabs: 1 },
    { W: 60, D: 40, H: 30, T: 6, tabs: 2 },
  ];
  for (const { W, D, H, T, tabs } of cases) {
    describe(`W${W} D${D} H${H} T${T}`, () => {
      const m = generateBoxModel({ ...base, widthMm: W, depthMm: D, heightMm: H, materialThicknessMm: T, includeLidFlaps: true });
      const s = computeMailerSpans(m.params, W, D, H);
      const sheetPaths = m.panels2D[0].paths;
      const slots = sheetPaths
        .filter((p) => p.id.startsWith('mailer-slot-'))
        .map((p) => {
          const vs = parsePathVertices(p.d);
          const xs = vs.map((v) => v.x);
          const ys = vs.map((v) => v.y);
          return { id: p.id, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
        });
      // Tab root corners: perimeter vertices on the right inner wall's free-edge line within the floor row,
      // less the inner wall's own two end corners.
      const earInset = 1.5 * T;
      const wallY0 = s.y.floorTop + earInset;
      const wallY1 = s.y.frontTop - earInset;
      const tabEdges = parsePathVertices(perimeter(m))
        .filter((v) => Math.abs(v.x - s.x.innerR) < 1e-3 && v.y > s.y.floorTop && v.y < s.y.frontTop)
        .filter((v) => Math.abs(v.y - wallY0) > 1e-3 && Math.abs(v.y - wallY1) > 1e-3)
        .map((v) => v.y)
        .sort((a, b) => a - b);

      it(`cuts ${tabs} tab(s) and ${tabs} slot(s) per side`, () => {
        expect(s.tab.centers).toHaveLength(tabs);
        expect(tabEdges).toHaveLength(2 * tabs);
        expect(slots).toHaveLength(2 * tabs);
      });
      it('keeps each tab inside the inner wall with 2 mm end margins and 4 mm between tabs', () => {
        expect(tabEdges[0] - s.y.floorTop).toBeGreaterThanOrEqual(earInset + 2 - 1e-6);
        expect(s.y.frontTop - tabEdges[tabEdges.length - 1]).toBeGreaterThanOrEqual(earInset + 2 - 1e-6);
        for (let i = 2; i < tabEdges.length; i += 2) expect(tabEdges[i] - tabEdges[i - 1]).toBeGreaterThanOrEqual(4 - 1e-6);
      });
      it('keeps the slots inside the floor and apart', () => {
        for (const r of slots) {
          expect(r.x0).toBeGreaterThan(s.x.floorL);
          expect(r.x1).toBeLessThan(s.x.floorR);
          expect(r.y0).toBeGreaterThan(s.y.floorTop);
          expect(r.y1).toBeLessThan(s.y.frontTop);
        }
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            const [a, b] = [slots[i], slots[j]];
            const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
            expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
          }
        }
      });
      it('perimeter does not cross itself', () => {
        expect(selfIntersections(perimeter(m))).toEqual([]);
      });
    });
  }
  it('default box keeps two 12 mm tabs at 0.25 and 0.75 and a clean perimeter', () => {
    const m = generateBoxModel({ ...base });
    const s = computeMailerSpans(m.params, 110, 80, 55);
    expect(s.tab.len).toBeCloseTo(12);
    expect(s.tab.centers).toEqual([0.25, 0.75]);
    expect(selfIntersections(perimeter(m))).toEqual([]);
  });
  it('narrow tuck top (W 20, T 3) keeps the tuck flap corners apart', () => {
    const m = generateBoxModel({ ...base, widthMm: 20, materialThicknessMm: 3, cardboardLockStyle: 'tuck' });
    const s = computeMailerSpans(m.params, 20, 80, 55);
    expect(s.tuckR).toBeLessThanOrEqual(s.tuckW / 2 + 1e-9);
    expect(selfIntersections(perimeter(m))).toEqual([]);
  });
});

describe('mailer 3D rig', () => {
  const closed = (m: ReturnType<typeof generateBoxModel>, id: string) => m.panels3D.find((p) => p.id === id)!;
  it('folds to the typed inner size at T=1.5 and T=3', () => {
    for (const T of [1.5, 3]) {
      for (const includeLidFlaps of [false, true]) {
        const m = generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: T, includeLidFlaps });
        const li = closed(m, 'left-roll-inner'), ri = closed(m, 'right-roll-inner');
        // With lid flaps the inner walls stand T further out; the flaps tuck inside them.
        expect(ri.closedPos[0] - li.closedPos[0] - T).toBeCloseTo(includeLidFlaps ? 110 + 2 * T : 110, 1);
        const back = closed(m, 'back'), tuck = closed(m, 'tuck-flap');
        expect(tuck.closedPos[2] - T / 2 - (back.closedPos[2] + T / 2)).toBeCloseTo(80, 1);
        const floor = closed(m, 'bottom'), top = closed(m, 'top');
        expect(top.closedPos[1] - T / 2 - (floor.closedPos[1] + T / 2)).toBeCloseTo(55, 1);
        // The inner walls' free edges land on the floor top.
        for (const w of [li, ri]) {
          expect(Math.abs(w.closedPos[1] - w.heightMm / 2 - (floor.closedPos[1] + T / 2))).toBeLessThan(0.01);
        }
        if (includeLidFlaps) {
          const innerWallFace = Math.abs(ri.closedPos[0]) - T / 2;
          for (const id of ['lid-flap-l', 'lid-flap-r']) {
            const fx = Math.abs(closed(m, id).closedPos[0]);
            expect(Math.abs(fx - T / 2 - 55)).toBeLessThan(0.01);
            expect(Math.abs(fx + T / 2 - innerWallFace)).toBeLessThan(0.01);
          }
        }
      }
    }
  });
  it('centres every floor slot on the inner wall above it, flaps on and off', () => {
    for (const T of [1.5, 3]) {
      for (const includeLidFlaps of [false, true]) {
        const m = generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: T, includeLidFlaps });
        const floor = closed(m, 'bottom');
        const innerX = [closed(m, 'left-roll-inner').closedPos[0], closed(m, 'right-roll-inner').closedPos[0]];
        for (const hole of floor.holeContours!) {
          const xs = hole.map((p) => p.x - floor.widthMm / 2);
          const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
          expect(Math.min(...innerX.map((x) => Math.abs(x - cx)))).toBeLessThan(0.01);
        }
      }
    }
  });
  it('cuts four slots through the floor and puts tabs on the inner walls', () => {
    const m = generateBoxModel({ ...base });
    expect(closed(m, 'bottom').holeContours).toHaveLength(4);
    const inner = closed(m, 'left-roll-inner');
    const maxY = Math.max(...inner.outlinePoints!.map((p) => p.y));
    expect(maxY).toBeGreaterThan(inner.heightMm + 1);
  });
  it('sets the lid flaps back so the front-lock ears clear them', () => {
    for (const T of [1.5, 3]) {
      const m = generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: T, includeLidFlaps: true, cardboardLockStyle: 'front-lock' });
      const tuck = closed(m, 'tuck-flap');
      const ears = [tuck.closedPos[2] - T / 2, tuck.closedPos[2] + T / 2];
      expect(Math.abs(ears[0] - (40 - T / 2))).toBeLessThan(0.01);
      for (const id of ['lid-flap-l', 'lid-flap-r']) {
        const f = closed(m, id);
        const z = [f.closedPos[2] - f.widthMm / 2, f.closedPos[2] + f.widthMm / 2];
        expect(Math.abs(z[0] - (-40 + T / 2))).toBeLessThan(0.01);
        expect(Math.abs(z[1] - (40 - T / 2))).toBeLessThan(0.01);
        expect(Math.min(z[1], ears[1]) - Math.max(z[0], ears[0])).toBeLessThanOrEqual(0.01);
      }
    }
  });
  it('adds lid flaps as children of the lid, and drops them when off', () => {
    const on = generateBoxModel({ ...base, includeLidFlaps: true, cardboardLockStyle: 'front-lock' });
    expect(closed(on, 'lid-flap-l').foldRig?.parentId).toBe('top');
    const off = generateBoxModel({ ...base, includeLidFlaps: false, cardboardLockStyle: 'tuck' });
    expect(off.panels3D.some((p) => p.id.startsWith('lid-flap-'))).toBe(false);
  });
  it('carries the front-lock ears on the tuck flap outline, with no separate lock-tab panels', () => {
    for (const cardboardLockStyle of ['front-lock', 'tuck'] as const) {
      for (const includeLidFlaps of [false, true]) {
        const m = generateBoxModel({ ...base, cardboardLockStyle, includeLidFlaps });
        const s = computeMailerSpans(m.params, m.params.widthMm, m.params.depthMm, m.params.heightMm);
        expect(m.panels3D.some((p) => p.id.startsWith('lock-tab-'))).toBe(false);
        const xs = closed(m, 'tuck-flap').outlinePoints!.map((p) => p.x);
        const expected = cardboardLockStyle === 'front-lock' ? s.tuckW + 2 * s.lock!.tabW : s.tuckW;
        expect(Math.abs(Math.max(...xs) - Math.min(...xs) - expected)).toBeLessThan(0.01);
      }
    }
  });
  it('drops each inner-wall tab onto its floor slot in z', () => {
    for (const includeLidFlaps of [false, true]) {
      const m = generateBoxModel({ ...base, includeLidFlaps });
      const floor = closed(m, 'bottom');
      const toWorld = (p: Panel3DTransform, x: number, y: number) =>
        new THREE.Vector3(x - p.widthMm / 2, -(y - p.heightMm / 2), 0)
          .applyEuler(new THREE.Euler(...p.rotation))
          .add(new THREE.Vector3(...p.closedPos));
      const holeZ = floor.holeContours!.map((h) => {
        const ys = h.map((q) => q.y);
        return toWorld(floor, 0, (Math.min(...ys) + Math.max(...ys)) / 2).z;
      });
      for (const id of ['left-roll-inner', 'right-roll-inner']) {
        const w = closed(m, id);
        const tip = w.outlinePoints!.filter((q) => q.y > w.heightMm + 0.01);
        expect(tip).toHaveLength(8);
        for (let i = 0; i < tip.length; i += 4) {
          const xs = tip.slice(i, i + 4).map((q) => q.x);
          const z = toWorld(w, (Math.min(...xs) + Math.max(...xs)) / 2, w.heightMm).z;
          expect(Math.min(...holeZ.map((hz) => Math.abs(hz - z)))).toBeLessThan(0.01);
        }
      }
    }
  });
  it('every child names an existing parent and stages lie in 0..1', () => {
    const m = generateBoxModel({ ...base, cardboardLockStyle: 'front-lock' });
    const ids = new Set(m.panels3D.map((p) => p.id));
    for (const p of m.panels3D) {
      if (p.foldRig?.parentId) expect(ids.has(p.foldRig.parentId)).toBe(true);
      if (p.foldRig) expect(p.foldRig.stage[0]).toBeLessThan(p.foldRig.stage[1]);
    }
  });
  it('lays flat like the sheet: ears, lid, lid flaps and tuck flap meet their creases', () => {
    for (const T of [1.5, 3]) {
      const m = generateBoxModel({ ...base, widthMm: 110, depthMm: 80, heightMm: 55, materialThicknessMm: T, includeLidFlaps: true });
      const s = computeMailerSpans(m.params, 110, 80, 55);
      const flat = (id: string) => closed(m, id).explodedPos;
      const zBack = -s.floorD / 2;
      expect(flat('back-dust-r')[0]).toBeCloseTo(s.floorW / 2 + s.earW / 2, 6);
      expect(flat('front-dust-l')[0]).toBeCloseTo(-(s.floorW / 2 + s.earW / 2), 6);
      expect(flat('top')[2]).toBeCloseTo(zBack - s.backH - s.lidD / 2, 6);
      expect(flat('lid-flap-r')[0]).toBeCloseTo(s.floorW / 2 + s.lidFlapDepth / 2, 6);
      expect(flat('tuck-flap')[2]).toBeCloseTo(zBack - s.backH - s.lidD - s.tuckH / 2, 6);
    }
  });
});

describe('other cardboard templates', () => {
  const inner = { widthMm: 120, depthMm: 80, heightMm: 50 };
  const wallIds = {
    'cardboard-tuck-carton': { left: 'left', right: 'right', front: 'front', back: 'back' },
    'cardboard-telescope': { left: 'base-left', right: 'base-right', front: 'base-front', back: 'base-back' },
  } as const;
  it('telescope glue tabs are cut as on the sheet and sit inside the side walls', () => {
    const T = 3;
    const m = generateBoxModel({ ...base, ...inner, templateId: 'cardboard-telescope', materialThicknessMm: T });
    const byId = (id: string) => m.panels3D.find((p) => p.id === id)!;
    const span = inner.widthMm + T;
    // The front wall runs T past each side crease, as on the sheet.
    expect(byId('base-front').widthMm).toBeCloseTo(span + 2 * T, 6);
    for (const corner of ['fl', 'fr', 'bl', 'br']) {
      const tab = byId(`base-tab-${corner}`);
      expect(tab.outlinePoints).toHaveLength(3);
      // Point 2 mm short of the floor crease (the bottom edge, y = heightMm).
      expect(Math.max(...tab.outlinePoints!.filter((q) => q.x !== tab.outlinePoints![0].x).map((q) => q.y))).toBeCloseTo(tab.heightMm - 2, 6);
      expect(Math.abs(tab.closedPos[0])).toBeCloseTo(span / 2 - T, 6);
      // Flat, the tab's hinge meets the front or back wall's end.
      expect(Math.abs(tab.closedPos[0]) + Math.abs(tab.foldRig!.flatSlide![2])).toBeCloseTo(span / 2 + T, 6);
    }
    // Lid tabs point toward the roof crease, at the top.
    const lidTab = byId('lid-tab-fl');
    expect(lidTab.outlinePoints!.find((q) => q.x !== lidTab.outlinePoints![0].x)!.y).toBeCloseTo(2, 6);
  });
  for (const templateId of ['cardboard-tuck-carton', 'cardboard-telescope'] as const) {
    for (const T of [1.5, 3]) {
      it(`${templateId} clears the typed inner size exactly at T=${T}`, () => {
        const m = generateBoxModel({ ...base, ...inner, templateId, materialThicknessMm: T, dimensionReference: 'inner' });
        const at = (id: string) => m.panels3D.find((p) => p.id === id)!.closedPos;
        const ids = wallIds[templateId];
        const clearW = at(ids.right)[0] - at(ids.left)[0] - T;
        const clearD = at(ids.front)[2] - at(ids.back)[2] - T;
        expect(Math.abs(clearW - inner.widthMm)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(clearD - inner.depthMm)).toBeLessThanOrEqual(1e-6);
      });
      it(`${templateId} sheet uses single-ply wall spans at T=${T}`, () => {
        const p = { ...base, ...inner, templateId, materialThicknessMm: T, dimensionReference: 'inner' as const };
        const m = generateBoxModel(p);
        const sheet = m.panels2D[0];
        const { widthMm: W, depthMm: D, heightMm: H } = inner;
        if (templateId === 'cardboard-tuck-carton') {
          // The carton exposes only inner-size sub-faces, so assert on the blank: glue flap + 2 W spans + 2 D spans.
          const glueW = Math.max(10, p.glueFlapMm);
          expect(sheet.widthMm).toBeCloseTo(glueW + 2 * (W + T) + 2 * (D + T), 2);
          const tuckH = Math.max(12, p.tuckFlapMm);
          // Each lid runs D between its creases; the front and back run H + T between theirs.
          expect(sheet.heightMm).toBeCloseTo(2 * tuckH + 2 * D + (H + T), 2);
          // The rig's tuck flaps are as wide as the cut: the wall span less a tuckInset each side.
          const tuckW = W + T - 2 * Math.max(0.8, T);
          for (const id of ['top-tuck', 'bot-tuck']) {
            const tuck = m.panels3D.find((q) => q.id === id)!;
            expect(tuck.widthMm).toBeCloseTo(tuckW, 6);
            const xs = tuck.outlinePoints!.map((q) => q.x);
            expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(tuckW, 6);
          }
        } else {
          // Base tray blank: floor span + two wall spans (H + T) on each axis.
          const tray = m.panels2D.find((q) => q.id === 'bottom')!;
          expect(tray.widthMm - 2 * (H + T)).toBeCloseTo(W + T, 2);
          expect(tray.heightMm - 2 * (H + T)).toBeCloseTo(D + T, 2);
        }
      });
    }
  }
  for (const T of [1.5, 3]) {
    it(`telescope lid clears the base by the typed clearance on each side at T=${T}`, () => {
      const p = { ...base, ...inner, templateId: 'cardboard-telescope' as const, materialThicknessMm: T, dimensionReference: 'inner' as const };
      const m = generateBoxModel(p);
      const at = (id: string) => m.panels3D.find((q) => q.id === id)!.closedPos;
      // Lid clear inner span minus the base's outer span is the clearance on both sides.
      const lidInnerW = at('lid-right')[0] - at('lid-left')[0] - T;
      const baseOuterW = at('base-right')[0] - at('base-left')[0] + T;
      const lidInnerD = at('lid-front')[2] - at('lid-back')[2] - T;
      const baseOuterD = at('base-front')[2] - at('base-back')[2] + T;
      expect(Math.abs(lidInnerW - baseOuterW - 2 * p.telescopeClearanceMm)).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(lidInnerD - baseOuterD - 2 * p.telescopeClearanceMm)).toBeLessThanOrEqual(1e-6);
    });
  }
});

describe('outside size', () => {
  it('mailer outer mode cuts the box whose outside is the typed size (120 × 90 × 60, T 3, flaps on)', () => {
    const m = generateBoxModel({ ...base, dimensionReference: 'outer', widthMm: 120, depthMm: 90, heightMm: 60, materialThicknessMm: 3, includeLidFlaps: true });
    expect(m.outerDims.widthMm).toBeCloseTo(120, 6);
    expect(m.outerDims.depthMm).toBeCloseTo(90, 6);
    expect(m.outerDims.heightMm).toBeCloseTo(60, 6);
    const { widthMm, depthMm, heightMm } = m.innerDims;
    const s = computeMailerSpans(m.params, widthMm, depthMm, heightMm);
    expect(s.floorW + s.T).toBeCloseTo(120, 6);
    expect(m.innerDims).toEqual({ widthMm: 96, depthMm: 81, heightMm: 54 });
  });
  it('mailer inner mode reports floorW + T wide, D + 3T deep, H + 2T tall', () => {
    const m = generateBoxModel({ ...base });
    const s = computeMailerSpans(m.params, 110, 80, 55);
    expect(m.outerDims.widthMm).toBeCloseTo(s.floorW + s.T, 6);
    expect(m.outerDims.depthMm).toBeCloseTo(80 + 3 * 3, 6);
    expect(m.outerDims.heightMm).toBeCloseTo(55 + 2 * 3, 6);
  });
  it('finger box outside size is unchanged: inner + 2T, open lid + T on height', () => {
    const p = { ...DEFAULT_BOX_PARAMETERS, widthMm: 120, depthMm: 80, heightMm: 50, materialThicknessMm: 3 };
    expect(generateBoxModel({ ...p, woodLidStyle: 'closed' }).outerDims).toEqual({ widthMm: 126, depthMm: 86, heightMm: 56 });
    expect(generateBoxModel({ ...p, woodLidStyle: 'open' }).outerDims).toEqual({ widthMm: 126, depthMm: 86, heightMm: 53 });
    const outer = generateBoxModel({ ...p, woodLidStyle: 'closed', dimensionReference: 'outer', widthMm: 126, depthMm: 86, heightMm: 56 });
    expect(outer.innerDims).toEqual({ widthMm: 120, depthMm: 80, heightMm: 50 });
  });
  const templates = [
    { category: 'wood-finger', templateId: 'finger-basic' },
    { category: 'wood-finger', templateId: 'finger-clamshell' },
    { category: 'wood-finger', templateId: 'finger-living-hinge' },
    { category: 'wood-finger', templateId: 'finger-organizer' },
    { category: 'cardboard-fold', templateId: 'cardboard-mailer' },
    { category: 'cardboard-fold', templateId: 'cardboard-tuck-carton' },
    { category: 'cardboard-fold', templateId: 'cardboard-telescope' },
    { category: '3d-print', templateId: '3d-snap-box' },
  ] as const;
  for (const t of templates) {
    it(`${t.templateId} outer mode reports the typed outside size`, () => {
      const m = generateBoxModel({ ...DEFAULT_BOX_PARAMETERS, ...t, dimensionReference: 'outer', widthMm: 160, depthMm: 120, heightMm: 90 });
      expect(m.outerDims.widthMm).toBeCloseTo(160, 6);
      expect(m.outerDims.depthMm).toBeCloseTo(120, 6);
      expect(m.outerDims.heightMm).toBeCloseTo(90, 6);
    });
  }
});
